# Crownlog

Crownlog is a local-only personal watch index. It keeps followed brands, individual watches, collection records, product images, price history, service dates, and backups on your own computer.

There is no hosted Crownlog application and no account to create. The app runs at `http://localhost:3000` and stores its working database inside this project.

> Crownlog is source-available for noncommercial use. Commercial use, paid hosting, resale, and other revenue-generating use are not licensed.

## Quick start

### Requirements

- macOS, Linux, or Windows
- Node.js 22.13 or newer
- npm, which is installed with Node.js

Check Node.js before installing:

```bash
node --version
npm --version
```

### Install and run

Open Terminal and run:

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd Crownlog
npm install
npm run dev
```

If you downloaded the ZIP instead, extract it, open Terminal in the extracted project folder, and begin with `npm install`.

Open [http://localhost:3000](http://localhost:3000).

Keep that Terminal window open while using Crownlog. Press `Control+C` in the same window to stop the app. Start it again later with:

```bash
cd /path/to/Crownlog
npm run dev
```

## Where your data is stored

Crownlog uses a project-local, SQLite-compatible D1 database. The development runtime writes its SQLite state beneath:

```text
data/
```

That directory is intentionally ignored by Git so personal collection data is not committed to the source repository. It survives app restarts and page reloads.

The runtime-managed database file is stored under `data/v3/d1/miniflare-D1DatabaseObject/` with a generated `.sqlite` filename. Stop Crownlog before copying or inspecting that file directly.

The app does not use browser `localStorage`, does not need MySQL, and does not send collection records to a hosted Crownlog service. The current release supports local SQLite only; a MySQL adapter is not included.

When you explicitly search for or refresh a market estimate, Crownlog sends only the watch brand, model, or reference needed for that lookup to The Watch Info. Notes, ownership records, purchase prices, service dates, and the rest of your collection stay local.

A fresh Git clone starts with a completely empty database: no watches, followed brands, prices, or personal notes are bundled with the source. Crownlog creates the schema automatically the first time it starts. Existing installations keep their current data when the source code is updated.

For a portable copy, use **Vault → Download JSON** inside Crownlog. Keep that file somewhere outside the project as a backup.

## Feature manual

### Opening showcase

The top of Crownlog features up to three saved watches with images. It prioritizes higher grail scores, then owned and recently updated pieces. Select a featured watch to open its full Details panel.

If the showcase is empty, add a watch with an image. **Add watch → Fill details** normally imports the main product image automatically.

### Brand directory

- Choose **Follow brand** to save an entire watch brand or retailer without choosing a model.
- Select a brand card to edit its name, notes, website, or directory type.
- **Visit site** opens its official website.
- The number on a brand card shows how many individual watches from that brand are saved.
- Use **View all brands** when the directory contains more than twelve entries.

### Adding a watch manually

1. Choose **Add watch**.
2. Enter the brand and model.
3. Optionally add its reference, image URL, current price, target price, currency, notes, and grail score.
4. Open **Specifications & ownership** for movement, case, dial, water resistance, tags, purchase price, and purchase date.
5. Choose Wishlist or Purchased.
6. Select **Save watch**.

### Adding a watch from a product page

1. Open a specific watch product page in your browser and copy its URL. A brand homepage or collection page is usually not enough.
2. In Crownlog, choose **Add watch**.
3. Paste the URL into **Add from a product page**.
4. Choose **Fill details**.
5. Review the imported brand, model, reference, image, price, currency, and listing URL.
6. Complete anything the store did not publish and save the watch.

Crownlog reads public product metadata such as JSON-LD and Open Graph tags. Some stores block automated requests or omit structured information, so every field remains editable.

### Watch cards

Use the **List**, **Grid**, and **Table** buttons beside the sorting menu to switch between the grouped ledger, visual card gallery, and compact spreadsheet-style collection. Table view aligns brand, model/reference, listing price, market estimate, last check date, and status into scan-friendly columns.

Each watch card provides quick actions:

- Select the watch title to open its full Details panel.
- Select the grail dots to cycle from 1 to 5.
- Choose **Wishlist/Purchased** to change collection status.
- Choose **Details** to edit the full record.
- Choose **+ Compare** to add it to the comparison tray.
- The price area turns red when the current price is at or below the target.
- Tags, wear count, and overdue service status appear as badges.
- The remove icon opens a named confirmation before anything is deleted.

Deleting a watch also deletes its saved price history. This cannot be undone unless the watch exists in a JSON backup.

### Details, specifications, and ownership

Open **Details** on a watch to edit:

- Brand, model, reference, notes, and image
- Current price, target price, currency, and product-page URL
- Movement, case size, case material, dial color, and water resistance
- Searchable comma-separated tags
- Purchase price and purchase date
- Last service date and next service due date

Owned watches also have **Wore today**, which increments the wear count and records the latest wear date.

### Price tracking

For a single watch:

1. Open **Details**.
2. Save a specific product-page URL.
3. Set a target price if wanted.
4. Choose **Check listing now**.

For every linked watch, choose **Refresh all prices** above the collection.

Crownlog checks listings sequentially, reads public structured pricing, updates the current price and currency, and stores a new history point when the price changes. It does not run scheduled background checks while the app is closed and does not send sale notifications. Stores that block automated requests can still be updated manually.

### Free market estimates

Crownlog can also retrieve an aggregated resale-market estimate from [The Watch Info](https://thewatchinfo.com). This remains separate from the exact retailer or listing price.

1. Open a watch’s **Details**.
2. Under **Market estimate**, choose **Find market estimate**.
3. Review the possible matches and select the exact model or closest appropriate match.
4. Crownlog saves the provider model ID, median estimate, typical range, sample size, confidence, and update date in local SQLite.

Confirmed estimates older than 24 hours refresh once when Crownlog starts. **Refresh all prices** also refreshes confirmed market matches. Normal automatic checks reuse results until they are 24 hours old; the explicit refresh control can request a newer result.

Confidence labels are deliberately conservative: high confidence requires at least ten samples and an exact reference match, medium requires at least five samples, and smaller or less-exact datasets are marked low confidence. Market estimates are informational asking-price aggregates, not guaranteed sale values or financial advice.

If no provider match exists, enter a **Manual market estimate** in Details. Market-data attribution remains visible anywhere Crownlog displays provider-derived values. The provider API is currently free but is external to Crownlog and may change independently.

### Collection ledger

**Collection at a glance** summarizes:

- Recorded purchase total for owned watches
- Current tracked collection value
- Watches with an overdue service date
- Total logged wrist time

Values are only totaled when the owned watches use one currency. Crownlog does not guess currency conversions.

### Search, filters, and sorting

Search covers brand, model, reference, notes, tags, movement, and dial color.

Available filters are All watches, Wishlist, Purchased, At target, and Service due. Watches can be sorted by brand, grail score, ascending price, descending price, or newest first.

### Compare mode

Choose **+ Compare** on two or three watches. The comparison tray appears at the bottom of the screen. Choose **Compare watches** to line up images, grail scores, prices, movement, case, material, dial, and water resistance.

### Watch roulette

Choose **Watch roulette** when you want Crownlog to pick a watch. Wishlist watches are preferred; if there are none, it chooses from the full collection. Spin again or open the selected watch’s Details.

### Vault: backup, restore, and CSV

Open **Vault** in the header.

- **Download JSON** creates a complete Crownlog backup containing brands, watches, specifications, ownership data, and price history.
- **Download CSV** creates a spreadsheet-friendly watch table for Excel, Numbers, or Google Sheets.
- **Choose JSON** merges a Crownlog backup into the current database. Matching watch IDs are updated, missing records are added, and unrelated local records are not removed.

Create a JSON backup before moving the project, changing computers, or resetting the database.

### Guide

The **Guide** button in the header provides a short in-app map of the most important controls.

## Images

Crownlog stores HTTPS product-image URLs in SQLite rather than downloading image files. A retailer can change or remove an image later. You can replace the URL through **Details**.

Brand logos under `public/brand-logos/` are local project assets. Their names and artwork belong to their respective owners and are included only for identification.

## Backing up or moving Crownlog

Recommended method:

1. Open Crownlog and download a JSON backup from **Vault**.
2. Copy the project to the new computer.
3. Install Node.js and run `npm install`.
4. Start Crownlog with `npm run dev`.
5. Open **Vault → Choose JSON** and select the backup.

You may also copy the entire ignored `data/` directory while Crownlog is stopped, but the JSON workflow is more portable between versions.

## Updating the project

Before pulling or replacing project files, download a JSON backup. Project updates should not remove `data/`, but the backup protects against mistakes and makes version changes reversible.

Then run:

```bash
npm install
npm run dev
```

## Troubleshooting

### `EPERM: operation not permitted, uv_cwd`

The Terminal is pointing at a directory that moved, was deleted, or is no longer accessible. Open a new Terminal window and run:

```bash
cd /path/to/Crownlog
npm install
```

Use npm for this project; Yarn is not required.

### Port 3000 is already in use

Another Crownlog development server may already be running. Check the existing Terminal window first. Stop it with `Control+C`, then run `npm run dev` again.

### Watches or brands do not appear

- Confirm the Terminal running Crownlog has no errors.
- Refresh `http://localhost:3000`.
- Make sure you opened the same project directory that owns the `data/` folder.
- Restore the latest JSON backup through Vault if the database was moved.

