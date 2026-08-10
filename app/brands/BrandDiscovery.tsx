"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation avoids Vinext beta RSC blank screens. */

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Brand = {
  id: string;
  name: string;
  notes: string;
  websiteUrl: string;
  category: "brand" | "retailer";
};

type Discovery = {
  id: string;
  brandId: string;
  name: string;
  reference: string;
  imageUrl: string;
  priceCents: number | null;
  currency: string;
  sourceUrl: string;
  status: "draft" | "kept" | "dismissed";
  createdAt: string;
  updatedAt: string;
};

type SavedWatch = {
  id: string;
  model: string;
  reference: string;
  imageUrl: string;
  currentPriceCents: number | null;
  currency: string;
  listingUrl: string;
  status: "wishlist" | "owned";
};

type BrandState = {
  brand: Brand;
  discoveries: Discovery[];
  savedWatches: SavedWatch[];
};

function formatPrice(cents: number | null, currency = "USD") {
  if (cents === null) return "Price unavailable";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toLocaleString("en-US")}`;
  }
}

export default function BrandDiscovery({ brandId }: { brandId: string }) {
  const [state, setState] = useState<BrandState | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadBrand = useCallback(async () => {
    try {
      const response = await fetch(`/api/brands/discover?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
      const data = await response.json() as BrandState & { error?: string };
      if (!response.ok || !data.brand) throw new Error(data.error || "Couldn’t load this brand.");
      setState(data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn’t load this brand.");
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    // Initial data hydration is intentionally performed once per brand route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBrand();
  }, [loadBrand]);

  const drafts = useMemo(() => state?.discoveries.filter((item) => item.status === "draft") || [], [state]);
  const kept = state?.discoveries.filter((item) => item.status === "kept").length || 0;
  const dismissed = state?.discoveries.filter((item) => item.status === "dismissed").length || 0;

  async function saveWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    const websiteUrl = String(new FormData(event.currentTarget).get("websiteUrl") || "").trim();
    setSavingWebsite(true);
    setMessage("");
    try {
      const response = await fetch("/api/brands", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...state.brand, websiteUrl }),
      });
      const data = await response.json() as { brand?: Brand; error?: string };
      if (!response.ok || !data.brand) throw new Error(data.error || "Couldn’t save the website.");
      setState((current) => current ? { ...current, brand: data.brand! } : current);
      setMessage("Official website saved. Crownlog is ready to look for watches.");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn’t save the website.");
    } finally {
      setSavingWebsite(false);
    }
  }

  async function fetchWatches() {
    if (!state?.brand.websiteUrl) {
      setError("Add the official brand website first.");
      return;
    }
    setFetching(true);
    setMessage("Looking through the brand’s public product pages…");
    setError("");
    try {
      const response = await fetch("/api/brands/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const data = await response.json() as BrandState & { fetch?: { found: number; scanned: number; available: number; timedOut?: boolean }; error?: string };
      if (!response.ok || !data.brand) throw new Error(data.error || "Couldn’t fetch watches from this brand.");
      setState(data);
      setMessage(data.fetch?.timedOut
        ? data.fetch.found
          ? `The catalog paused after 35 seconds, but found ${data.fetch.found} new ${data.fetch.found === 1 ? "watch" : "watches"}. You can fetch again for more.`
          : "The catalog paused after 35 seconds without finding a new watch. You can try again; Crownlog will skip anything already reviewed."
        : data.fetch?.found
        ? `Found ${data.fetch.found} new ${data.fetch.found === 1 ? "watch" : "watches"}. Keep the ones that belong on your wishlist.`
        : "No unseen watches were found this time. Crownlog remembers everything you already reviewed.");
    } catch (fetchError) {
      setMessage("");
      setError(fetchError instanceof Error ? fetchError.message : "Couldn’t fetch watches from this brand.");
    } finally {
      setFetching(false);
    }
  }

  async function reviewDiscovery(discovery: Discovery, action: "keep" | "dismiss") {
    setWorkingId(discovery.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/brands/discover", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: discovery.id, action }),
      });
      const data = await response.json() as { alreadySaved?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn’t update this draft.");
      await loadBrand();
      setMessage(action === "keep"
        ? data.alreadySaved ? "That watch was already on your wishlist, so Crownlog marked the draft as reviewed." : `${discovery.name} was added to your wishlist.`
        : `${discovery.name} dismissed. It won’t be suggested again.`);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Couldn’t update this draft.");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <main className="discovery-shell">
      <header className="discovery-topbar">
        <a className="brand-lockup" href="/" aria-label="Back to Crownlog">
          <Image className="brand-lockup-image" src="/og.png" alt="Crownlog — Personal Watch Index" width={210} height={110} priority />
        </a>
        <a className="outline-button discovery-back" href="/">← Collection</a>
      </header>

      {loading ? (
        <section className="discovery-loading"><span className="loading-dial" />Opening the discovery tray…</section>
      ) : !state ? (
        <section className="discovery-loading"><h1>Brand unavailable</h1><p>{error}</p><a href="/">Return to the collection</a></section>
      ) : (
        <>
          <section className="discovery-hero">
            <div>
              <span className="eyebrow"><span /> BRAND DISCOVERY</span>
              <h1>{state.brand.name}</h1>
              <p>{state.brand.notes || "Turn the brand’s catalog into a draft wishlist, one discovery at a time."}</p>
              <div className="discovery-facts"><span>{state.savedWatches.length} saved</span><span>{drafts.length} drafts</span><span>{kept} kept</span><span>{dismissed} dismissed</span></div>
            </div>
            <div className="discovery-dial" aria-hidden="true"><span>{state.brand.name.charAt(0)}</span><i /></div>
          </section>

          <section className="discovery-source" aria-labelledby="discovery-source-title">
            <div><span className="section-number">SOURCE</span><h2 id="discovery-source-title">Where should Crownlog look?</h2><p>Use the brand’s official public website. Fetches stay local and only run when you press the button.</p></div>
            <form onSubmit={saveWebsite}>
              <input name="websiteUrl" type="url" required defaultValue={state.brand.websiteUrl} placeholder="https://www.citizenwatch.com/" aria-label="Official brand website" />
              <button className="outline-button" disabled={savingWebsite}>{savingWebsite ? "Saving…" : "Save website"}</button>
              <button className="add-button" type="button" disabled={fetching || savingWebsite || !state.brand.websiteUrl} onClick={() => void fetchWatches()}>{fetching ? "Fetching…" : "Fetch new watches"}</button>
            </form>
          </section>

          {(message || error) && <div className={error ? "discovery-message is-error" : "discovery-message"} role={error ? "alert" : "status"}>{error || message}</div>}

          <section className="discovery-tray" aria-labelledby="discovery-tray-title">
            <div className="discovery-heading"><div><span className="section-number">DRAFTS</span><h2 id="discovery-tray-title">Discovery tray</h2></div><p>Nothing reaches your wishlist until you choose Keep.</p></div>
            {drafts.length ? (
              <div className="discovery-grid">
                {drafts.map((discovery) => (
                  <article className="discovery-card" key={discovery.id}>
                    <div className="discovery-image"><span>{state.brand.name.charAt(0)}</span>{discovery.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={discovery.imageUrl} alt={`${state.brand.name} ${discovery.name}`} referrerPolicy="no-referrer" />
                    )}</div>
                    <div className="discovery-card-copy"><small>{state.brand.name}</small><h3>{discovery.name}</h3><p>{discovery.reference ? `Ref. ${discovery.reference}` : "Reference unavailable"}</p><strong>{formatPrice(discovery.priceCents, discovery.currency)}</strong><a href={discovery.sourceUrl} target="_blank" rel="noreferrer">Open product page ↗</a></div>
                    <div className="discovery-card-actions"><button className="text-button is-danger" disabled={workingId === discovery.id} onClick={() => void reviewDiscovery(discovery, "dismiss")}>Dismiss</button><button className="add-button" disabled={workingId === discovery.id} onClick={() => void reviewDiscovery(discovery, "keep")}>{workingId === discovery.id ? "Saving…" : "Keep + wishlist"}</button></div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="discovery-empty"><div className="empty-dial" aria-hidden="true"><span /></div><h3>Your tray is empty</h3><p>{state.brand.websiteUrl ? "Fetch a random selection from the brand’s public catalog." : "Save the official website above, then fetch your first selection."}</p><button className="add-button" disabled={!state.brand.websiteUrl || fetching} onClick={() => void fetchWatches()}>{fetching ? "Fetching…" : "Fetch new watches"}</button></div>
            )}
          </section>

          {state.savedWatches.length > 0 && (
            <section className="brand-saved-watches" aria-labelledby="brand-saved-title"><div className="discovery-heading"><div><span className="section-number">SAVED</span><h2 id="brand-saved-title">Already in Crownlog</h2></div></div><div className="brand-saved-grid">{state.savedWatches.map((watch) => <a href="/" className="brand-saved-card" key={watch.id}><div>{watch.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={watch.imageUrl} alt="" referrerPolicy="no-referrer" />
            )}<span>{state.brand.name.charAt(0)}</span></div><small>{watch.status === "owned" ? "Purchased" : "Wishlist"}</small><strong>{watch.model}</strong><p>{formatPrice(watch.currentPriceCents, watch.currency)}</p></a>)}</div></section>
          )}
        </>
      )}
    </main>
  );
}
