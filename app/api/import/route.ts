import { extractProductMetadata, fetchProductPage, publicProductUrl } from "../product-metadata";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const productUrl = publicProductUrl(payload.listingUrl);
    const page = await fetchProductPage(productUrl);
    const product = extractProductMetadata(page.html, page.finalUrl);
    if (!product.name && product.priceCents === null) {
      throw new Error("No recognizable product details were exposed on that page. Fill in the watch manually instead.");
    }
    return Response.json({ product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn’t import that product page.";
    return Response.json({ error: message }, { status: 422 });
  }
}
