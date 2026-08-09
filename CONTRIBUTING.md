# Contributing to Crownlog

Thanks for helping make Crownlog better.

1. Create a focused branch for your change.
2. Install dependencies with `npm ci`.
3. Run `npm run lint` and `npm test`.
4. Keep schema changes in `db/schema.ts` and include the generated Drizzle migration.
5. Open a pull request describing the user-facing result and how it was tested.

Price extractors must use public product data only. Do not add CAPTCHA bypasses, authenticated scraping, aggressive polling, or retailer-specific behavior that violates access controls.
