import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_EXCHANGE_RATES, convertCents, parseEcbRates } from "../app/exchange-rates";

test("parses the ECB daily reference-rate feed", () => {
  const snapshot = parseEcbRates(`<Cube><Cube time='2026-08-10'><Cube currency='USD' rate='1.20'/><Cube currency='GBP' rate='0.80'/></Cube></Cube>`);
  assert.deepEqual(snapshot, { base: "EUR", date: "2026-08-10", rates: { EUR: 1, USD: 1.2, GBP: 0.8 } });
});

test("converts between two non-euro currencies through the ECB base", () => {
  assert.equal(convertCents(8000, "GBP", "USD", { EUR: 1, GBP: 0.8, USD: 1.2 }), 12000);
  assert.equal(convertCents(10000, "XYZ", "USD", { EUR: 1, USD: 1.2 }), null);
});

test("bundles fallback rates for every Crownlog price currency", () => {
  for (const currency of ["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "JPY"]) {
    assert.equal(typeof BUILT_IN_EXCHANGE_RATES.rates[currency], "number");
  }
  assert.ok(convertCents(10000, "GBP", "USD", BUILT_IN_EXCHANGE_RATES.rates)! > 10000);
});
