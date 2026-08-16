import assert from "node:assert/strict";
import test from "node:test";
import { isLikelyWatchProduct, looksLikeProductUrl, productLinksFromHtml, sitemapLocations } from "../app/api/brands/discover/discovery";

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

test("extracts same-site product links from a collection page", () => {
  const html = `<a class="card-product" href="/us-en/products/presage/ssk037j1">Watch one</a>
    <a href="https://www.seikowatches.com/us-en/products/presage/ssa459j1?variant=blue&amp;size=40" class="product-card">Watch two</a>
    <a href="/us-en/products/presage/cocktailtime">Current collection</a>
    <a href="/uk-en/products/presage/cocktailtime">Alternate-locale collection</a>
    <a href="/us-en/products/prospex/spb501j1">Unrelated navigation product</a>
    <a href="https://example.com/products/not-seiko">External product</a>
    <a href="/us-en/products/presage/ssk037j1">Duplicate</a>`;

  assert.deepEqual(productLinksFromHtml(html, "https://www.seikowatches.com/us-en/products/presage/cocktailtime"), [
    "https://www.seikowatches.com/us-en/products/presage/ssk037j1",
    "https://www.seikowatches.com/us-en/products/presage/ssa459j1?variant=blue&size=40",
  ]);
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
