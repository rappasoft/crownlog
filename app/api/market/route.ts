import { asc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { priceHistory, watches } from "../../../db/schema";
import { cleanMarketValue, fetchProviderModel, marketCents, normalizedMarketValue } from "./provider";

const CACHE_MS = 24 * 60 * 60 * 1000;

async function watchWithHistory(id: string) {
  const db = getDb();
  const [watch] = await db.select().from(watches).where(eq(watches.id, id)).limit(1);
  if (!watch) return null;
  const history = await db.select().from(priceHistory).where(eq(priceHistory.watchId, id)).orderBy(asc(priceHistory.recordedAt));
  return { ...watch, priceHistory: history };
}

function confidence(sample: number, watchReference: string, providerReference: string) {
  const exactReference = Boolean(watchReference && providerReference && normalizedMarketValue(watchReference) === normalizedMarketValue(providerReference));
  if (sample >= 10 && exactReference) return "high";
  if (sample >= 5) return "medium";
  return "low";
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = cleanMarketValue(payload.action, 20);
    if (action !== "confirm" && action !== "refresh" && action !== "clear") {
      return Response.json({ error: "Unsupported market-data action." }, { status: 400 });
    }

    const id = cleanMarketValue(payload.id, 80);
    if (!id) return Response.json({ error: "A watch is required." }, { status: 400 });
    await ensureDatabase();
    const db = getDb();
    const [watch] = await db.select().from(watches).where(eq(watches.id, id)).limit(1);
    if (!watch) return Response.json({ error: "Watch not found." }, { status: 404 });

    if (action === "clear") {
      await db.update(watches).set({
        marketProvider: "", marketModelId: "", marketModelName: "", marketPriceCents: null,
        marketLowCents: null, marketHighCents: null, marketSampleSize: 0, marketConfidence: "",
        marketCheckedAt: null, marketCheckStatus: "", updatedAt: new Date().toISOString(),
      }).where(eq(watches.id, id));
      return Response.json({ watch: await watchWithHistory(id) });
    }

    const providerModelId = action === "confirm" ? cleanMarketValue(payload.marketModelId, 40) : watch.marketModelId;
    if (!providerModelId || !/^\d+$/.test(providerModelId)) {
      return Response.json({ error: "Find and confirm a market match first." }, { status: 400 });
    }
    if (action === "refresh" && payload.force !== true && watch.marketCheckedAt && Date.now() - Date.parse(watch.marketCheckedAt) < CACHE_MS) {
      return Response.json({ watch: { ...watch, priceHistory: await db.select().from(priceHistory).where(eq(priceHistory.watchId, id)).orderBy(asc(priceHistory.recordedAt)) }, cached: true });
    }

    const raw = await fetchProviderModel(providerModelId);
    const guide = raw?.price_guide;
    const model = raw?.model;
    const median = marketCents(guide?.median);
    if (median === null) throw new Error("That market match does not have enough pricing data yet.");
    const sample = Number.isInteger(guide?.sample) ? Number(guide?.sample) : 0;
    const checkedAt = new Date().toISOString();
    await db.update(watches).set({
      marketProvider: "the-watch-info",
      marketModelId: providerModelId,
      marketModelName: cleanMarketValue(model?.name, 160) || watch.model,
      marketPriceCents: median,
      marketLowCents: marketCents(guide?.p25),
      marketHighCents: marketCents(guide?.p75),
      marketSampleSize: sample,
      marketConfidence: confidence(sample, watch.reference, cleanMarketValue(model?.reference, 100)),
      marketCurrency: "USD",
      marketCheckedAt: checkedAt,
      marketCheckStatus: "Market estimate updated",
      updatedAt: checkedAt,
    }).where(eq(watches.id, id));
    return Response.json({ watch: await watchWithHistory(id), cached: false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn’t update the market estimate." }, { status: 422 });
  }
}
