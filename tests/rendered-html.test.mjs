import assert from "node:assert/strict";
import test from "node:test";

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
  assert.match(html, />Vault</);
  assert.doesNotMatch(html, /codex-preview/);
});

test("imports structured watch details from a product URL", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("import-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://example-watch.test/products/moon-phase") {
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
