import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("brand navigation uses full document requests under Vinext", async () => {
  const collection = await readFile(new URL("../app/WatchCollection.tsx", import.meta.url), "utf8");
  const discovery = await readFile(new URL("../app/brands/BrandDiscovery.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(collection, /from ["']next\/link["']/);
  assert.match(collection, /<a className="directory-card-link"/);
  assert.doesNotMatch(discovery, /from ["']next\/link["']/);
  assert.match(discovery, /<a className="outline-button discovery-back"/);
});

test("collection exposes fetched watches as reviewable drafts", async () => {
  const collection = await readFile(new URL("../app/WatchCollection.tsx", import.meta.url), "utf8");
  const discoveryRoute = await readFile(new URL("../app/api/brands/discover/route.ts", import.meta.url), "utf8");

  assert.match(collection, /label: "Drafts", value: "drafts"/);
  assert.match(collection, /fetch\("\/api\/brands\/discover", \{ cache: "no-store" \}\)/);
  assert.match(collection, /Keep \+ wishlist/);
  assert.match(discoveryRoute, /productBrand: brandDiscoveries\.productBrand/);
  assert.match(discoveryRoute, /brandName: productBrand \|\| parentBrandName/);
  assert.match(discoveryRoute, /where\(eq\(brandDiscoveries\.status, "draft"\)\)/);
});

test("a collection URL can establish a missing brand website", async () => {
  const discovery = await readFile(new URL("../app/brands/BrandDiscovery.tsx", import.meta.url), "utf8");
  const discoveryRoute = await readFile(new URL("../app/api/brands/discover/route.ts", import.meta.url), "utf8");

  assert.match(discovery, /if \(!state\.brand\.websiteUrl && !collectionUrl\)/);
  assert.match(discoveryRoute, /import \{ extractProductMetadata, fetchProductPage, publicProductUrl \} from "\.\.\/\.\.\/product-metadata"/);
  assert.match(discoveryRoute, /if \(!brand\.websiteUrl && !collectionUrl\)/);
  assert.match(discoveryRoute, /websiteUrl: collectionStorefront/);
  assert.doesNotMatch(discoveryRoute, /websiteUrl: collectionStorefront, updatedAt:/);
});

test("saved watches expose their retailer listing in every collection view", async () => {
  const collection = await readFile(new URL("../app/WatchCollection.tsx", import.meta.url), "utf8");

  assert.match(collection, /watch\.listingUrl &&/);
  assert.match(collection, /className="watch-listing-link"/);
  assert.match(collection, /target="_blank"/);
  assert.match(collection, /Open listing/);
});

test("product-page imports fail fast when a retailer stops answering", async () => {
  const importRoute = await readFile(new URL("../app/api/import/route.ts", import.meta.url), "utf8");
  const collection = await readFile(new URL("../app/WatchCollection.tsx", import.meta.url), "utf8");

  assert.match(importRoute, /fetchProductPage\(productUrl, \{ attempts: 2, timeoutMs: 5000 \}\)/);
  assert.match(collection, /const importController = new AbortController\(\)/);
  assert.match(collection, /setTimeout\(\(\) => importController\.abort\(\), 15000\)/);
});

test("layout does not depend on Vinext next/font asset routing", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(layout, /next\/font/);
  assert.match(styles, /--font-geist-sans: -apple-system/);
  assert.match(styles, /--font-geist-mono: "SFMono-Regular"/);
});

test("header logos do not trigger Vinext image preloads", async () => {
  const collection = await readFile(new URL("../app/WatchCollection.tsx", import.meta.url), "utf8");
  const discovery = await readFile(new URL("../app/brands/BrandDiscovery.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(collection, /brand-lockup-image[^>]+priority/);
  assert.doesNotMatch(discovery, /brand-lockup-image[^>]+priority/);
  assert.doesNotMatch(collection, /brand-lockup-image[^>]+loading="eager"/);
  assert.doesNotMatch(discovery, /brand-lockup-image[^>]+loading="eager"/);
});

test("server-renders the Crownlog watch index", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Crownlog — Personal Watch Index<\/title>/i);
  assert.match(html, /Watches I’m/);
  assert.match(html, /The collection/);
  assert.match(html, /Collection at a glance/);
  assert.match(html, /Future spend/);
  assert.match(html, />Vault</);
  assert.doesNotMatch(html, /codex-preview/);
});

test("imports structured watch details from a product URL", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("import-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const originalFetch = globalThis.fetch;
  let retailerAttempts = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://example-watch.test/products/moon-phase") {
      retailerAttempts += 1;
      if (retailerAttempts === 1) {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      return new Response(`<!doctype html><script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Moon Phase",
        brand: { "@type": "Brand", name: "Example Watch Co." },
        sku: "MW-42",
        image: "https://cdn.example-watch.test/moon-phase.jpg",
        offers: { "@type": "Offer", price: "1299.00", priceCurrency: "USD" },
      })}</script>`, { headers: { "content-type": "text/html" } });
    }
    return originalFetch(input, init);
  };

  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingUrl: "https://example-watch.test/products/moon-phase" }),
      }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.product, {
      name: "Moon Phase",
      brand: "Example Watch Co.",
      reference: "MW-42",
      priceCents: 129900,
      currency: "USD",
      listingUrl: "https://example-watch.test/products/moon-phase",
      imageUrl: "https://cdn.example-watch.test/moon-phase.jpg",
    });
    assert.equal(retailerAttempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searches the free market-data provider without exposing collection data", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("market-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const originalFetch = globalThis.fetch;
  const providerUrls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://thewatchinfo.com/api/v1.php")) {
      providerUrls.push(url);
      const query = new URL(url).searchParams.get("q");
      return new Response(JSON.stringify({
        ok: true,
        data: query === "MW-42" ? [] : [{ id: 42, brand: "Example Watch Co.", name: "Moon Phase", reference: "MW-42", listings: 12, avg_price_usd: 1100 }],
      }), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };

  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/market/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: "Example Watch Co.", model: "Moon Phase", reference: "MW-42" }),
      }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.matches, [{ id: "42", brand: "Example Watch Co.", name: "Moon Phase", reference: "MW-42", sampleSize: 12, averagePriceCents: 110000 }]);
    assert.equal(providerUrls.length, 2);
    assert.match(providerUrls[0], /resource=models/);
    assert.match(providerUrls[0], /brand=Example(?:\+|%20)Watch(?:\+|%20)Co/);
    assert.match(providerUrls[0], /q=MW-42/);
    assert.match(providerUrls[1], /q=Moon(?:\+|%20)Phase/);
    assert.doesNotMatch(providerUrls.join("\n"), /notes|purchase|service/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wishlist favorites are persisted, filterable, and included in backups", async () => {
  const [schema, database, watchesRoute, collection, backups, discoverRoute] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/watches/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/WatchCollection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backups/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/brands/discover/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /isFavorite: integer\("is_favorite", \{ mode: "boolean" \}\)/);
  assert.match(database, /ALTER TABLE watches ADD COLUMN is_favorite INTEGER DEFAULT 0 NOT NULL/);
  assert.match(watchesRoute, /typeof payload\.isFavorite === "boolean"/);
  assert.match(watchesRoute, /const isFavorite = status === "wishlist" && payload\.isFavorite === true/);
  assert.match(collection, /value: "favorites"/);
  assert.match(collection, /favorite-toggle/);
  assert.match(collection, /name="isFavorite"/);
  assert.match(collection, /Favorite this watch/);
  assert.match(collection, /className="filter-control"/);
  assert.doesNotMatch(collection, /className="filter-tabs"/);
  assert.match(collection, /fetchDraftsForAllBrands/);
  assert.match(collection, /Fetch all drafts/);
  assert.match(collection, /editingDraft/);
  assert.match(collection, /Edit before adding/);
  assert.match(discoverRoute, /payload\.details/);
  assert.match(backups, /isFavorite: item\.status !== "owned" && item\.isFavorite === true/);
});

test("saved watch images open in a large lightbox", async () => {
  const collection = await readFile(new URL("../app/WatchCollection.tsx", import.meta.url), "utf8");

  assert.match(collection, /className="watch-photo-button"/);
  assert.match(collection, /setPreviewImage/);
  assert.match(collection, /className="image-lightbox"/);
  assert.match(collection, /Open original image/);
});

test("watch roulette displays the selected watch image", async () => {
  const collection = await readFile(new URL("../app/WatchCollection.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(collection, /rouletteWatch\.imageUrl \?/);
  assert.match(collection, /className="roulette-image"/);
  assert.match(collection, /alt=\{`\$\{rouletteWatch\.brand\} \$\{rouletteWatch\.model\}`\}/);
  assert.match(styles, /\.roulette-image img \{[^}]*object-fit: contain/);
});
