import { cleanMarketValue, searchProviderModels } from "../provider";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const brand = cleanMarketValue(payload.brand, 80);
    const model = cleanMarketValue(payload.model, 120);
    const reference = cleanMarketValue(payload.reference, 100);
    if (!brand || (!model && !reference)) return Response.json({ error: "Enter a brand and model or reference first." }, { status: 400 });
    const matches = await searchProviderModels(brand, model, reference);
    return Response.json({ matches, provider: "The Watch Info" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn’t search market data." }, { status: 422 });
  }
}
