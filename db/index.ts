import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "The local SQLite binding `DB` is unavailable. Start Crownlog with `npm run dev` so the project-local database is mounted from the data directory."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function ensureDatabase() {
  if (!env.DB) throw new Error("The project-local watch database is unavailable.");

  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '' NOT NULL,
      website_url TEXT DEFAULT '' NOT NULL,
      category TEXT DEFAULT 'brand' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_name ON brands (name)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS watches (
      id TEXT PRIMARY KEY NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      reference TEXT DEFAULT '' NOT NULL,
      notes TEXT DEFAULT '' NOT NULL,
      status TEXT DEFAULT 'wishlist' NOT NULL,
      grail_score INTEGER DEFAULT 3 NOT NULL,
      current_price_cents INTEGER,
      target_price_cents INTEGER,
      currency TEXT DEFAULT 'USD' NOT NULL,
      listing_url TEXT DEFAULT '' NOT NULL,
      image_url TEXT DEFAULT '' NOT NULL,
      movement TEXT DEFAULT '' NOT NULL,
      case_size TEXT DEFAULT '' NOT NULL,
      case_material TEXT DEFAULT '' NOT NULL,
      dial_color TEXT DEFAULT '' NOT NULL,
      water_resistance TEXT DEFAULT '' NOT NULL,
      tags TEXT DEFAULT '' NOT NULL,
      purchase_price_cents INTEGER,
      purchase_date TEXT DEFAULT '' NOT NULL,
      last_service_date TEXT DEFAULT '' NOT NULL,
      next_service_date TEXT DEFAULT '' NOT NULL,
      wear_count INTEGER DEFAULT 0 NOT NULL,
      last_worn_at TEXT,
      last_price_check_at TEXT,
      last_price_check_status TEXT DEFAULT '' NOT NULL,
      market_provider TEXT DEFAULT '' NOT NULL,
      market_model_id TEXT DEFAULT '' NOT NULL,
      market_model_name TEXT DEFAULT '' NOT NULL,
      market_price_cents INTEGER,
      market_low_cents INTEGER,
      market_high_cents INTEGER,
      market_sample_size INTEGER DEFAULT 0 NOT NULL,
      market_confidence TEXT DEFAULT '' NOT NULL,
      market_currency TEXT DEFAULT 'USD' NOT NULL,
      market_checked_at TEXT,
      market_check_status TEXT DEFAULT '' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_watches_brand ON watches (brand)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_watches_status ON watches (status)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY NOT NULL,
      watch_id TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      price_cents INTEGER NOT NULL,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_price_history_watch_id ON price_history (watch_id)"),
  ]);

  const columns = await env.DB.prepare("PRAGMA table_info(watches)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const upgrades = [];
  if (!names.has("grail_score")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN grail_score INTEGER DEFAULT 3 NOT NULL"));
  if (!names.has("current_price_cents")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN current_price_cents INTEGER"));
  if (!names.has("target_price_cents")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN target_price_cents INTEGER"));
  if (!names.has("currency")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN currency TEXT DEFAULT 'USD' NOT NULL"));
  if (!names.has("listing_url")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN listing_url TEXT DEFAULT '' NOT NULL"));
  if (!names.has("image_url")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN image_url TEXT DEFAULT '' NOT NULL"));
  if (!names.has("movement")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN movement TEXT DEFAULT '' NOT NULL"));
  if (!names.has("case_size")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN case_size TEXT DEFAULT '' NOT NULL"));
  if (!names.has("case_material")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN case_material TEXT DEFAULT '' NOT NULL"));
  if (!names.has("dial_color")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN dial_color TEXT DEFAULT '' NOT NULL"));
  if (!names.has("water_resistance")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN water_resistance TEXT DEFAULT '' NOT NULL"));
  if (!names.has("tags")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN tags TEXT DEFAULT '' NOT NULL"));
  if (!names.has("purchase_price_cents")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN purchase_price_cents INTEGER"));
  if (!names.has("purchase_date")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN purchase_date TEXT DEFAULT '' NOT NULL"));
  if (!names.has("last_service_date")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN last_service_date TEXT DEFAULT '' NOT NULL"));
  if (!names.has("next_service_date")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN next_service_date TEXT DEFAULT '' NOT NULL"));
  if (!names.has("wear_count")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN wear_count INTEGER DEFAULT 0 NOT NULL"));
  if (!names.has("last_worn_at")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN last_worn_at TEXT"));
  if (!names.has("last_price_check_at")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN last_price_check_at TEXT"));
  if (!names.has("last_price_check_status")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN last_price_check_status TEXT DEFAULT '' NOT NULL"));
  if (!names.has("market_provider")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_provider TEXT DEFAULT '' NOT NULL"));
  if (!names.has("market_model_id")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_model_id TEXT DEFAULT '' NOT NULL"));
  if (!names.has("market_model_name")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_model_name TEXT DEFAULT '' NOT NULL"));
  if (!names.has("market_price_cents")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_price_cents INTEGER"));
  if (!names.has("market_low_cents")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_low_cents INTEGER"));
  if (!names.has("market_high_cents")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_high_cents INTEGER"));
  if (!names.has("market_sample_size")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_sample_size INTEGER DEFAULT 0 NOT NULL"));
  if (!names.has("market_confidence")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_confidence TEXT DEFAULT '' NOT NULL"));
  if (!names.has("market_currency")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_currency TEXT DEFAULT 'USD' NOT NULL"));
  if (!names.has("market_checked_at")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_checked_at TEXT"));
  if (!names.has("market_check_status")) upgrades.push(env.DB.prepare("ALTER TABLE watches ADD COLUMN market_check_status TEXT DEFAULT '' NOT NULL"));
  if (upgrades.length) await env.DB.batch(upgrades);

  const brandColumns = await env.DB.prepare("PRAGMA table_info(brands)").all<{ name: string }>();
  const brandNames = new Set(brandColumns.results.map((column) => column.name));
  const brandUpgrades = [];
  if (!brandNames.has("website_url")) brandUpgrades.push(env.DB.prepare("ALTER TABLE brands ADD COLUMN website_url TEXT DEFAULT '' NOT NULL"));
  if (!brandNames.has("category")) brandUpgrades.push(env.DB.prepare("ALTER TABLE brands ADD COLUMN category TEXT DEFAULT 'brand' NOT NULL"));
  if (brandUpgrades.length) await env.DB.batch(brandUpgrades);

  await env.DB.prepare("PRAGMA optimize").run();
}
