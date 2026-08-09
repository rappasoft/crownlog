import assert from "node:assert/strict";
import test from "node:test";
import { fetchProductPage } from "../app/api/product-metadata";

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
