import assert from "node:assert/strict";
import test from "node:test";
import { canonicalListingUrl, duplicateListingGroups } from "../app/listing-url";

test("canonicalizes retailer links without marketing trackers", () => {
  assert.equal(
    canonicalListingUrl("https://Example.com/products/watch/?variant=blue&utm_source=reddit&srsltid=abc#details"),
    "https://example.com/products/watch?variant=blue",
  );
  assert.equal(
    canonicalListingUrl("https://example.com/products/watch?variant=blue"),
    "https://example.com/products/watch?variant=blue",
  );
});

test("groups every watch sharing a canonical retailer link", () => {
  const watches = [
    { id: "one", listingUrl: "https://example.com/watch?utm_source=mail" },
    { id: "two", listingUrl: "https://example.com/watch/" },
    { id: "three", listingUrl: "https://example.com/another-watch" },
    { id: "manual", listingUrl: "" },
  ];
  assert.deepEqual(duplicateListingGroups(watches).map((group) => group.map((watch) => watch.id)), [["one", "two"]]);
});
