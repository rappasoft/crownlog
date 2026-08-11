export type ExchangeRateSnapshot = {
  base: "EUR";
  date: string;
  rates: Record<string, number>;
};

export function parseEcbRates(xml: string): ExchangeRateSnapshot {
  const date = xml.match(/<Cube\s+time=["']([^"']+)["']/i)?.[1] || "";
  const rates: Record<string, number> = { EUR: 1 };
  for (const match of xml.matchAll(/<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']/gi)) {
    const rate = Number(match[2]);
    if (Number.isFinite(rate) && rate > 0) rates[match[1].toUpperCase()] = rate;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Object.keys(rates).length < 2) {
    throw new Error("The ECB exchange-rate response was incomplete.");
  }
  return { base: "EUR", date, rates };
}

export function convertCents(cents: number, from: string, to: string, rates: Record<string, number>) {
  const sourceRate = rates[from.toUpperCase()];
  const targetRate = rates[to.toUpperCase()];
  if (!Number.isFinite(sourceRate) || !Number.isFinite(targetRate) || sourceRate <= 0 || targetRate <= 0) return null;
  return Math.round((cents / sourceRate) * targetRate);
}
