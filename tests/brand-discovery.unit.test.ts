import assert from "node:assert/strict";
import test from "node:test";
import { isLikelyWatchProduct, looksLikeProductUrl, sitemapLocations } from "../app/api/brands/discover/discovery";

test("reads product locations from sitemap XML", () => {
  assert.deepEqual(sitemapLocations(`<?xml version="1.0"?><urlset><url><loc>https://example.com/products/blue-watch?x=1&amp;y=2</loc></url><url><loc>https://example.com/pages/about</loc></url></urlset>`), [
    "https://example.com/products/blue-watch?x=1&y=2",
    "https://example.com/pages/about",
  ]);
});

test("recognizes common storefront product paths", () => {
  assert.equal(looksLikeProductUrl("https://example.com/products/blue-watch"), true);
  assert.equal(looksLikeProductUrl("https://example.com/us/en/product/aw1234.html"), true);
  assert.equal(looksLikeProductUrl("https://example.com/products/polygon-fountain-pen-gift-set"), false);
  assert.equal(looksLikeProductUrl("https://example.com/products/rubber-watch-band"), false);
  assert.equal(looksLikeProductUrl("https://example.com/collections/watches"), false);
  assert.equal(looksLikeProductUrl("https://example.com/pages/about"), false);
});

test("requires watch-specific product evidence", () => {
  const baseProduct = {
    brand: "Venezianico",
    reference: "",
    priceCents: 50_00,
    currency: "USD",
    imageUrl: "https://example.com/product.jpg",
    category: "",
    description: "",
  };

  assert.equal(isLikelyWatchProduct({
    ...baseProduct,
    name: "Nereide 42 - 3321502C",
    reference: "3321502C",
    listingUrl: "https://example.com/products/nereide-42-3321502c",
    description: "Our dive watch is water-resistant to a depth of 200 meters.",
  }), true);
  assert.equal(isLikelyWatchProduct({
    ...baseProduct,
    name: "Nordlys – Nebula",
    reference: "5744002550358",
    listingUrl: "https://example.com/products/nordlys-nebula",
    description: "A functional dial powered by a reliable automatic movement.",
  }), true);
  assert.equal(isLikelyWatchProduct({
    ...baseProduct,
    name: "Rubber Band",
    listingUrl: "https://example.com/products/rubber-band",
    description: "Made for the Nereide dive watch case.",
  }), false);
  assert.equal(isLikelyWatchProduct({
    ...baseProduct,
    name: "Polygon Fountain Pen Gift Set",
    listingUrl: "https://example.com/products/polygon-fountain-pen-gift-set",
  }), false);
});
