# Crownlog roadmap

Ideas are grouped by value and implementation size rather than promised release dates.

## Strong next additions

- **Scheduled price checks and notifications** — refresh saved product links daily and send an email, push, or in-app alert at the target price.
- **Multiple listings per watch** — compare authorized dealers, marketplaces, currencies, shipping, and the best current price.
- **Restock and limited-drop alerts** — track sold-out models, preorder windows, and release dates.
- **Watch photos** — upload a personal image or keep a cached product image instead of relying on a remote hotlink.
- **Automated backup destinations** — send scheduled encrypted archives to a collector-owned storage provider.

## Collector tools

- **Insurance value & receipts** — extend the collection ledger with appraisals and private document uploads.
- **Advanced service log** — add accuracy notes, service vendors, costs, receipts, and scheduled reminders.
- **Expanded specifications** — thickness, lug-to-lug, caliber details, complications, and bracelet sizing.
- **Strap box** — catalog straps and save favorite watch/strap combinations.
- **Smart wrist rotation** — use the wear log to surface neglected watches and suggest today’s watch.
- **Watch-box view** — arrange owned pieces in a visual case with open slots for collection planning.
- **One-in, one-out planner** — model what to sell before adding a new piece.

## Social and fun

- **Shareable collection cards** — public, read-only links with granular privacy controls.
- **Head-to-head bracket** — tournament-style picks that reveal which wishlist watch you actually prefer.
- **Collection bingo and challenges** — themes such as microbrand month, no-repeat week, or every dial color.
- **Taste profile** — summarize patterns in preferred sizes, colors, movements, countries, and price ranges.
- **Milestones** — first mechanical, first microbrand, first vintage piece, and collection anniversaries.
- **Gift mode** — privately share a shortlist with family or friends without revealing purchase history.

## Open-source and self-hosting

- **Database adapters** — keep SQLite/D1 as the zero-config default and add optional PostgreSQL/MySQL adapters.
- **Docker deployment** — a small self-hosted image with persistent storage and documented backups.
- **Multi-user accounts** — isolate collections per user with optional sign-in.
- **Plugin extractors** — community-maintained price parsers with conservative rate limits and clear store compatibility.
- **Localization** — locale-aware currencies, measurements, dates, and translated UI.
- **Public API and browser extension** — save a watch from any product page in one click.

## Guardrails

- Never bypass authentication, CAPTCHAs, access controls, or retailer rate limits.
- Keep manual entry available when automated extraction fails.
- Treat uploaded receipts, serial numbers, purchase prices, and location data as private by default.
- Preserve portable exports so a collector can always leave with their data.
