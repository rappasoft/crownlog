import assert from "node:assert/strict";
import test from "node:test";
import { convertCents, parseEcbRates } from "../app/exchange-rates";

test("parses the ECB daily reference-rate feed", () => {
  const snapshot = parseEcbRates(`<Cube><Cube time='2026-08-10'><Cube currency='USD' rate='1.20'/><Cube currency='GBP' rate='0.80'/></Cube></Cube>`);
  assert.deepEqual(snapshot, { base: "EUR", date: "2026-08-10", rates: { EUR: 1, USD: 1.2, GBP: 0.8 } });
});

test("converts between two non-euro currencies through the ECB base", () => {
  assert.equal(convertCents(8000, "GBP", "USD", { EUR: 1, GBP: 0.8, USD: 1.2 }), 12000);
  assert.equal(convertCents(10000, "XYZ", "USD", { EUR: 1, USD: 1.2 }), null);
});
