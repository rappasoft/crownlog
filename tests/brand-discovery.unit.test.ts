import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeProductUrl, sitemapLocations } from "../app/api/brands/discover/discovery";

test("reads product locations from sitemap XML", () => {
  assert.deepEqual(sitemapLocations(`<?xml version="1.0"?><urlset><url><loc>https://example.com/products/blue-watch?x=1&amp;y=2</loc></url><url><loc>https://example.com/pages/about</loc></url></urlset>`), [
    "https://example.com/products/blue-watch?x=1&y=2",
    "https://example.com/pages/about",
  ]);
});

test("recognizes common storefront product paths", () => {
  assert.equal(looksLikeProductUrl("https://example.com/products/blue-watch"), true);
  assert.equal(looksLikeProductUrl("https://example.com/us/en/product/aw1234.html"), true);
  assert.equal(looksLikeProductUrl("https://example.com/collections/watches"), false);
  assert.equal(looksLikeProductUrl("https://example.com/pages/about"), false);
});