### A product page will not import or refresh

- Use the exact product page rather than a homepage.
- Confirm the URL is public and begins with `https://`.
- The store may block automated requests or omit structured product data.
- Enter the missing details or price manually.

### A watch image is missing

Open **Details** and replace its image with a direct public HTTPS image URL. Image hosts that require cookies or block hotlinking will not display reliably.

### No market match is found

Crownlog automatically tries the reference, full model name, a cleaned model name, and shorter collection-name searches. If results still do not appear, The Watch Info does not currently cover that model. This is common for small microbrands and newly released watches. Save a manual market estimate instead; do not select a merely similar watch as an exact valuation.

## Developer commands

```bash
npm run dev          # Start Crownlog locally
npm run build        # Create a production build
npm run lint         # Check source quality
npm test             # Build and run integration tests
npm run db:generate  # Generate a migration after schema changes
```

Database schema definitions live in `db/schema.ts`, local initialization is in `db/index.ts`, and generated migrations are kept in `drizzle/`.

## Source-available project notes

- Personal data belongs in the ignored `data/` directory and must not be committed.
- Keep automated product extraction conservative. Do not bypass authentication, CAPTCHAs, rate limits, or store access controls.
- Test changes with `npm run lint` and `npm test` before opening a pull request.
- See `CONTRIBUTING.md`, `SECURITY.md`, and `ROADMAP.md` for project policies and future ideas.

## License

Crownlog is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You may download, run, study, modify, and redistribute the software for permitted noncommercial purposes. Commercial use—including offering Crownlog as a paid service, reselling it, or using it as part of a revenue-generating product or service—is not licensed. Contact the copyright holder if you need separate commercial permission.

Brand names, trademarks, and third-party logo assets remain the property of their respective owners and are not licensed by Crownlog.
