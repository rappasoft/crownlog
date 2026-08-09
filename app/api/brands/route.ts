import { asc, eq, sql } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { brandDiscoveries, brands } from "../../../db/schema";

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function safeWebsiteUrl(value: unknown) {
  const input = clean(value, 1000);
  if (!input) return "";
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function GET() {
  try {
    await ensureDatabase();
    const db = getDb();
    const rows = await db.select().from(brands).orderBy(asc(brands.name));
    return Response.json({ brands: rows });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const name = clean(payload.name, 80);
    const notes = clean(payload.notes, 300);
    const websiteUrl = safeWebsiteUrl(payload.websiteUrl);
    const category = payload.category === "retailer" ? "retailer" : "brand";
    if (!name) return Response.json({ error: "Brand name is required." }, { status: 400 });

    await ensureDatabase();
    const db = getDb();
    const [existing] = await db.select().from(brands).where(sql`lower(${brands.name}) = lower(${name})`).limit(1);
    if (existing) {
      const [brand] = await db.update(brands).set({ notes: notes || existing.notes, websiteUrl: websiteUrl || existing.websiteUrl, category }).where(eq(brands.id, existing.id)).returning();
      return Response.json({ brand });
    }

    const [brand] = await db.insert(brands).values({ id: crypto.randomUUID(), name, notes, websiteUrl, category }).returning();
    return Response.json({ brand }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = clean(payload.id, 80);
    const name = clean(payload.name, 80);
    const notes = clean(payload.notes, 300);
    const websiteUrl = safeWebsiteUrl(payload.websiteUrl);
    const category = payload.category === "retailer" ? "retailer" : "brand";
    if (!id || !name) return Response.json({ error: "Brand name is required." }, { status: 400 });

    await ensureDatabase();
    const db = getDb();
    const [duplicate] = await db.select().from(brands).where(sql`lower(${brands.name}) = lower(${name})`).limit(1);
    if (duplicate && duplicate.id !== id) {
      return Response.json({ error: "That brand is already in your directory." }, { status: 409 });
    }

    const [brand] = await db
      .update(brands)
      .set({ name, notes, websiteUrl, category })
      .where(eq(brands.id, id))
      .returning();
    if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });
    return Response.json({ brand });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = clean(payload.id, 80);
    if (!id) return Response.json({ error: "A brand is required." }, { status: 400 });

    await ensureDatabase();
    const db = getDb();
    await db.delete(brandDiscoveries).where(eq(brandDiscoveries.brandId, id));
    const [brand] = await db.delete(brands).where(eq(brands.id, id)).returning({ id: brands.id });
    if (!brand) return Response.json({ error: "Brand not found." }, { status: 404 });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
