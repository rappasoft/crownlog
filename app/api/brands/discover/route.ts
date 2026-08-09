import { asc, desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { brandDiscoveries, brands, priceHistory, watches } from "../../../../db/schema";
import { canonicalListingUrl } from "../../../listing-url";
import { extractProductMetadata, fetchProductPage } from "../../product-metadata";
import { discoverProductUrls, isLikelyWatchProduct } from "./discovery";

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
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
    if (!brandId) return Response.json({ error: "A brand is required." }, { status: 400 });
    await ensureDatabase();
    const state = await brandState(brandId);
    if (!state) return Response.json({ error: "Brand not found." }, { status: 404 });
    return Response.json(state);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const brandId = clean(payload.brandId, 80);
    if (!brandId) return Response.json({ error: "A brand is required." }, { status: 400 });
    await ensureDatabase();
    const db = getDb();
    const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });
    if (!brand.websiteUrl) return Response.json({ error: "Add the brand’s official website before fetching watches." }, { status: 400 });

    const productUrls = await discoverProductUrls(brand.websiteUrl);
    if (!productUrls.length) {
      return Response.json({ error: "No product pages were found in this brand’s public sitemap. The site may need a custom adapter." }, { status: 422 });
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
    const shuffled = unseen.map((url) => ({ url, order: Math.random() })).sort((a, b) => a.order - b.order).map((item) => item.url);
    let scanned = 0;
    let found = 0;

    for (let offset = 0; offset < Math.min(shuffled.length, 18) && found < 8; offset += 3) {
      const batch = shuffled.slice(offset, offset + 3);
      const products = await Promise.all(batch.map(async (url) => {
        try {
          const page = await fetchProductPage(new URL(url));
          return extractProductMetadata(page.html, page.finalUrl);
        } catch {
          return null;
        }
      }));
      scanned += batch.length;
      for (const product of products) {
        if (!product?.name || !isLikelyWatchProduct(product) || (!product.imageUrl && product.priceCents === null && !product.reference)) continue;
        const canonicalUrl = canonicalListingUrl(product.listingUrl);
        if (!canonicalUrl || seenUrls.has(canonicalUrl)) continue;
        await db.insert(brandDiscoveries).values({
          id: crypto.randomUUID(),
          brandId,
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
        if (found >= 8) break;
      }
    }

    const state = await brandState(brandId);
    return Response.json({ ...state, fetch: { found, scanned, available: unseen.length } });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 422 });
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
    const existingWatches = await db.select().from(watches);
    let watch = existingWatches.find((item) => canonicalListingUrl(item.listingUrl) === discovery.canonicalUrl);
    let alreadySaved = Boolean(watch);
    if (!watch) {
      [watch] = await db.insert(watches).values({
        id: crypto.randomUUID(),
        brand: brand.name,
        model: discovery.name,
        reference: discovery.reference,
        status: "wishlist",
        currentPriceCents: discovery.priceCents,
        currency: discovery.currency,
        listingUrl: discovery.sourceUrl,
        imageUrl: discovery.imageUrl,
      }).returning();
      if (discovery.priceCents !== null) {
        await db.insert(priceHistory).values({ id: crypto.randomUUID(), watchId: watch.id, priceCents: discovery.priceCents });
      }
      alreadySaved = false;
    }
    const [updated] = await db.update(brandDiscoveries).set({ status: "kept", updatedAt: new Date().toISOString() }).where(eq(brandDiscoveries.id, id)).returning();
    return Response.json({ discovery: updated, watch, alreadySaved });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
