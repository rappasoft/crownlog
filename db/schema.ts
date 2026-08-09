import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const brands = sqliteTable(
  "brands",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    notes: text("notes").notNull().default(""),
    websiteUrl: text("website_url").notNull().default(""),
    category: text("category", { enum: ["brand", "retailer"] }).notNull().default("brand"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_brands_name").on(table.name)],
);

export const watches = sqliteTable(
  "watches",
  {
    id: text("id").primaryKey(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: ["wishlist", "owned"] }).notNull().default("wishlist"),
    grailScore: integer("grail_score").notNull().default(3),
    currentPriceCents: integer("current_price_cents"),
    targetPriceCents: integer("target_price_cents"),
    currency: text("currency").notNull().default("USD"),
    listingUrl: text("listing_url").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    movement: text("movement").notNull().default(""),
    caseSize: text("case_size").notNull().default(""),
    caseMaterial: text("case_material").notNull().default(""),
    dialColor: text("dial_color").notNull().default(""),
    waterResistance: text("water_resistance").notNull().default(""),
    tags: text("tags").notNull().default(""),
    purchasePriceCents: integer("purchase_price_cents"),
    purchaseDate: text("purchase_date").notNull().default(""),
    lastServiceDate: text("last_service_date").notNull().default(""),
    nextServiceDate: text("next_service_date").notNull().default(""),
    wearCount: integer("wear_count").notNull().default(0),
    lastWornAt: text("last_worn_at"),
    lastPriceCheckAt: text("last_price_check_at"),
    lastPriceCheckStatus: text("last_price_check_status").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_watches_brand").on(table.brand), index("idx_watches_status").on(table.status)],
);

export const priceHistory = sqliteTable(
  "price_history",
  {
    id: text("id").primaryKey(),
    watchId: text("watch_id").notNull().references(() => watches.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_price_history_watch_id").on(table.watchId)],
);
