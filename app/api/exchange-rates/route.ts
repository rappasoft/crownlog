import { parseEcbRates, type ExchangeRateSnapshot } from "../../exchange-rates";

const ECB_DAILY_RATES_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const CACHE_MS = 12 * 60 * 60 * 1000;
let cached: { snapshot: ExchangeRateSnapshot; fetchedAt: number } | null = null;

export async function GET() {
  try {
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
      return Response.json(cached.snapshot, { headers: { "cache-control": "private, max-age=3600" } });
    }
    const response = await fetch(ECB_DAILY_RATES_URL, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/xml,text/xml", "user-agent": "Crownlog Exchange Rates/1.0" },
    });
    if (!response.ok) throw new Error(`The ECB returned ${response.status}.`);
    const snapshot = parseEcbRates(await response.text());
    cached = { snapshot, fetchedAt: Date.now() };
    return Response.json(snapshot, { headers: { "cache-control": "private, max-age=3600" } });
  } catch (error) {
    if (cached) return Response.json(cached.snapshot, { headers: { "x-crownlog-rates": "stale" } });
    return Response.json({ error: error instanceof Error ? error.message : "Exchange rates are unavailable." }, { status: 502 });
  }
}
