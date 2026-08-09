import { fetchProductPage, publicProductUrl } from "../../product-metadata";

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function sitemapLocations(xml: string) {
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);
}

export function looksLikeProductUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    return /\/(?:products?|watches?)\/.+/.test(path)
      || /\/(?:p|item)\/.+/.test(path)
      || (path.endsWith(".html") && /(?:product|watch|timepiece)/.test(path));
  } catch {
    return false;
  }
}

function sameStorefront(candidate: URL, storefront: URL) {
  const normalize = (hostname: string) => hostname.toLowerCase().replace(/^www\./, "");
  return normalize(candidate.hostname) === normalize(storefront.hostname);
}

async function readSitemap(url: URL) {
  const page = await fetchProductPage(publicProductUrl(url.toString()));
  return { xml: page.html, finalUrl: new URL(page.finalUrl) };
}

export async function discoverProductUrls(websiteUrl: string) {
  const storefront = publicProductUrl(websiteUrl);
  const roots = [new URL("/sitemap.xml", storefront), new URL("/sitemap_index.xml", storefront)];
  const rootDocuments: Array<{ xml: string; finalUrl: URL }> = [];
  for (const root of roots) {
    try {
      rootDocuments.push(await readSitemap(root));
    } catch {
      // Storefronts commonly expose one of these two conventional sitemap paths.
    }
  }
  if (!rootDocuments.length) {
    throw new Error("Crownlog couldn’t read this brand’s public sitemap. The site may block discovery or need a custom adapter.");
  }

  const directUrls: string[] = [];
  const sitemapUrls: string[] = [];
  for (const document of rootDocuments) {
    for (const location of sitemapLocations(document.xml)) {
      try {
        const url = publicProductUrl(new URL(location, document.finalUrl).toString());
        if (!sameStorefront(url, storefront)) continue;
        if (/\.xml(?:\.gz)?$/i.test(url.pathname)) sitemapUrls.push(url.toString());
        else if (looksLikeProductUrl(url.toString())) directUrls.push(url.toString());
      } catch {
        // Ignore malformed or non-public sitemap entries.
      }
    }
  }

  const childSitemaps = [...new Set(sitemapUrls)]
    .sort((a, b) => Number(/product/i.test(b)) - Number(/product/i.test(a)))
    .slice(0, 12);
  for (const sitemapUrl of childSitemaps) {
    try {
      const document = await readSitemap(new URL(sitemapUrl));
      for (const location of sitemapLocations(document.xml)) {
        try {
          const url = publicProductUrl(new URL(location, document.finalUrl).toString());
          if (sameStorefront(url, storefront) && looksLikeProductUrl(url.toString())) {
            directUrls.push(url.toString());
          }
        } catch {
          // Ignore malformed or non-public sitemap entries.
        }
      }
    } catch {
      // One broken child sitemap should not discard products found elsewhere.
    }
  }

  return [...new Set(directUrls)].slice(0, 2000);
}
