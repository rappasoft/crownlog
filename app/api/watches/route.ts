import { asc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { brands, priceHistory, watches } from "../../../db/schema";
import { canonicalListingUrl } from "../../listing-url";

type Status = "wishlist" | "owned";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isStatus(value: unknown): value is Status {
  return value === "wishlist" || value === "owned";
}

function priceInCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return null;
  return Math.round(amount * 100);
}

function safeListingUrl(value: unknown) {
  const input = clean(value, 1000);
  if (!input) return "";
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
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

function safeDate(value: unknown) {
  const date = clean(value, 10);
  if (!date) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? date : "";
}

function grailScore(value: unknown) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score : 3;
}

export async function GET() {
  try {
    await ensureDatabase();
    const db = getDb();
    const rows = await db.select().from(watches).orderBy(asc(watches.brand), asc(watches.model));
    const historyRows = await db.select().from(priceHistory).orderBy(asc(priceHistory.recordedAt));
    const historyByWatch = historyRows.reduce<Record<string, typeof historyRows>>((groups, point) => {
      (groups[point.watchId] ||= []).push(point);
      return groups;
    }, {});
    return Response.json({ watches: rows.map((watch) => ({ ...watch, priceHistory: historyByWatch[watch.id] || [] })) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const brand = clean(payload.brand, 80);
    const model = clean(payload.model, 120);
    const reference = clean(payload.reference, 100);
    const notes = clean(payload.notes, 500);
    const status = isStatus(payload.status) ? payload.status : "wishlist";
    const score = grailScore(payload.grailScore);
    const currentPriceCents = priceInCents(payload.currentPrice);
    const targetPriceCents = priceInCents(payload.targetPrice);
    const currency = safeCurrency(payload.currency);
    const listingUrl = safeListingUrl(payload.listingUrl);
    const imageUrl = safeImageUrl(payload.imageUrl);
    const movement = clean(payload.movement, 120);
    const caseSize = clean(payload.caseSize, 40);
    const caseMaterial = clean(payload.caseMaterial, 80);
    const dialColor = clean(payload.dialColor, 80);
    const waterResistance = clean(payload.waterResistance, 60);
    const tags = clean(payload.tags, 300);
    const purchasePriceCents = priceInCents(payload.purchasePrice);
    const purchaseDate = safeDate(payload.purchaseDate);
    const lastServiceDate = safeDate(payload.lastServiceDate);
    const nextServiceDate = safeDate(payload.nextServiceDate);

    if (!brand || !model) {
      return Response.json({ error: "Brand and model are required." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    if (listingUrl && payload.allowDuplicate !== true) {
      const canonicalUrl = canonicalListingUrl(listingUrl);
      const existingWatches = await db
        .select({ id: watches.id, brand: watches.brand, model: watches.model, listingUrl: watches.listingUrl })
        .from(watches);
      const duplicate = existingWatches.find((item) => canonicalListingUrl(item.listingUrl) === canonicalUrl);
      if (duplicate) {
        return Response.json(
          { error: `You already saved ${duplicate.brand} ${duplicate.model} from that link.`, duplicate },
          { status: 409 },
        );
      }
    }
    await db.insert(brands).values({ id: crypto.randomUUID(), name: brand }).onConflictDoNothing();
    const [watch] = await db
      .insert(watches)
      .values({ id: crypto.randomUUID(), brand, model, reference, notes, status, grailScore: score, currentPriceCents, targetPriceCents, currency, listingUrl, imageUrl, movement, caseSize, caseMaterial, dialColor, waterResistance, tags, purchasePriceCents, purchaseDate, lastServiceDate, nextServiceDate })
      .returning();
    const history: Array<typeof priceHistory.$inferSelect> = [];
    if (currentPriceCents !== null) {
      const [point] = await db.insert(priceHistory).values({ id: crypto.randomUUID(), watchId: watch.id, priceCents: currentPriceCents }).returning();
      history.push(point);
    }
    return Response.json({ watch: { ...watch, priceHistory: history } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = clean(payload.id, 80);
    if (!id) {
      return Response.json({ error: "A watch is required." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const [before] = await db.select().from(watches).where(eq(watches.id, id)).limit(1);
    if (!before) return Response.json({ error: "Watch not found." }, { status: 404 });
    const updates: Partial<typeof watches.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (isStatus(payload.status)) updates.status = payload.status;
    if (typeof payload.isFavorite === "boolean") updates.isFavorite = before.status === "wishlist" && payload.isFavorite;
    if (payload.status === "owned") updates.isFavorite = false;
    if ("grailScore" in payload) updates.grailScore = grailScore(payload.grailScore);
    if ("currentPrice" in payload) updates.currentPriceCents = priceInCents(payload.currentPrice);
    if ("targetPrice" in payload) updates.targetPriceCents = priceInCents(payload.targetPrice);
    if ("currency" in payload) updates.currency = safeCurrency(payload.currency);
    if ("listingUrl" in payload) updates.listingUrl = safeListingUrl(payload.listingUrl);
    if ("imageUrl" in payload) updates.imageUrl = safeImageUrl(payload.imageUrl);
    if ("brand" in payload) {
      const brand = clean(payload.brand, 80);
      if (brand) {
        updates.brand = brand;
        await db.insert(brands).values({ id: crypto.randomUUID(), name: brand }).onConflictDoNothing();
      }
    }
    if ("model" in payload) {
      const model = clean(payload.model, 120);
      if (model) updates.model = model;
    }
    if ("reference" in payload) updates.reference = clean(payload.reference, 100);
    if ("notes" in payload) updates.notes = clean(payload.notes, 500);
    if ("movement" in payload) updates.movement = clean(payload.movement, 120);
    if ("caseSize" in payload) updates.caseSize = clean(payload.caseSize, 40);
    if ("caseMaterial" in payload) updates.caseMaterial = clean(payload.caseMaterial, 80);
    if ("dialColor" in payload) updates.dialColor = clean(payload.dialColor, 80);
    if ("waterResistance" in payload) updates.waterResistance = clean(payload.waterResistance, 60);
    if ("tags" in payload) updates.tags = clean(payload.tags, 300);
    if ("purchasePrice" in payload) updates.purchasePriceCents = priceInCents(payload.purchasePrice);
    if ("purchaseDate" in payload) updates.purchaseDate = safeDate(payload.purchaseDate);
    if ("lastServiceDate" in payload) updates.lastServiceDate = safeDate(payload.lastServiceDate);
    if ("nextServiceDate" in payload) updates.nextServiceDate = safeDate(payload.nextServiceDate);
    if ("manualMarketPrice" in payload) {
      const manualMarketPriceCents = priceInCents(payload.manualMarketPrice);
      if (manualMarketPriceCents !== null) {
        updates.marketProvider = "manual";
        updates.marketModelId = "";
        updates.marketModelName = "Manual estimate";
        updates.marketPriceCents = manualMarketPriceCents;
        updates.marketLowCents = null;
        updates.marketHighCents = null;
        updates.marketSampleSize = 0;
        updates.marketConfidence = "manual";
        updates.marketCurrency = safeCurrency(payload.marketCurrency || before.marketCurrency || before.currency);
        updates.marketCheckedAt = new Date().toISOString();
        updates.marketCheckStatus = "Manual market estimate";
      } else if (before.marketProvider === "manual") {
        updates.marketProvider = "";
        updates.marketModelId = "";
        updates.marketModelName = "";
        updates.marketPriceCents = null;
        updates.marketLowCents = null;
        updates.marketHighCents = null;
        updates.marketSampleSize = 0;
        updates.marketConfidence = "";
        updates.marketCheckedAt = null;
        updates.marketCheckStatus = "";
      }
    }
    const identityChanged = (typeof updates.brand === "string" && updates.brand !== before.brand)
      || (typeof updates.model === "string" && updates.model !== before.model)
      || (typeof updates.reference === "string" && updates.reference !== before.reference);
    if (identityChanged && before.marketProvider === "the-watch-info" && !("manualMarketPrice" in payload && priceInCents(payload.manualMarketPrice) !== null)) {
      updates.marketProvider = "";
      updates.marketModelId = "";
      updates.marketModelName = "";
      updates.marketPriceCents = null;
      updates.marketLowCents = null;
      updates.marketHighCents = null;
      updates.marketSampleSize = 0;
      updates.marketConfidence = "";
      updates.marketCheckedAt = null;
      updates.marketCheckStatus = "Watch details changed; confirm a new market match.";
    }
    if (payload.recordWear === true) {
      updates.wearCount = before.wearCount + 1;
      updates.lastWornAt = new Date().toISOString();
    }
    const [watch] = await db
      .update(watches)
      .set(updates)
      .where(eq(watches.id, id))
      .returning();

    const newPrice = "currentPrice" in payload ? priceInCents(payload.currentPrice) : before.currentPriceCents;
    if (newPrice !== null && newPrice !== before.currentPriceCents) {
      await db.insert(priceHistory).values({ id: crypto.randomUUID(), watchId: id, priceCents: newPrice });
    }
    const history = await db.select().from(priceHistory).where(eq(priceHistory.watchId, id)).orderBy(asc(priceHistory.recordedAt));
    return Response.json({ watch: { ...watch, priceHistory: history } });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "A watch is required." }, { status: 400 });

    await ensureDatabase();
    const db = getDb();
    await db.delete(priceHistory).where(eq(priceHistory.watchId, id));
    const [watch] = await db.delete(watches).where(eq(watches.id, id)).returning({ id: watches.id });
    if (!watch) return Response.json({ error: "Watch not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
