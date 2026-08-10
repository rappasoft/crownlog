import assert from "node:assert/strict";
import test from "node:test";
import { extractProductMetadata, fetchProductPage } from "../app/api/product-metadata";

test("reads Jomashop preload metadata when standard product metadata is absent", () => {
  const product = extractProductMetadata(`
    <meta name="preload_data"
      data-preload-product-brand-name='Invicta'
      data-preload-product-name-wout-brand='DNA Men&#39;s Watch 10428'
      data-preload-product-image='https://cdn.example.test/watch.jpg?width=800&amp;height=800'
    />
  `, "https://www.jomashop.com/invicta-watch-10428.html");

  assert.equal(product.brand, "Invicta");
  assert.equal(product.name, "DNA Men's Watch 10428");
  assert.equal(product.imageUrl, "https://cdn.example.test/watch.jpg?width=800&height=800");
});

test("explains when both retailer fetch attempts time out", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  };

  try {
    await assert.rejects(
      fetchProductPage(new URL("https://slow-retailer.test/watch")),
      /took too long to respond after two attempts/i,
    );
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lets catalog discovery opt out of retries", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    throw new TypeError("fetch failed");
  };

  try {
    await assert.rejects(
      fetchProductPage(new URL("https://slow-retailer.test/watch"), { attempts: 1 }),
      /fetch failed/i,
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
