import { mkdir, writeFile } from "node:fs/promises";

const response = await fetch("http://localhost:3000/api/brands");
if (!response.ok) throw new Error(`Could not load brands: ${response.status}`);

const { brands } = await response.json();
await mkdir(new URL("../public/brand-logos/", import.meta.url), { recursive: true });

const results = await Promise.all(
  brands.map(async (brand) => {
    const logoUrl = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(brand.websiteUrl)}&sz=128`;
    const logoResponse = await fetch(logoUrl, {
      headers: { "user-agent": "Crownlog Watch Index/1.0" },
    });
    if (!logoResponse.ok) return { name: brand.name, ok: false, status: logoResponse.status };

    const bytes = new Uint8Array(await logoResponse.arrayBuffer());
    if (bytes.byteLength < 100) return { name: brand.name, ok: false, status: "empty" };

    await writeFile(new URL(`../public/brand-logos/${brand.id}.png`, import.meta.url), bytes);
    return { name: brand.name, ok: true, bytes: bytes.byteLength };
  }),
);

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ downloaded: results.length - failed.length, failed }, null, 2));
