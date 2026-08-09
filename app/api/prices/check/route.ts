import { asc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../../db";
import { priceHistory, watches } from "../../../../db/schema";
import { extractProductMetadata, fetchProductPage, publicProductUrl } from "../../product-metadata";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let watchId = "";
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    watchId = clean(payload.id, 80);
    if (!watchId) return Response.json({ error: "A watch is required." }, { status: 400 });

    await ensureDatabase();
    const db = getDb();
    const [watch] = await db.select().from(watches).where(eq(watches.id, watchId)).limit(1);
    if (!watch) return Response.json({ error: "Watch not found." }, { status: 404 });

    const productUrl = publicProductUrl(payload.listingUrl || watch.listingUrl);
    const page = await fetchProductPage(productUrl);
    const product = extractProductMetadata(page.html, page.finalUrl);
    if (product.priceCents === null) throw new Error("No product price was exposed on that page. Enter it manually instead.");

    const checkedAt = new Date().toISOString();
    const changed = watch.currentPriceCents !== product.priceCents || watch.currency !== product.currency;
    const [updatedWatch] = await db
      .update(watches)
      .set({
        currentPriceCents: product.priceCents,
        currency: product.currency,
        listingUrl: product.listingUrl,
        imageUrl: watch.imageUrl || product.imageUrl,
        lastPriceCheckAt: checkedAt,
        lastPriceCheckStatus: "Price found automatically",
        updatedAt: checkedAt,
      })
      .where(eq(watches.id, watchId))
      .returning();
    if (changed) {
      await db.insert(priceHistory).values({ id: crypto.randomUUID(), watchId, priceCents: product.priceCents });
    }
    const history = await db.select().from(priceHistory).where(eq(priceHistory.watchId, watchId)).orderBy(asc(priceHistory.recordedAt));
    return Response.json({ watch: { ...updatedWatch, priceHistory: history }, changed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn’t check that listing.";
    if (watchId) {
      try {
        await ensureDatabase();
        await getDb()
          .update(watches)
          .set({ lastPriceCheckAt: new Date().toISOString(), lastPriceCheckStatus: message.slice(0, 180) })
          .where(eq(watches.id, watchId));
      } catch {
        // Preserve the useful retailer error when recording the failed attempt also fails.
      }
    }
    return Response.json({ error: message }, { status: 422 });
  }
}
