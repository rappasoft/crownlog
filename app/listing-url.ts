const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "srsltid",
]);

export function canonicalListingUrl(value: string) {
  const input = value.trim();
  if (!input) return "";
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

export function duplicateListingGroups<T extends { listingUrl: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = canonicalListingUrl(item.listingUrl);
    if (!key) continue;
    const group = grouped.get(key) || [];
    group.push(item);
    grouped.set(key, group);
  }
  return [...grouped.values()].filter((group) => group.length > 1);
}
