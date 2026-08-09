import { ensureDatabase, getDb } from "../../../db";
import { brands, priceHistory, watches } from "../../../db/schema";

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const cents = Number(value);
  return Number.isInteger(cents) && cents >= 0 && cents <= 1_000_000_000 ? cents : null;
}

function integer(value: unknown, fallback = 0, maximum = 1_000_000) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum ? number : fallback;
}

function date(value: unknown) {
  const input = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : "";
}

function timestamp(value: unknown) {
  const input = clean(value, 40);
  return input && !Number.isNaN(Date.parse(input)) ? input : new Date().toISOString();
}

function nullableTimestamp(value: unknown) {
  const input = clean(value, 40);
  return input && !Number.isNaN(Date.parse(input)) ? input : null;
}

function webUrl(value: unknown, httpsOnly = false) {
  const input = clean(value, 1_500);
  if (!input) return "";
  try {
    const parsed = new URL(input);
    return (parsed.protocol === "https:" || (!httpsOnly && parsed.protocol === "http:")) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const backup = (await request.json()) as Record<string, unknown>;
    if (backup.format !== "crownlog-backup" || backup.version !== 1) {
      return Response.json({ error: "That file is not a supported Crownlog backup." }, { status: 400 });
    }
    if (!Array.isArray(backup.brands) || !Array.isArray(backup.watches) || backup.brands.length > 2_000 || backup.watches.length > 5_000) {
      return Response.json({ error: "That backup is invalid or too large." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    let restoredBrands = 0;
    let restoredWatches = 0;
    let restoredPrices = 0;

    for (const item of backup.brands as Array<Record<string, unknown>>) {
      const id = clean(item.id, 80) || crypto.randomUUID();
      const name = clean(item.name, 80);
      if (!name) continue;
      await db.insert(brands).values({
        id,
        name,
        notes: clean(item.notes, 500),
        websiteUrl: webUrl(item.websiteUrl),
        category: item.category === "retailer" ? "retailer" : "brand",
        createdAt: timestamp(item.createdAt),
      }).onConflictDoNothing();
      restoredBrands += 1;
    }

    for (const item of backup.watches as Array<Record<string, unknown>>) {
      const id = clean(item.id, 80) || crypto.randomUUID();
      const brand = clean(item.brand, 80);
      const model = clean(item.model, 120);
      if (!brand || !model) continue;
      await db.insert(brands).values({ id: crypto.randomUUID(), name: brand }).onConflictDoNothing();
      const restoredWatch = {
        id,
        brand,
        model,
        reference: clean(item.reference, 100),
        notes: clean(item.notes, 500),
        status: item.status === "owned" ? "owned" as const : "wishlist" as const,
        grailScore: Math.min(5, Math.max(1, integer(item.grailScore, 3, 5))),
        currentPriceCents: optionalCents(item.currentPriceCents),
        targetPriceCents: optionalCents(item.targetPriceCents),
        currency: /^[A-Z]{3}$/.test(clean(item.currency, 3).toUpperCase()) ? clean(item.currency, 3).toUpperCase() : "USD",
        listingUrl: webUrl(item.listingUrl),
        imageUrl: webUrl(item.imageUrl, true),
        movement: clean(item.movement, 120),
        caseSize: clean(item.caseSize, 40),
        caseMaterial: clean(item.caseMaterial, 80),
        dialColor: clean(item.dialColor, 80),
        waterResistance: clean(item.waterResistance, 60),
        tags: clean(item.tags, 300),
        purchasePriceCents: optionalCents(item.purchasePriceCents),
        purchaseDate: date(item.purchaseDate),
        lastServiceDate: date(item.lastServiceDate),
        nextServiceDate: date(item.nextServiceDate),
        wearCount: integer(item.wearCount),
        lastWornAt: nullableTimestamp(item.lastWornAt),
        lastPriceCheckAt: nullableTimestamp(item.lastPriceCheckAt),
        lastPriceCheckStatus: clean(item.lastPriceCheckStatus, 200),
        createdAt: timestamp(item.createdAt),
        updatedAt: timestamp(item.updatedAt),
      };
      await db.insert(watches).values(restoredWatch).onConflictDoUpdate({ target: watches.id, set: restoredWatch });
      restoredWatches += 1;

      const history = Array.isArray(item.priceHistory) ? item.priceHistory.slice(0, 1_000) as Array<Record<string, unknown>> : [];
      for (const point of history) {
        const priceCents = optionalCents(point.priceCents);
        if (priceCents === null) continue;
        await db.insert(priceHistory).values({
          id: clean(point.id, 80) || crypto.randomUUID(),
          watchId: id,
          priceCents,
          recordedAt: timestamp(point.recordedAt),
        }).onConflictDoNothing();
        restoredPrices += 1;
      }
    }

    return Response.json({ restored: { brands: restoredBrands, watches: restoredWatches, prices: restoredPrices } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn’t restore that backup." }, { status: 500 });
  }
}
