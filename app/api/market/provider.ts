const PROVIDER_URL = "https://thewatchinfo.com/api/v1.php";
const BRAND_ALIASES: Record<string, string> = {
  parmigiani: "Parmigiani Fleurier",
};
const GENERIC_MODEL_WORDS = new Set(["automatic", "mechanical", "quartz", "watch", "watches", "mens", "men", "steel", "blue", "black", "white", "dial", "limited", "edition"]);

type ProviderModel = {
  id: number;
  brand: string;
  name: string;
  reference: string | null;
  listings: number;
  avg_price_usd: number | null;
};

export type ProviderDetail = {
  model?: { brand?: string; name?: string; reference?: string | null };
  price_guide?: { p25?: number | null; median?: number | null; p75?: number | null; sample?: number | null };
};

export function cleanMarketValue(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizedMarketValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function marketCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

async function providerRequest(parameters: Record<string, string>) {
  const url = new URL(PROVIDER_URL);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Crownlog/0.1 (noncommercial local watch index)" } });
  if (!response.ok) throw new Error(`The market-data provider returned ${response.status}. Try again later.`);
  const data = await response.json() as { ok?: boolean; data?: unknown; error?: string };
  if (!data.ok) throw new Error(data.error || "The market-data provider couldn’t complete that request.");
  return data.data;
}

export async function searchProviderModels(brand: string, model: string, reference: string) {
  const providerBrand = BRAND_ALIASES[normalizedMarketValue(brand)] || brand;
  const decodedModel = model.replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, " ").replace(/[^a-z0-9-]+/gi, " ").trim();
  const brandWords = new Set(providerBrand.toLowerCase().split(/\s+/).filter(Boolean));
  const meaningfulWords = decodedModel.split(/\s+/).filter((word) => {
    const normalizedWord = word.toLowerCase();
    return normalizedWord.length > 1 && !brandWords.has(normalizedWord) && !GENERIC_MODEL_WORDS.has(normalizedWord);
  });
  const queries = [
    reference,
    model,
    meaningfulWords.join(" "),
    meaningfulWords.slice(0, 3).join(" "),
    meaningfulWords.slice(0, 2).join(" "),
    meaningfulWords[0] || "",
  ].map((query) => query.trim()).filter((query, index, all) => query && all.findIndex((candidate) => normalizedMarketValue(candidate) === normalizedMarketValue(query)) === index);

  let raw: unknown = [];
  for (const query of queries) {
    raw = await providerRequest({ resource: "models", brand: providerBrand, q: query, limit: "8" });
    if (Array.isArray(raw) && raw.length > 0) break;
  }
  return (Array.isArray(raw) ? raw : [])
    .filter((item): item is ProviderModel => Boolean(item && typeof item === "object" && Number.isInteger((item as ProviderModel).id)))
    .map((item) => ({
      id: String(item.id),
      brand: cleanMarketValue(item.brand, 80),
      name: cleanMarketValue(item.name, 160),
      reference: cleanMarketValue(item.reference, 100),
      sampleSize: Number.isInteger(item.listings) ? item.listings : 0,
      averagePriceCents: marketCents(item.avg_price_usd),
    }))
    .sort((a, b) => {
      const aExact = reference && normalizedMarketValue(a.reference) === normalizedMarketValue(reference) ? 1 : normalizedMarketValue(a.name) === normalizedMarketValue(model) ? 1 : 0;
      const bExact = reference && normalizedMarketValue(b.reference) === normalizedMarketValue(reference) ? 1 : normalizedMarketValue(b.name) === normalizedMarketValue(model) ? 1 : 0;
      return bExact - aExact || b.sampleSize - a.sampleSize;
    });
}

export async function fetchProviderModel(id: string) {
  return await providerRequest({ resource: "model", id }) as ProviderDetail;
}
