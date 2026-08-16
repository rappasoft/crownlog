import { asc, desc, eq, sql } from "drizzle-orm";
import { canonicalBrandName, ensureDatabase, getDb } from "../../../../db";
import { brandDiscoveries, brands, priceHistory, watches } from "../../../../db/schema";
import { canonicalListingUrl } from "../../../listing-url";
import { extractProductMetadata, fetchProductPage } from "../../product-metadata";
import { discoverCollectionProductUrls, discoverProductUrls, isLikelyWatchProduct } from "./discovery";

const DISCOVERY_JOB_TIMEOUT_MS = 35000;
const DISCOVERY_PAGE_OPTIONS = { attempts: 1, timeoutMs: 7000 } as const;

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
function priceInCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return null;
  return Math.round(amount * 100);
}

function safeImageUrl(value: unknown) {
  const input = clean(value, 1500);
  if (!input) return "";
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function safeCurrency(value: unknown) {
  const currency = clean(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

function grailScore(value: unknown) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score : 3;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function normalizedHostname(value: string) {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

async function brandState(brandId: string) {
  const db = getDb();
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return null;
  const discoveries = await db.select().from(brandDiscoveries).where(eq(brandDiscoveries.brandId, brandId)).orderBy(asc(brandDiscoveries.status), desc(brandDiscoveries.createdAt));
  const savedWatches = await db.select().from(watches).where(eq(watches.brand, brand.name)).orderBy(asc(watches.model));
  return { brand, discoveries, savedWatches };
}

export async function GET(request: Request) {
  try {
    const brandId = clean(new URL(request.url).searchParams.get("brandId"), 80);
    await ensureDatabase();
    if (!brandId) {
      const db = getDb();
      const discoveries = await db.select({
        id: brandDiscoveries.id,
        brandId: brandDiscoveries.brandId,
        parentBrandName: brands.name,
        productBrand: brandDiscoveries.productBrand,
        name: brandDiscoveries.name,
        reference: brandDiscoveries.reference,
        imageUrl: brandDiscoveries.imageUrl,
        priceCents: brandDiscoveries.priceCents,
        currency: brandDiscoveries.currency,
        sourceUrl: brandDiscoveries.sourceUrl,
        canonicalUrl: brandDiscoveries.canonicalUrl,
        status: brandDiscoveries.status,
        createdAt: brandDiscoveries.createdAt,
        updatedAt: brandDiscoveries.updatedAt,
      }).from(brandDiscoveries)
        .innerJoin(brands, eq(brandDiscoveries.brandId, brands.id))
        .where(eq(brandDiscoveries.status, "draft"))
        .orderBy(desc(brandDiscoveries.createdAt));
      return Response.json({ discoveries: discoveries.map(({ parentBrandName, productBrand, ...discovery }) => ({
        ...discovery,
        brandName: productBrand || parentBrandName,
      })) });
    }
    const state = await brandState(brandId);
    if (!state) return Response.json({ error: "Brand not found." }, { status: 404 });
    return Response.json(state);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const brandId = clean(payload.brandId, 80);
    const collectionUrl = clean(payload.collectionUrl, 1500);
    if (!brandId) return Response.json({ error: "A brand is required." }, { status: 400 });
    await ensureDatabase();
    const db = getDb();
    const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });
    if (!brand.websiteUrl && !collectionUrl) return Response.json({ error: "Add a catalog website before fetching watches." }, { status: 400 });

    if (collectionUrl) {
      try {
        const publicCollectionUrl = publicProductUrl(collectionUrl);
        if (brand.websiteUrl && normalizedHostname(publicCollectionUrl.toString()) !== normalizedHostname(brand.websiteUrl)) {
          return Response.json({ error: `Use a collection page from ${brand.name}’s saved website.` }, { status: 400 });
        }
        if (!brand.websiteUrl) {
          const collectionStorefront = new URL("/", publicCollectionUrl).toString();
          await db.update(brands).set({ websiteUrl: collectionStorefront, updatedAt: new Date().toISOString() }).where(eq(brands.id, brandId));
        }
      } catch {
        return Response.json({ error: "Enter a valid public HTTPS collection page." }, { status: 400 });
      }
    }

    const controller = new AbortController();
    deadline = setTimeout(() => controller.abort(), DISCOVERY_JOB_TIMEOUT_MS);
    const collectionMode = Boolean(collectionUrl);
    const productUrls = collectionMode
      ? await discoverCollectionProductUrls(collectionUrl, controller.signal)
      : await discoverProductUrls(brand.websiteUrl, controller.signal, { retailer: brand.category === "retailer" });
    if (!productUrls.length) {
      return Response.json({ error: collectionMode
        ? "No individual watch links were found on that collection page. The site may load its catalog with JavaScript or need a custom adapter."
        : "No product pages were found in this catalog’s public sitemap. The site may need a custom adapter." }, { status: 422 });
    }

    const [seenDiscoveries, savedWatches] = await Promise.all([
      db.select({ canonicalUrl: brandDiscoveries.canonicalUrl }).from(brandDiscoveries).where(eq(brandDiscoveries.brandId, brandId)),
      db.select({ listingUrl: watches.listingUrl }).from(watches),
    ]);
    const seenUrls = new Set([
      ...seenDiscoveries.map((item) => item.canonicalUrl),
      ...savedWatches.map((item) => canonicalListingUrl(item.listingUrl)).filter(Boolean),
    ]);
    const unseen = productUrls.filter((url) => !seenUrls.has(canonicalListingUrl(url)));
    const candidates = collectionMode
      ? unseen
      : unseen.map((url) => ({ url, order: Math.random() })).sort((a, b) => a.order - b.order).map((item) => item.url);
    const scanLimit = collectionMode ? 60 : 18;
    const resultLimit = collectionMode ? 60 : 8;
    const batchSize = collectionMode ? 5 : 3;
    let scanned = 0;
    let found = 0;

    for (let offset = 0; offset < Math.min(candidates.length, scanLimit) && found < resultLimit && !controller.signal.aborted; offset += batchSize) {
      const batch = candidates.slice(offset, offset + batchSize);
      const products = await Promise.all(batch.map(async (url) => {
        try {
          const page = await fetchProductPage(new URL(url), { ...DISCOVERY_PAGE_OPTIONS, signal: controller.signal });
          return extractProductMetadata(page.html, page.finalUrl);
        } catch {
          return null;
        }
      }));
      scanned += batch.length;
      for (const product of products) {
        if (!product?.name || !isLikelyWatchProduct(product) || (!product.imageUrl && product.priceCents === null && !product.reference)) continue;
        const metadataBrand = clean(product.brand, 80);
        if (brand.category === "retailer" && (!metadataBrand || metadataBrand.toLowerCase() === brand.name.toLowerCase())) continue;
        let productBrand = brand.name;
        if (brand.category === "retailer") {
          const [knownBrand] = await db.select({ name: brands.name }).from(brands)
            .where(sql`lower(${brands.name}) = lower(${metadataBrand})`).limit(1);
          productBrand = knownBrand?.name || metadataBrand;
        }
        const canonicalUrl = canonicalListingUrl(product.listingUrl);
        if (!canonicalUrl || seenUrls.has(canonicalUrl)) continue;
        await db.insert(brandDiscoveries).values({
          id: crypto.randomUUID(),
          brandId,
          productBrand,
          name: product.name,
          reference: product.reference,
          imageUrl: product.imageUrl,
          priceCents: product.priceCents,
          currency: product.currency,
          sourceUrl: product.listingUrl,
          canonicalUrl,
        }).onConflictDoNothing();
        seenUrls.add(canonicalUrl);
        found += 1;
        if (found >= resultLimit) break;
      }
    }

    const state = await brandState(brandId);
    return Response.json({ ...state, fetch: { found, scanned, available: unseen.length, timedOut: controller.signal.aborted, mode: collectionMode ? "collection" : "catalog" } });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 422 });
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = clean(payload.id, 80);
    const action = clean(payload.action, 20);
    if (!id || (action !== "keep" && action !== "dismiss")) {
      return Response.json({ error: "Choose whether to keep or dismiss this watch." }, { status: 400 });
    }
    await ensureDatabase();
    const db = getDb();
    const [discovery] = await db.select().from(brandDiscoveries).where(eq(brandDiscoveries.id, id)).limit(1);
    if (!discovery) return Response.json({ error: "Draft watch not found." }, { status: 404 });

    if (action === "dismiss") {
      const [updated] = await db.update(brandDiscoveries).set({ status: "dismissed", updatedAt: new Date().toISOString() }).where(eq(brandDiscoveries.id, id)).returning();
      return Response.json({ discovery: updated });
    }

    const [brand] = await db.select().from(brands).where(eq(brands.id, discovery.brandId)).limit(1);
    if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });
    const details = payload.details && typeof payload.details === "object" && !Array.isArray(payload.details)
      ? payload.details as Record<string, unknown>
      : {};
    const watchBrand = await canonicalBrandName(clean(details.brand, 80) || discovery.productBrand || brand.name);
    const model = clean(details.model, 120) || discovery.name;
    const reference = "reference" in details ? clean(details.reference, 100) : discovery.reference;
    const imageUrl = "imageUrl" in details ? safeImageUrl(details.imageUrl) : discovery.imageUrl;
    const currentPriceCents = "currentPrice" in details ? priceInCents(details.currentPrice) : discovery.priceCents;
    const currency = "currency" in details ? safeCurrency(details.currency) : discovery.currency;
    if (!model) return Response.json({ error: "A model name is required." }, { status: 400 });

    const existingWatches = await db.select().from(watches);
    let watch = existingWatches.find((item) => canonicalListingUrl(item.listingUrl) === discovery.canonicalUrl);
    let alreadySaved = Boolean(watch);
    if (!watch) {
      [watch] = await db.insert(watches).values({
        id: crypto.randomUUID(),
        brand: watchBrand,
        model,
        reference,
        notes: clean(details.notes, 500),
        status: "wishlist",
        isFavorite: details.isFavorite === true,
        grailScore: grailScore(details.grailScore),
        currentPriceCents,
        targetPriceCents: priceInCents(details.targetPrice),
        currency,
        listingUrl: discovery.sourceUrl,
        imageUrl,
        movement: clean(details.movement, 120),
        caseSize: clean(details.caseSize, 40),
        caseMaterial: clean(details.caseMaterial, 80),
        dialColor: clean(details.dialColor, 80),
        waterResistance: clean(details.waterResistance, 60),
        tags: clean(details.tags, 300),
      }).returning();
      if (currentPriceCents !== null) {
        await db.insert(priceHistory).values({ id: crypto.randomUUID(), watchId: watch.id, priceCents: currentPriceCents });
      }
      alreadySaved = false;
    }
    const [updated] = await db.update(brandDiscoveries).set({
      name: model,
      productBrand: watchBrand,
      reference,
      imageUrl,
      priceCents: currentPriceCents,
      currency,
      status: "kept",
      updatedAt: new Date().toISOString(),
    }).where(eq(brandDiscoveries.id, id)).returning();
    return Response.json({ discovery: updated, watch, alreadySaved });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
