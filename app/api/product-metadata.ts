export type ProductMetadata = {
  name: string;
  brand: string;
  reference: string;
  priceCents: number | null;
  currency: string;
  listingUrl: string;
  imageUrl: string;
};

const PRODUCT_PAGE_ATTEMPTS = 2;
const PRODUCT_PAGE_TIMEOUT_MS = 12000;

function retryableFetchError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || error.name === "TypeError");
}

async function fetchRetailerPage(url: URL) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PRODUCT_PAGE_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(PRODUCT_PAGE_TIMEOUT_MS),
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Crownlog Product Import/1.0 (+personal watch index)",
        },
      });
    } catch (error) {
      lastError = error;
      if (!retryableFetchError(error) || attempt === PRODUCT_PAGE_ATTEMPTS) break;
    }
  }
  if (lastError instanceof Error && (lastError.name === "TimeoutError" || lastError.name === "AbortError")) {
    throw new Error("The retailer took too long to respond after two attempts. Try again, or add the details manually.");
  }
  throw lastError;
}

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function safeCurrency(value: unknown) {
  const currency = clean(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

export function publicProductUrl(value: unknown) {
  const input = clean(value, 1000);
  if (!input) throw new Error("Paste a product link first.");
  const url = new URL(input);
  const hostname = url.hostname.toLowerCase();
  const blockedHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  if (url.protocol !== "https:" || url.username || url.password || blockedHostname) {
    throw new Error("Product imports require a public HTTPS link.");
  }
  return url;
}

function amountInCents(value: unknown) {
  const amount = Number(String(value ?? "").replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) return null;
  return Math.round(amount * 100);
}

function typeIncludesProduct(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) => typeof item === "string" && item.toLowerCase().split("/").at(-1) === "product");
}

function findProduct(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const product = findProduct(item);
      if (product) return product;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeIncludesProduct(record["@type"])) return record;
  for (const nested of Object.values(record)) {
    const product = findProduct(nested);
    if (product) return product;
  }
  return null;
}

function brandName(value: unknown) {
  if (typeof value === "string") return clean(value, 80);
  if (value && typeof value === "object") return clean((value as Record<string, unknown>).name, 80);
  return "";
}

function productImageUrl(value: unknown, listingUrl: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  const raw =
    typeof candidate === "string"
      ? candidate
      : candidate && typeof candidate === "object"
        ? clean((candidate as Record<string, unknown>).url ?? (candidate as Record<string, unknown>).contentUrl, 1500)
        : "";
  if (!raw) return "";
  try {
    const url = new URL(raw, listingUrl);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function priceFromOffer(offer: unknown, fallbackCurrency = "USD"): { priceCents: number; currency: string } | null {
  if (Array.isArray(offer)) {
    for (const item of offer) {
      const price = priceFromOffer(item, fallbackCurrency);
      if (price) return price;
    }
    return null;
  }
  if (!offer || typeof offer !== "object") return null;
  const record = offer as Record<string, unknown>;
  const nested = record.priceSpecification && priceFromOffer(record.priceSpecification, safeCurrency(record.priceCurrency || fallbackCurrency));
  if (nested) return nested;
  const priceCents = amountInCents(record.price ?? record.lowPrice);
  return priceCents === null ? null : { priceCents, currency: safeCurrency(record.priceCurrency || fallbackCurrency) };
}

function metaContent(html: string, key: string, max = 240) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return clean(match[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), max);
  }
  return "";
}

export function extractProductMetadata(html: string, listingUrl: string): ProductMetadata {
  const jsonLd = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLd)) {
    try {
      const parsed = JSON.parse(match[1].trim().replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
      const product = findProduct(parsed);
      if (!product) continue;
      const price = priceFromOffer(product.offers, safeCurrency(product.priceCurrency));
      return {
        name: clean(product.name, 120),
        brand: brandName(product.brand ?? product.manufacturer),
        reference: clean(product.sku ?? product.mpn ?? product.productID, 100),
        priceCents: price?.priceCents ?? null,
        currency: price?.currency ?? safeCurrency(product.priceCurrency),
        listingUrl,
        imageUrl: productImageUrl(product.image, listingUrl),
      };
    } catch {
      // Pages often include several JSON-LD blocks; skip malformed blocks.
    }
  }

  const rawPrice = metaContent(html, "product:price:amount") || metaContent(html, "og:price:amount") || metaContent(html, "price");
  const rawCurrency = metaContent(html, "product:price:currency") || metaContent(html, "og:price:currency") || metaContent(html, "priceCurrency");
  return {
    name: metaContent(html, "og:title") || clean(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1], 120),
    brand: metaContent(html, "product:brand") || metaContent(html, "brand"),
    reference: metaContent(html, "product:retailer_item_id") || metaContent(html, "sku"),
    priceCents: amountInCents(rawPrice),
    currency: safeCurrency(rawCurrency),
    listingUrl,
    imageUrl: productImageUrl(metaContent(html, "og:image", 1500) || metaContent(html, "twitter:image", 1500), listingUrl),
  };
}

export async function fetchProductPage(initialUrl: URL) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchRetailerPage(url);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("The retailer redirected too many times.");
      url = publicProductUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`The retailer returned ${response.status}. You can still add the watch manually.`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 5000000) throw new Error("That product page is too large to import safely.");
    return { html: (await response.text()).slice(0, 5000000), finalUrl: url.toString() };
  }
  throw new Error("Couldn’t reach that product page.");
}
