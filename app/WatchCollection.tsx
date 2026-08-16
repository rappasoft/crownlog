"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BUILT_IN_EXCHANGE_RATES, convertCents, type ExchangeRateSnapshot } from "./exchange-rates";
import { canonicalListingUrl, duplicateListingGroups } from "./listing-url";

type WatchStatus = "wishlist" | "owned";

type PricePoint = {
  id: string;
  watchId: string;
  priceCents: number;
  recordedAt: string;
};

type Watch = {
  id: string;
  brand: string;
  model: string;
  reference: string;
  notes: string;
  status: WatchStatus;
  isFavorite: boolean;
  grailScore: number;
  currentPriceCents: number | null;
  targetPriceCents: number | null;
  currency: string;
  listingUrl: string;
  imageUrl: string;
  movement: string;
  caseSize: string;
  caseMaterial: string;
  dialColor: string;
  waterResistance: string;
  tags: string;
  purchasePriceCents: number | null;
  purchaseDate: string;
  lastServiceDate: string;
  nextServiceDate: string;
  wearCount: number;
  lastWornAt: string | null;
  lastPriceCheckAt: string | null;
  lastPriceCheckStatus: string;
  marketProvider: "" | "the-watch-info" | "manual";
  marketModelId: string;
  marketModelName: string;
  marketPriceCents: number | null;
  marketLowCents: number | null;
  marketHighCents: number | null;
  marketSampleSize: number;
  marketConfidence: "" | "high" | "medium" | "low" | "manual";
  marketCurrency: string;
  marketCheckedAt: string | null;
  marketCheckStatus: string;
  priceHistory: PricePoint[];
  createdAt: string;
  updatedAt: string;
};

type Brand = {
  id: string;
  name: string;
  notes: string;
  websiteUrl: string;
  category: "brand" | "retailer";
  createdAt: string;
};

type DiscoveryDraft = {
  id: string;
  brandId: string;
  brandName: string;
  name: string;
  reference: string;
  imageUrl: string;
  priceCents: number | null;
  currency: string;
  sourceUrl: string;
  status: "draft";
  createdAt: string;
};

type ImportedProduct = {
  name: string;
  brand: string;
  reference: string;
  priceCents: number | null;
  currency: string;
  listingUrl: string;
  imageUrl: string;
};

type AddWatchPayload = {
  brand: string;
  model: string;
  reference: string;
  notes: string;
  status: string;
  isFavorite: boolean;
  grailScore: string;
  currentPrice: string;
  targetPrice: string;
  currency: string;
  listingUrl: string;
  imageUrl: string;
  movement: string;
  caseSize: string;
  caseMaterial: string;
  dialColor: string;
  waterResistance: string;
  tags: string;
  purchasePrice: string;
  purchaseDate: string;
};

type DuplicateWatchSummary = Pick<Watch, "id" | "brand" | "model" | "listingUrl">;

type MarketMatch = {
  id: string;
  brand: string;
  name: string;
  reference: string;
  sampleSize: number;
  averagePriceCents: number | null;
};

type Filter = "all" | WatchStatus | "favorites" | "drafts" | "deals" | "service" | "duplicates";
type SortMode = "brand" | "grail" | "price-low" | "price-high" | "newest";
type ViewMode = "list" | "grid" | "table";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All watches", value: "all" },
  { label: "Wishlist", value: "wishlist" },
  { label: "Favorites", value: "favorites" },
  { label: "Purchased", value: "owned" },
  { label: "Drafts", value: "drafts" },
  { label: "At target", value: "deals" },
  { label: "Service due", value: "service" },
  { label: "Duplicates", value: "duplicates" },
];
const VIEW_PREFERENCE_KEY = "crownlog-view-mode";
const EXCHANGE_RATES_CACHE_KEY = "crownlog-exchange-rates";
const LEDGER_CURRENCY = "USD";

function countLabel(count: number) {
  return `${count} ${count === 1 ? "watch" : "watches"}`;
}

function formatPrice(cents: number | null, currency = "USD") {
  if (cents === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toLocaleString("en-US")}`;
  }
}

function currencyMark(currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value || currency;
  } catch {
    return currency;
  }
}

function sparkHeights(history: PricePoint[]) {
  const points = history.slice(-10);
  if (!points.length) return [];
  const prices = points.map((point) => point.priceCents);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return points.map((point) => ({
    ...point,
    height: high === low ? 55 : 20 + ((point.priceCents - low) / (high - low)) * 75,
  }));
}

function isServiceDue(watch: Watch) {
  if (!watch.nextServiceDate) return false;
  return new Date(`${watch.nextServiceDate}T23:59:59`).getTime() <= Date.now();
}

function latestPriceCheck(watch: Watch) {
  const timestamps = [watch.lastPriceCheckAt, watch.marketCheckedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((item) => !Number.isNaN(item.time));
  return timestamps.sort((a, b) => b.time - a.time)[0]?.value || null;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadFile(name: string, contents: string, type: string) {
  const href = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  URL.revokeObjectURL(href);
}

export default function WatchCollection() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [discoveries, setDiscoveries] = useState<DiscoveryDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [importingWatch, setImportingWatch] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importFailed, setImportFailed] = useState(false);
  const [duplicateImportUrl, setDuplicateImportUrl] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<{ existing: DuplicateWatchSummary; payload: AddWatchPayload } | null>(null);
  const [savingDuplicate, setSavingDuplicate] = useState(false);
  const [priceWatch, setPriceWatch] = useState<Watch | null>(null);
  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [checkingPrice, setCheckingPrice] = useState(false);
  const [priceCheckMessage, setPriceCheckMessage] = useState("");
  const [marketMatches, setMarketMatches] = useState<MarketMatch[]>([]);
  const [checkingMarket, setCheckingMarket] = useState(false);
  const [marketMessage, setMarketMessage] = useState("");
  const [rouletteWatch, setRouletteWatch] = useState<Watch | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("brand");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateSnapshot>(BUILT_IN_EXCHANGE_RATES);
  const [checkingAllPrices, setCheckingAllPrices] = useState(false);
  const [bulkPriceMessage, setBulkPriceMessage] = useState("");
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [deleteWatch, setDeleteWatch] = useState<Watch | null>(null);
  const [deletingWatch, setDeletingWatch] = useState(false);
  const [workingDraftId, setWorkingDraftId] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [fetchingAllDrafts, setFetchingAllDrafts] = useState(false);
  const [bulkDiscoveryMessage, setBulkDiscoveryMessage] = useState("");
  const [editingDraft, setEditingDraft] = useState<DiscoveryDraft | null>(null);
  const [savingDraftDetails, setSavingDraftDetails] = useState(false);
  const [draftEditError, setDraftEditError] = useState("");
  const watchFormRef = useRef<HTMLFormElement>(null);
  const priceFormRef = useRef<HTMLFormElement>(null);
  const autoMarketRefreshStarted = useRef(false);

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [watchResponse, brandResponse, discoveryResponse] = await Promise.all([
        fetch("/api/watches", { cache: "no-store" }),
        fetch("/api/brands", { cache: "no-store" }),
        fetch("/api/brands/discover", { cache: "no-store" }),
      ]);
      const watchData = (await watchResponse.json()) as { watches?: Watch[]; error?: string };
      const brandData = (await brandResponse.json()) as { brands?: Brand[]; error?: string };
      const discoveryData = (await discoveryResponse.json()) as { discoveries?: DiscoveryDraft[]; error?: string };
      if (!watchResponse.ok) throw new Error(watchData.error || "Couldn’t load your watches.");
      if (!brandResponse.ok) throw new Error(brandData.error || "Couldn’t load your brands.");
      if (!discoveryResponse.ok) throw new Error(discoveryData.error || "Couldn’t load your draft watches.");
      setWatches(watchData.watches || []);
      setBrands(brandData.brands || []);
      setDiscoveries(discoveryData.discoveries || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn’t load your watches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial data hydration is intentionally performed once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const savedView = window.localStorage.getItem(VIEW_PREFERENCE_KEY);
    if (savedView === "list" || savedView === "grid" || savedView === "table") {
      // Restore the user’s display preference after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewMode(savedView);
    }
  }, []);

  useEffect(() => {
    try {
      const savedRates = JSON.parse(window.localStorage.getItem(EXCHANGE_RATES_CACHE_KEY) || "null") as ExchangeRateSnapshot | null;
      if (savedRates?.base === "EUR" && savedRates.date >= BUILT_IN_EXCHANGE_RATES.date && savedRates.rates?.EUR === 1) {
        // Restore the last successful rate snapshot after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExchangeRates(savedRates);
      }
    } catch {
      window.localStorage.removeItem(EXCHANGE_RATES_CACHE_KEY);
    }
    void fetch("/api/exchange-rates", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as ExchangeRateSnapshot : null)
      .then((snapshot) => {
        if (!snapshot?.rates) return;
        setExchangeRates(snapshot);
        window.localStorage.setItem(EXCHANGE_RATES_CACHE_KEY, JSON.stringify(snapshot));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (loading || autoMarketRefreshStarted.current) return;
    autoMarketRefreshStarted.current = true;
    const staleMatches = watches.filter((watch) => watch.marketProvider === "the-watch-info" && watch.marketModelId && (!watch.marketCheckedAt || Date.now() - Date.parse(watch.marketCheckedAt) >= 24 * 60 * 60 * 1000)).slice(0, 100);
    if (!staleMatches.length) return;
    void (async () => {
      for (const watch of staleMatches) {
        try {
          const response = await fetch("/api/market", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "refresh", id: watch.id }),
          });
          const data = await response.json() as { watch?: Watch };
          if (response.ok && data.watch) setWatches((current) => current.map((item) => item.id === data.watch!.id ? data.watch! : item));
        } catch {
          // Automatic refresh is best-effort; the manual control reports provider errors.
        }
      }
    })();
  }, [loading, watches]);

  useEffect(() => {
    if (!showForm && !showBrandForm && !priceWatch && !rouletteWatch && !previewImage && !showGuide && !showVault && !showCompare && !deleteWatch && !duplicateWarning) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!deletingWatch) {
          setShowForm(false);
          setShowBrandForm(false);
          setEditingBrand(null);
          setPriceWatch(null);
          setRouletteWatch(null);
          setPreviewImage(null);
          setShowGuide(false);
          setShowVault(false);
          setShowCompare(false);
          setDeleteWatch(null);
          setDuplicateWarning(null);
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleteWatch, deletingWatch, duplicateWarning, previewImage, priceWatch, rouletteWatch, showBrandForm, showCompare, showForm, showGuide, showVault]);

  const stats = useMemo(
    () => ({
      total: watches.length,
      wishlist: watches.filter((watch) => watch.status === "wishlist").length,
      owned: watches.filter((watch) => watch.status === "owned").length,
      deals: watches.filter(
        (watch) =>
          watch.currentPriceCents !== null &&
          watch.targetPriceCents !== null &&
          watch.currentPriceCents <= watch.targetPriceCents,
      ).length,
      serviceDue: watches.filter(isServiceDue).length,
      wears: watches.reduce((sum, watch) => sum + watch.wearCount, 0),
    }),
    [watches],
  );

  const collectorLedger = useMemo(() => {
    const owned = watches.filter((watch) => watch.status === "owned");
    const wishlist = watches.filter((watch) => watch.status === "wishlist");
    const purchased = owned.filter((watch) => watch.purchasePriceCents !== null);
    const valued = owned.filter((watch) => watch.marketPriceCents !== null || watch.currentPriceCents !== null);
    const valuedWishlist = wishlist.filter((watch) => watch.marketPriceCents !== null || watch.currentPriceCents !== null);
    const recordedPurchases = owned.filter((watch) => watch.purchasePriceCents !== null).length;
    const summarize = (entries: Array<{ cents: number; currency: string }>) => {
      if (entries.every((entry) => entry.currency === LEDGER_CURRENCY)) {
        return formatPrice(entries.reduce((sum, entry) => sum + entry.cents, 0), LEDGER_CURRENCY);
      }
      if (entries.every((entry) => exchangeRates.rates[entry.currency] && exchangeRates.rates[LEDGER_CURRENCY])) {
        const converted = entries.reduce((sum, entry) => sum + (convertCents(entry.cents, entry.currency, LEDGER_CURRENCY, exchangeRates.rates) || 0), 0);
        return `≈ ${formatPrice(converted, LEDGER_CURRENCY)}`;
      }
      return "USD estimate unavailable";
    };
    const purchaseSummary = summarize(purchased.map((watch) => ({ cents: watch.purchasePriceCents!, currency: watch.currency })));
    const currentSummary = summarize(valued.map((watch) => ({
      cents: watch.marketPriceCents ?? watch.currentPriceCents!,
      currency: watch.marketPriceCents !== null ? watch.marketCurrency : watch.currency,
    })));
    const wishlistSummary = summarize(valuedWishlist.map((watch) => ({
      cents: watch.marketPriceCents ?? watch.currentPriceCents!,
      currency: watch.marketPriceCents !== null ? watch.marketCurrency : watch.currency,
    })));
    return {
      purchaseValue: recordedPurchases ? purchaseSummary : "Not recorded",
      currentValue: valued.length ? currentSummary : owned.length ? "Not recorded" : "No watches yet",
      futureSpend: valuedWishlist.length ? wishlistSummary : wishlist.length ? "Not estimated" : "No watches yet",
      providerValues: valued.filter((watch) => watch.marketProvider === "the-watch-info").length,
      recordedPurchases,
      owned: owned.length,
      wishlist: wishlist.length,
      valuedWishlist: valuedWishlist.length,
    };
  }, [exchangeRates, watches]);

  const duplicateGroups = useMemo(() => duplicateListingGroups(watches), [watches]);
  const duplicateWatchIds = useMemo(() => new Set(duplicateGroups.flatMap((group) => group.map((watch) => watch.id))), [duplicateGroups]);
  const duplicateCount = duplicateWatchIds.size;
  const favoriteCount = watches.filter((watch) => watch.status === "wishlist" && watch.isFavorite).length;

  const visibleDrafts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return discoveries.filter((draft) => !normalizedQuery || [draft.brandName, draft.name, draft.reference]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery));
  }, [discoveries, query]);

  const visibleWatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return watches.filter((watch) => {
      const matchesFilter = filter === "all"
        || watch.status === filter
        || (filter === "favorites" && watch.status === "wishlist" && watch.isFavorite)
        || (filter === "deals" && watch.currentPriceCents !== null && watch.targetPriceCents !== null && watch.currentPriceCents <= watch.targetPriceCents)
        || (filter === "service" && isServiceDue(watch))
        || (filter === "duplicates" && duplicateWatchIds.has(watch.id));
      const matchesQuery =
        !normalizedQuery ||
        [watch.brand, watch.model, watch.reference, watch.notes, watch.tags, watch.movement, watch.dialColor]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    }).sort((a, b) => {
      if (sortMode === "grail") return b.grailScore - a.grailScore || a.brand.localeCompare(b.brand);
      if (sortMode === "price-low") return (a.currentPriceCents ?? Number.MAX_SAFE_INTEGER) - (b.currentPriceCents ?? Number.MAX_SAFE_INTEGER);
      if (sortMode === "price-high") return (b.currentPriceCents ?? -1) - (a.currentPriceCents ?? -1);
      if (sortMode === "newest") return b.createdAt.localeCompare(a.createdAt);
      return a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model);
    });
  }, [duplicateWatchIds, filter, query, sortMode, watches]);

  const groupedWatches = useMemo(() => {
    return visibleWatches.reduce<Record<string, Watch[]>>((groups, watch) => {
      (groups[watch.brand] ||= []).push(watch);
      return groups;
    }, {});
  }, [visibleWatches]);

  const brandCounts = useMemo(() => {
    return watches.reduce<Record<string, number>>((counts, watch) => {
      counts[watch.brand.toLowerCase()] = (counts[watch.brand.toLowerCase()] || 0) + 1;
      return counts;
    }, {});
  }, [watches]);

  const compareWatches = useMemo(
    () => compareIds.map((id) => watches.find((watch) => watch.id === id)).filter((watch): watch is Watch => Boolean(watch)),
    [compareIds, watches],
  );

  const heroWatches = useMemo(
    () => [...watches]
      .filter((watch) => watch.imageUrl)
      .sort((a, b) => b.grailScore - a.grailScore || Number(b.status === "owned") - Number(a.status === "owned") || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3),
    [watches],
  );

  function openBrandForm(brand: Brand | null = null) {
    setEditingBrand(brand);
    setShowBrandForm(true);
  }

  function chooseViewMode(mode: ViewMode) {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_PREFERENCE_KEY, mode);
  }

  function openWatchForm() {
    setImportMessage("");
    setImportFailed(false);
    setDuplicateImportUrl("");
    setNewCurrency("USD");
    setNewImageUrl("");
    setShowForm(true);
  }

  function closeBrandForm() {
    setShowBrandForm(false);
    setEditingBrand(null);
  }

  function openPriceWatch(watch: Watch) {
    setPriceCheckMessage("");
    setMarketMessage("");
    setMarketMatches([]);
    setPriceCurrency(watch.currency || "USD");
    setPriceWatch(watch);
  }

  async function fetchDraftsForAllBrands() {
    const eligibleBrands = brands.filter((brand) => Boolean(brand.websiteUrl));
    const skipped = brands.length - eligibleBrands.length;
    if (!eligibleBrands.length) {
      setBulkDiscoveryMessage("Add official websites to followed brands before running a bulk fetch.");
      return;
    }

    setFetchingAllDrafts(true);
    setBulkDiscoveryMessage("Preparing to scan " + eligibleBrands.length + " brands…");
    let found = 0;
    let brandsWithDrafts = 0;
    const failures: string[] = [];

    try {
      for (const [index, brand] of eligibleBrands.entries()) {
        setBulkDiscoveryMessage("Scanning " + brand.name + " — " + (index + 1) + " of " + eligibleBrands.length + " brands…");
        try {
          const response = await fetch("/api/brands/discover", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ brandId: brand.id }),
          });
          const data = await response.json() as { fetch?: { found?: number }; error?: string };
          if (!response.ok) throw new Error(data.error || "Discovery failed.");
          const brandFound = data.fetch?.found || 0;
          found += brandFound;
          if (brandFound > 0) brandsWithDrafts += 1;
        } catch {
          failures.push(brand.name);
        }
      }

      await loadData();
      if (found > 0) setFilter("drafts");
      const skippedNote = skipped ? " " + skipped + " catalog without a website " + (skipped === 1 ? "was" : "were") + " skipped." : "";
      const failureNote = failures.length ? " Couldn’t read: " + failures.slice(0, 4).join(", ") + (failures.length > 4 ? " and " + (failures.length - 4) + " more." : ".") : "";
      setBulkDiscoveryMessage("Found " + found + " new draft " + (found === 1 ? "watch" : "watches") + " across " + brandsWithDrafts + " " + (brandsWithDrafts === 1 ? "brand" : "brands") + "." + skippedNote + failureNote);
    } finally {
      setFetchingAllDrafts(false);
    }
  }

  async function reviewDraft(draft: DiscoveryDraft, action: "keep" | "dismiss") {
    setWorkingDraftId(draft.id);
    setDraftMessage("");
    setError("");
    try {
      const response = await fetch("/api/brands/discover", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, action }),
      });
      const data = await response.json() as { alreadySaved?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn’t update this draft.");
      setDiscoveries((current) => current.filter((item) => item.id !== draft.id));
      if (action === "keep") await loadData();
      setDraftMessage(action === "keep"
        ? data.alreadySaved ? `${draft.name} was already saved, so the draft was cleared.` : `${draft.name} moved to your wishlist.`
        : `${draft.name} dismissed. It won’t be suggested again.`);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Couldn’t update this draft.");
    } finally {
      setWorkingDraftId("");
    }
  }

  async function keepEditedDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDraft) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSavingDraftDetails(true);
    setDraftEditError("");
    try {
      const response = await fetch("/api/brands/discover", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingDraft.id,
          action: "keep",
          details: {
            brand: formData.get("brand"),
            isFavorite: formData.get("isFavorite") === "on",
            model: formData.get("model"),
            reference: formData.get("reference"),
            imageUrl: formData.get("imageUrl"),
            currentPrice: formData.get("currentPrice"),
            targetPrice: formData.get("targetPrice"),
            currency: formData.get("currency"),
            notes: formData.get("notes"),
            grailScore: formData.get("grailScore"),
            movement: formData.get("movement"),
            caseSize: formData.get("caseSize"),
            caseMaterial: formData.get("caseMaterial"),
            dialColor: formData.get("dialColor"),
            waterResistance: formData.get("waterResistance"),
            tags: formData.get("tags"),
          },
        }),
      });
      const data = await response.json() as { alreadySaved?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn’t add this draft.");
      setDiscoveries((current) => current.filter((item) => item.id !== editingDraft.id));
      await loadData();
      setEditingDraft(null);
      setDraftMessage(data.alreadySaved ? editingDraft.name + " was already saved, so the draft was cleared." : editingDraft.name + " was edited and added to your wishlist.");
    } catch (draftError) {
      setDraftEditError(draftError instanceof Error ? draftError.message : "Couldn’t add this draft.");
    } finally {
      setSavingDraftDetails(false);
    }
  }

  async function toggleStatus(watch: Watch) {
    const nextStatus: WatchStatus = watch.status === "owned" ? "wishlist" : "owned";
    setWatches((current) =>
      current.map((item) => (item.id === watch.id ? { ...item, status: nextStatus, isFavorite: nextStatus === "owned" ? false : item.isFavorite } : item)),
    );

    try {
      const response = await fetch("/api/watches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: watch.id, status: nextStatus }),
      });
      if (!response.ok) throw new Error("Couldn’t update this watch.");
    } catch (updateError) {
      setWatches((current) =>
        current.map((item) => (item.id === watch.id ? { ...item, status: watch.status, isFavorite: watch.isFavorite } : item)),
      );
      setError(updateError instanceof Error ? updateError.message : "Couldn’t update this watch.");
    }
  }

  async function toggleFavorite(watch: Watch) {
    const nextFavorite = !watch.isFavorite;
    setWatches((current) =>
      current.map((item) => (item.id === watch.id ? { ...item, isFavorite: nextFavorite } : item)),
    );

    try {
      const response = await fetch("/api/watches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: watch.id, isFavorite: nextFavorite }),
      });
      if (!response.ok) throw new Error("Couldn’t update this favorite.");
    } catch (favoriteError) {
      setWatches((current) =>
        current.map((item) => (item.id === watch.id ? { ...item, isFavorite: watch.isFavorite } : item)),
      );
      setError(favoriteError instanceof Error ? favoriteError.message : "Couldn’t update this favorite.");
    }
  }

  async function cycleGrailScore(watch: Watch) {
    const nextScore = watch.grailScore >= 5 ? 1 : watch.grailScore + 1;
    setWatches((current) => current.map((item) => (item.id === watch.id ? { ...item, grailScore: nextScore } : item)));
    try {
      const response = await fetch("/api/watches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: watch.id, grailScore: nextScore }),
      });
      if (!response.ok) throw new Error("Couldn’t update the grail score.");
    } catch (scoreError) {
      setWatches((current) => current.map((item) => (item.id === watch.id ? { ...item, grailScore: watch.grailScore } : item)));
      setError(scoreError instanceof Error ? scoreError.message : "Couldn’t update the grail score.");
    }
  }

  function spinRoulette() {
    const wishlist = watches.filter((watch) => watch.status === "wishlist");
    const pool = wishlist.length ? wishlist : watches;
    if (!pool.length) {
      setError("Add a watch before spinning the roulette.");
      return;
    }
    const choices = rouletteWatch && pool.length > 1 ? pool.filter((watch) => watch.id !== rouletteWatch.id) : pool;
    setRouletteWatch(choices[Math.floor(Math.random() * choices.length)]);
  }

  function toggleCompare(watch: Watch) {
    setCompareIds((current) => {
      if (current.includes(watch.id)) return current.filter((id) => id !== watch.id);
      if (current.length >= 3) {
        setError("Compare up to three watches at a time.");
        return current;
      }
      return [...current, watch.id];
    });
  }

  async function recordWear(watch: Watch) {
    try {
      const response = await fetch("/api/watches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: watch.id, recordWear: true }),
      });
      const data = (await response.json()) as { watch?: Watch; error?: string };
      if (!response.ok || !data.watch) throw new Error(data.error || "Couldn’t record that wear.");
      setWatches((current) => current.map((item) => (item.id === watch.id ? data.watch! : item)));
      setPriceWatch(data.watch);
      setError("");
    } catch (wearError) {
      setError(wearError instanceof Error ? wearError.message : "Couldn’t record that wear.");
    }
  }

  async function checkAllPrices() {
    const trackable = watches.filter((watch) => watch.listingUrl || (watch.marketProvider === "the-watch-info" && watch.marketModelId));
    if (!trackable.length) {
      setBulkPriceMessage("Add a product-page link or confirm a market match before refreshing prices.");
      return;
    }
    const totalChecks = trackable.reduce((total, watch) => total + Number(Boolean(watch.listingUrl)) + Number(Boolean(watch.marketProvider === "the-watch-info" && watch.marketModelId)), 0);
    setCheckingAllPrices(true);
    setBulkPriceMessage(`Checking 0 of ${totalChecks} price sources…`);
    let checked = 0;
    let failed = 0;
    for (const watch of trackable) {
      if (watch.listingUrl) {
        try {
          const response = await fetch("/api/prices/check", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: watch.id, listingUrl: watch.listingUrl }),
          });
          const data = (await response.json()) as { watch?: Watch };
          if (!response.ok || !data.watch) throw new Error("Price check failed");
          setWatches((current) => current.map((item) => (item.id === data.watch!.id ? data.watch! : item)));
        } catch {
          failed += 1;
        }
        checked += 1;
        setBulkPriceMessage(`Checking ${checked} of ${totalChecks} price sources…`);
      }
      if (watch.marketProvider === "the-watch-info" && watch.marketModelId) {
        try {
          const response = await fetch("/api/market", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "refresh", id: watch.id, force: true }),
          });
          const data = (await response.json()) as { watch?: Watch };
          if (!response.ok || !data.watch) throw new Error("Market check failed");
          setWatches((current) => current.map((item) => (item.id === data.watch!.id ? data.watch! : item)));
        } catch {
          failed += 1;
        }
        checked += 1;
        setBulkPriceMessage(`Checking ${checked} of ${totalChecks} price sources…`);
      }
    }
    setBulkPriceMessage(failed ? `Updated ${checked - failed}; ${failed} price ${failed === 1 ? "source" : "sources"} couldn’t be read.` : `All ${checked} price sources are up to date.`);
    setCheckingAllPrices(false);
  }

  async function downloadBackup(format: "json" | "csv") {
    const date = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      const response = await fetch("/api/backups", { cache: "no-store" });
      const backup = await response.json() as { error?: string };
      if (!response.ok) {
        setRestoreMessage(backup.error || "Couldn’t create the backup.");
        return;
      }
      downloadFile(`crownlog-backup-${date}.json`, JSON.stringify(backup, null, 2), "application/json");
      return;
    }
    const headings = ["Brand", "Model", "Reference", "Status", "Favorite", "Grail score", "Current price", "Target price", "Market estimate", "Market low", "Market high", "Market confidence", "Market samples", "Market provider", "Purchase price", "Currency", "Movement", "Case size", "Case material", "Dial color", "Water resistance", "Tags", "Purchase date", "Last service", "Next service", "Wear count", "Listing URL", "Image URL", "Notes"];
    const rows = watches.map((watch) => [watch.brand, watch.model, watch.reference, watch.status, watch.isFavorite ? "Yes" : "No", watch.grailScore, watch.currentPriceCents === null ? "" : watch.currentPriceCents / 100, watch.targetPriceCents === null ? "" : watch.targetPriceCents / 100, watch.marketPriceCents === null ? "" : watch.marketPriceCents / 100, watch.marketLowCents === null ? "" : watch.marketLowCents / 100, watch.marketHighCents === null ? "" : watch.marketHighCents / 100, watch.marketConfidence, watch.marketSampleSize || "", watch.marketProvider === "the-watch-info" ? "The Watch Info" : watch.marketProvider === "manual" ? "Manual" : "", watch.purchasePriceCents === null ? "" : watch.purchasePriceCents / 100, watch.currency, watch.movement, watch.caseSize, watch.caseMaterial, watch.dialColor, watch.waterResistance, watch.tags, watch.purchaseDate, watch.lastServiceDate, watch.nextServiceDate, watch.wearCount, watch.listingUrl, watch.imageUrl, watch.notes]);
    downloadFile(`crownlog-watches-${date}.csv`, [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20_000_000) {
      setRestoreMessage("That backup is too large to restore here.");
      return;
    }
    setRestoringBackup(true);
    setRestoreMessage("");
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(backup),
      });
      const data = (await response.json()) as { restored?: { brands: number; watches: number; prices: number; discoveries: number }; error?: string };
      if (!response.ok || !data.restored) throw new Error(data.error || "Couldn’t restore that backup.");
      await loadData();
      setCompareIds([]);
      setRestoreMessage(`Restored ${data.restored.watches} watches, ${data.restored.brands} brands, ${data.restored.prices} price records, and ${data.restored.discoveries} discovery records.`);
    } catch (restoreError) {
      setRestoreMessage(restoreError instanceof Error ? restoreError.message : "Couldn’t restore that backup.");
    } finally {
      setRestoringBackup(false);
    }
  }

  async function removeWatch(watch: Watch) {
    const previous = watches;
    setDeletingWatch(true);
    setWatches((current) => current.filter((item) => item.id !== watch.id));
    setCompareIds((current) => current.filter((id) => id !== watch.id));
    try {
      const response = await fetch("/api/watches", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: watch.id }),
      });
      if (!response.ok) throw new Error("Couldn’t remove this watch.");
      setDeleteWatch(null);
    } catch (removeError) {
      setWatches(previous);
      setError(removeError instanceof Error ? removeError.message : "Couldn’t remove this watch.");
    } finally {
      setDeletingWatch(false);
    }
  }

  async function createWatch(payload: AddWatchPayload, allowDuplicate = false) {
    const response = await fetch("/api/watches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, allowDuplicate }),
    });
    const data = (await response.json()) as { watch?: Watch; duplicate?: DuplicateWatchSummary; error?: string };
    if (response.status === 409 && data.duplicate) {
      setDuplicateWarning({ existing: data.duplicate, payload });
      return false;
    }
    if (!response.ok || !data.watch) throw new Error(data.error || "Couldn’t save this watch.");
    await loadData();
    watchFormRef.current?.reset();
    setNewCurrency("USD");
    setNewImageUrl("");
    setDuplicateImportUrl("");
    setDuplicateWarning(null);
    setShowForm(false);
    setFilter("all");
    setQuery("");
    setError("");
    return true;
  }

  async function addWatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: AddWatchPayload = {
      brand: String(formData.get("brand") || ""),
      model: String(formData.get("model") || ""),
      reference: String(formData.get("reference") || ""),
      notes: String(formData.get("notes") || ""),
      status: String(formData.get("status") || "wishlist"),
      isFavorite: formData.get("isFavorite") === "on",
      grailScore: String(formData.get("grailScore") || "3"),
      currentPrice: String(formData.get("currentPrice") || ""),
      targetPrice: String(formData.get("targetPrice") || ""),
      currency: String(formData.get("currency") || "USD"),
      listingUrl: String(formData.get("listingUrl") || ""),
      imageUrl: String(formData.get("imageUrl") || ""),
      movement: String(formData.get("movement") || ""),
      caseSize: String(formData.get("caseSize") || ""),
      caseMaterial: String(formData.get("caseMaterial") || ""),
      dialColor: String(formData.get("dialColor") || ""),
      waterResistance: String(formData.get("waterResistance") || ""),
      tags: String(formData.get("tags") || ""),
      purchasePrice: String(formData.get("purchasePrice") || ""),
      purchaseDate: String(formData.get("purchaseDate") || ""),
    };

    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await createWatch(payload);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn’t save this watch.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function addDuplicateAnyway() {
    if (!duplicateWarning) return;
    setSavingDuplicate(true);
    try {
      await createWatch(duplicateWarning.payload, true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn’t save this watch.");
    } finally {
      setSavingDuplicate(false);
    }
  }

  function openExistingDuplicate() {
    if (!duplicateWarning) return;
    const existing = watches.find((watch) => watch.id === duplicateWarning.existing.id);
    setDuplicateWarning(null);
    setShowForm(false);
    if (existing) openPriceWatch(existing);
  }

  async function importWatchFromUrl() {
    const form = watchFormRef.current;
    if (!form) return;
    const listingUrl = String(new FormData(form).get("listingUrl") || "").trim();
    if (!listingUrl) {
      setImportMessage("Paste a specific watch product link first.");
      setImportFailed(true);
      return;
    }

    const canonicalUrl = canonicalListingUrl(listingUrl);
    const existing = canonicalUrl ? watches.find((watch) => canonicalListingUrl(watch.listingUrl) === canonicalUrl) : undefined;
    if (existing && duplicateImportUrl !== canonicalUrl) {
      setDuplicateImportUrl(canonicalUrl);
      setImportMessage(`Already saved: ${existing.brand} ${existing.model}. Click Fill details again if you still want another.`);
      setImportFailed(true);
      return;
    }

    setImportingWatch(true);
    setImportMessage("");
    setImportFailed(false);
    setDuplicateImportUrl("");
    const importController = new AbortController();
    const importDeadline = setTimeout(() => importController.abort(), 15000);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingUrl }),
        signal: importController.signal,
      });
      const data = (await response.json()) as { product?: ImportedProduct; error?: string };
      if (!response.ok || !data.product) throw new Error(data.error || "Couldn’t import that product page.");
      const product = data.product;
      const setField = (name: string, value: string) => {
        if (!value) return;
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.value = value;
      };
      setField("brand", product.brand);
      setField("model", product.name);
      setField("reference", product.reference);
      setField("listingUrl", product.listingUrl);
      if (product.priceCents !== null) setField("currentPrice", String(product.priceCents / 100));
      setNewCurrency(product.currency || "USD");
      setNewImageUrl(product.imageUrl || "");
      setImportMessage(`Found ${product.name || "the product"}. Review the details, then save it.`);
    } catch (importError) {
      setImportMessage(importController.signal.aborted
        ? "The retailer didn’t answer within 15 seconds. You can try again or enter the watch details manually."
        : importError instanceof Error ? importError.message : "Couldn’t import that product page.");
      setImportFailed(true);
    } finally {
      clearTimeout(importDeadline);
      setImportingWatch(false);
    }
  }

  async function addBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch("/api/brands", {
        method: editingBrand ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingBrand?.id,
          name: formData.get("name"),
          notes: formData.get("notes"),
          websiteUrl: formData.get("websiteUrl"),
          category: formData.get("category"),
        }),
      });
      const data = (await response.json()) as { brand?: Brand; error?: string };
      if (!response.ok || !data.brand) throw new Error(data.error || "Couldn’t save this brand.");
      const savedBrand = data.brand;
      setBrands((current) => {
        const withoutDuplicate = current.filter((brand) => brand.id !== savedBrand.id);
        return [...withoutDuplicate, savedBrand].sort((a, b) => a.name.localeCompare(b.name));
      });
      form.reset();
      closeBrandForm();
      setError("");
    } catch (brandError) {
      setError(brandError instanceof Error ? brandError.message : "Couldn’t save this brand.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function removeBrand(brand: Brand) {
    const previous = brands;
    setBrands((current) => current.filter((item) => item.id !== brand.id));
    try {
      const response = await fetch("/api/brands", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: brand.id }),
      });
      if (!response.ok) throw new Error("Couldn’t remove this brand.");
    } catch (brandError) {
      setBrands(previous);
      setError(brandError instanceof Error ? brandError.message : "Couldn’t remove this brand.");
    }
  }

  async function updatePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priceWatch) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch("/api/watches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: priceWatch.id,
          brand: String(formData.get("brand") || ""),
          model: String(formData.get("model") || ""),
          reference: String(formData.get("reference") || ""),
          notes: String(formData.get("notes") || ""),
          isFavorite: formData.get("isFavorite") === "on",
          currentPrice: String(formData.get("currentPrice") || ""),
          targetPrice: String(formData.get("targetPrice") || ""),
          purchasePrice: String(formData.get("purchasePrice") || ""),
          currency: String(formData.get("currency") || "USD"),
          listingUrl: String(formData.get("listingUrl") || ""),
          imageUrl: String(formData.get("imageUrl") || ""),
          movement: String(formData.get("movement") || ""),
          caseSize: String(formData.get("caseSize") || ""),
          caseMaterial: String(formData.get("caseMaterial") || ""),
          dialColor: String(formData.get("dialColor") || ""),
          waterResistance: String(formData.get("waterResistance") || ""),
          tags: String(formData.get("tags") || ""),
          purchaseDate: String(formData.get("purchaseDate") || ""),
          lastServiceDate: String(formData.get("lastServiceDate") || ""),
          nextServiceDate: String(formData.get("nextServiceDate") || ""),
          manualMarketPrice: String(formData.get("manualMarketPrice") || ""),
          marketCurrency: priceCurrency,
        }),
      });
      const data = (await response.json()) as { watch?: Watch; error?: string };
      if (!response.ok || !data.watch) throw new Error(data.error || "Couldn’t update the price.");
      const updatedWatch = data.watch;
      setWatches((current) => current.map((watch) => (watch.id === updatedWatch.id ? updatedWatch : watch)));
      setPriceWatch(null);
      setError("");
    } catch (priceError) {
      setError(priceError instanceof Error ? priceError.message : "Couldn’t update the price.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function checkListingPrice() {
    if (!priceWatch || !priceFormRef.current) return;
    const formData = new FormData(priceFormRef.current);
    const listingUrl = String(formData.get("listingUrl") || "");
    setCheckingPrice(true);
    setPriceCheckMessage("");
    try {
      const response = await fetch("/api/prices/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: priceWatch.id, listingUrl }),
      });
      const data = (await response.json()) as { watch?: Watch; changed?: boolean; error?: string };
      if (!response.ok || !data.watch) throw new Error(data.error || "Couldn’t check that listing.");
      const updatedWatch = data.watch;
      setWatches((current) => current.map((watch) => (watch.id === updatedWatch.id ? updatedWatch : watch)));
      setPriceCurrency(updatedWatch.currency);
      setPriceWatch(updatedWatch);
      setPriceCheckMessage(data.changed ? `New price found: ${formatPrice(updatedWatch.currentPriceCents, updatedWatch.currency)}.` : `Still ${formatPrice(updatedWatch.currentPriceCents, updatedWatch.currency)} — no change.`);
      setError("");
    } catch (checkError) {
      setPriceCheckMessage(checkError instanceof Error ? checkError.message : "Couldn’t check that listing.");
    } finally {
      setCheckingPrice(false);
    }
  }

  async function findMarketMatches() {
    if (!priceWatch || !priceFormRef.current) return;
    const formData = new FormData(priceFormRef.current);
    setCheckingMarket(true);
    setMarketMessage("");
    setMarketMatches([]);
    try {
      const response = await fetch("/api/market/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: String(formData.get("brand") || ""),
          model: String(formData.get("model") || ""),
          reference: String(formData.get("reference") || ""),
        }),
      });
      const data = await response.json() as { matches?: MarketMatch[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn’t search market data.");
      const matches = data.matches || [];
      setMarketMatches(matches);
      setMarketMessage(matches.length ? "Choose the exact model or closest match." : "The Watch Info does not currently cover this model. You can save a manual estimate instead.");
    } catch (marketError) {
      setMarketMessage(marketError instanceof Error ? marketError.message : "Couldn’t search market data.");
    } finally {
      setCheckingMarket(false);
    }
  }

  async function confirmMarketMatch(match: MarketMatch) {
    if (!priceWatch) return;
    setCheckingMarket(true);
    setMarketMessage(`Loading ${match.name} market data…`);
    try {
      const response = await fetch("/api/market", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm", id: priceWatch.id, marketModelId: match.id }),
      });
      const data = await response.json() as { watch?: Watch; error?: string };
      if (!response.ok || !data.watch) throw new Error(data.error || "Couldn’t save that market match.");
      setWatches((current) => current.map((watch) => watch.id === data.watch!.id ? data.watch! : watch));
      setPriceWatch(data.watch);
      setMarketMatches([]);
      setMarketMessage("Market match confirmed.");
    } catch (marketError) {
      setMarketMessage(marketError instanceof Error ? marketError.message : "Couldn’t save that market match.");
    } finally {
      setCheckingMarket(false);
    }
  }

  async function refreshMarketEstimate(force = true) {
    if (!priceWatch) return;
    setCheckingMarket(true);
    setMarketMessage("");
    try {
      const response = await fetch("/api/market", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh", id: priceWatch.id, force }),
      });
      const data = await response.json() as { watch?: Watch; cached?: boolean; error?: string };
      if (!response.ok || !data.watch) throw new Error(data.error || "Couldn’t refresh the market estimate.");
      setWatches((current) => current.map((watch) => watch.id === data.watch!.id ? data.watch! : watch));
      setPriceWatch(data.watch);
      setMarketMessage(data.cached ? "The saved estimate is less than 24 hours old." : "Market estimate updated.");
    } catch (marketError) {
      setMarketMessage(marketError instanceof Error ? marketError.message : "Couldn’t refresh the market estimate.");
    } finally {
      setCheckingMarket(false);
    }
  }

  async function clearMarketMatch() {
    if (!priceWatch) return;
    setCheckingMarket(true);
    try {
      const response = await fetch("/api/market", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear", id: priceWatch.id }),
      });
      const data = await response.json() as { watch?: Watch; error?: string };
      if (!response.ok || !data.watch) throw new Error(data.error || "Couldn’t clear that market match.");
      setWatches((current) => current.map((watch) => watch.id === data.watch!.id ? data.watch! : watch));
      setPriceWatch(data.watch);
      setMarketMatches([]);
      setMarketMessage("Market match cleared.");
    } catch (marketError) {
      setMarketMessage(marketError instanceof Error ? marketError.message : "Couldn’t clear that market match.");
    } finally {
      setCheckingMarket(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Crownlog home">
          <Image className="brand-lockup-image" src="/og.png" alt="Crownlog — Personal Watch Index" width={210} height={110} />
        </a>
        <div className="topbar-actions">
          <button className="guide-button" onClick={() => setShowVault(true)}>Vault</button>
          <button className="guide-button" onClick={() => setShowGuide(true)}>Guide</button>
          <button className="add-button add-button--compact" onClick={openWatchForm}>
            <span aria-hidden="true">+</span> Add watch
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> THE COLLECTION</div>
        <div className="hero-grid">
          <div className="hero-copy">
            <h1>Watches I’m<br /><em>watching.</em></h1>
            <p>A considered list of future classics, daily wearers, and the ones worth waiting for.</p>
          </div>
          <div className={`hero-showcase hero-showcase--${Math.max(heroWatches.length, 1)}`} aria-label="Featured watches">
            {loading ? (
              <div className="hero-showcase-loading" aria-hidden="true"><span /><span /><span /></div>
            ) : heroWatches.length ? (
              heroWatches.map((watch, index) => (
                <button className={`hero-watch hero-watch--${index + 1}`} key={watch.id} onClick={() => openPriceWatch(watch)} aria-label={`Open ${watch.brand} ${watch.model} details`}>
                  <span className="hero-watch-image">
                    <span aria-hidden="true">{watch.brand.charAt(0)}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={watch.imageUrl} alt={`${watch.brand} ${watch.model}`} referrerPolicy="no-referrer" />
                  </span>
                  <span className="hero-watch-caption"><small>0{index + 1} / {watch.brand}</small><strong>{watch.model}</strong></span>
                </button>
              ))
            ) : (
              <button className="hero-empty-showcase" onClick={openWatchForm}>
                <span className="hero-empty-dial" aria-hidden="true"><i /><b /></span>
                <small>YOUR WATCH BOX</small>
                <strong>Add a watch with an image</strong>
                <em>It will take pride of place here.</em>
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="stats" aria-label="Collection summary">
        <div><span>{stats.total.toString().padStart(2, "0")}</span><small>Total watches</small></div>
        <div><span>{stats.wishlist.toString().padStart(2, "0")}</span><small>On the wishlist</small></div>
        <div><span>{stats.owned.toString().padStart(2, "0")}</span><small>In the collection</small></div>
        <div className={stats.deals ? "has-deals" : ""}><span>{stats.deals.toString().padStart(2, "0")}</span><small>At target price</small></div>
      </section>

      <section className="collector-ledger" aria-labelledby="ledger-heading">
        <div className="ledger-intro">
          <span className="section-number">LEDGER</span>
          <div><h2 id="ledger-heading">Collection at a glance</h2><p>The useful numbers behind the watch box.</p></div>
        </div>
        <div className="ledger-grid">
          <article><small>Purchase total</small><strong>{collectorLedger.purchaseValue}</strong><span>{collectorLedger.recordedPurchases} of {collectorLedger.owned} owned pieces recorded</span></article>
          <article><small>Current tracked value</small><strong>{collectorLedger.currentValue}</strong><span>Market estimates preferred when available{collectorLedger.providerValues > 0 && <a href="https://thewatchinfo.com" target="_blank" rel="noreferrer">Data from The Watch Info ↗</a>}</span></article>
          <article className="future-spend"><small>Future spend</small><strong>{collectorLedger.futureSpend}</strong><span>Estimated in USD for {collectorLedger.valuedWishlist} of {collectorLedger.wishlist} wishlist pieces<em>ECB rate snapshot · {new Date(`${exchangeRates.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</em></span></article>
          <article className={stats.serviceDue ? "needs-attention" : ""}><small>Service desk</small><strong>{stats.serviceDue ? `${stats.serviceDue} due` : "All clear"}</strong><span>Upcoming service dates stay in Details</span></article>
          <article><small>Wrist time</small><strong>{stats.wears} wears</strong><span>Log a wear from an owned watch’s Details</span></article>
        </div>
      </section>

      <section className="brand-directory" aria-labelledby="brands-heading">
        <div className="directory-heading">
          <div>
            <span className="section-number">00</span>
            <div>
              <h2 id="brands-heading">Brands I follow</h2>
              <p>Save a maison now, choose the model later.</p>
            </div>
          </div>
          <div className="directory-actions">
            <button className="outline-button" disabled={fetchingAllDrafts} onClick={() => void fetchDraftsForAllBrands()}><span aria-hidden="true">↻</span> {fetchingAllDrafts ? "Fetching drafts…" : "Fetch all drafts"}</button>
            <button className="outline-button" onClick={() => openBrandForm()}><span aria-hidden="true">+</span> Follow brand</button>
          </div>
        </div>
        {bulkDiscoveryMessage && <div className="bulk-price-message bulk-discovery-message" role="status"><span>{bulkDiscoveryMessage}</span>{!fetchingAllDrafts && <button onClick={() => setBulkDiscoveryMessage("")} aria-label="Dismiss discovery update">×</button>}</div>}
        {brands.length ? (
          <>
          <div className="brand-directory-grid">
            {(showAllBrands ? brands : brands.slice(0, 12)).map((brand) => {
              const modelCount = brandCounts[brand.name.toLowerCase()] || 0;
              return (
                <article
                  className="directory-card"
                  key={brand.id}
                >
                  <a className="directory-card-link" href={`/brands/${encodeURIComponent(brand.id)}`} aria-label={`Open ${brand.name} discovery page`} />
                  <button className="directory-card-edit" onClick={() => openBrandForm(brand)} aria-label={`Edit ${brand.name}`} title="Edit brand">✎</button>
                  <div className="directory-monogram" aria-hidden="true">
                    <span>{brand.name.charAt(0)}</span>
                    {/^(brand|retailer)-/.test(brand.id) && (
                      <Image
                        src={`/brand-logos/${brand.id}.png`}
                        alt=""
                        width={44}
                        height={44}
                        unoptimized
                        loading="lazy"
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                    )}
                  </div>
                  <div>
                    <div className="directory-title"><h3>{brand.name}</h3>{brand.category === "retailer" && <span>Retailer</span>}</div>
                    <p>{brand.notes || (modelCount ? countLabel(modelCount) + " saved" : "No models chosen yet")}</p>
                    {brand.websiteUrl && <a className="directory-link" href={brand.websiteUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Visit site ↗</a>}
                  </div>
                  <span className="model-count">{String(modelCount).padStart(2, "0")}</span>
                  <button className="directory-remove" onClick={() => void removeBrand(brand)} aria-label={`Stop following ${brand.name}`}>×</button>
                </article>
              );
            })}
          </div>
          {brands.length > 12 && (
            <button className="show-brands-button" onClick={() => setShowAllBrands((current) => !current)}>
              {showAllBrands ? "Show fewer brands" : `View all ${brands.length} brands`}
            </button>
          )}
          </>
        ) : (
          <button className="brand-empty" onClick={() => openBrandForm()}>
            <span className="brand-empty-mark" aria-hidden="true">+</span>
            <span><strong>Follow your first brand</strong><small>For the houses where choosing one model is impossible.</small></span>
          </button>
        )}
      </section>

      <section className="collection-section" aria-labelledby="collection-heading">
        <div className="collection-heading">
          <div>
            <span className="section-number">01</span>
            <h2 id="collection-heading">The collection</h2>
          </div>
          <div className="collection-actions">
            <button className="outline-button refresh-button" disabled={checkingAllPrices} onClick={() => void checkAllPrices()} aria-label={checkingAllPrices ? "Refreshing all prices" : "Refresh all listing prices and market estimates"} title="Refresh all listing prices and market estimates"><span aria-hidden="true">↻</span> {checkingAllPrices ? "Checking…" : "Refresh all prices"}</button>
            <button className="outline-button roulette-button" onClick={spinRoulette}><span aria-hidden="true">↻</span> Watch roulette</button>
            <button className="add-button add-button--desktop" onClick={openWatchForm}>
              <span aria-hidden="true">+</span> Add watch
            </button>
          </div>
        </div>

        <div className={`controls ${filter === "drafts" ? "is-drafts" : ""}`}>
          <label className="search-control">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search watches</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={filter === "drafts" ? "Search draft brand, model, or reference" : "Search brand, model, or reference"}
            />
          </label>
          <label className="filter-control">
            <span className="sr-only">Filter collection</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Show collection">
              {FILTERS.filter((item) => item.value !== "duplicates" || duplicateCount > 0).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value === "drafts" ? `Show: ${item.label} (${discoveries.length})` : item.value === "favorites" ? `Show: ${item.label} (${favoriteCount})` : `Show: ${item.label}`}
                </option>
              ))}
            </select>
          </label>
          {filter !== "drafts" && (
            <>
              <label className="sort-control">
                <span className="sr-only">Sort watches</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="brand">Sort: Brand</option>
                  <option value="grail">Sort: Grail score</option>
                  <option value="price-low">Sort: Price low</option>
                  <option value="price-high">Sort: Price high</option>
                  <option value="newest">Sort: Newest</option>
                </select>
              </label>
              <div className="view-toggle" aria-label="Display watches">
                <button className={viewMode === "list" ? "active" : ""} onClick={() => chooseViewMode("list")} aria-pressed={viewMode === "list"} title="List view"><span aria-hidden="true">☰</span> List</button>
                <button className={viewMode === "grid" ? "active" : ""} onClick={() => chooseViewMode("grid")} aria-pressed={viewMode === "grid"} title="Grid view"><span aria-hidden="true">▦</span> Grid</button>
                <button className={viewMode === "table" ? "active" : ""} onClick={() => chooseViewMode("table")} aria-pressed={viewMode === "table"} title="Compact table view"><span aria-hidden="true">▤</span> Table</button>
              </div>
            </>
          )}
        </div>

        {bulkPriceMessage && <div className="bulk-price-message" role="status"><span>{bulkPriceMessage}</span><button onClick={() => setBulkPriceMessage("")} aria-label="Dismiss price update">×</button></div>}
        {draftMessage && <div className="bulk-price-message" role="status"><span>{draftMessage}</span><button onClick={() => setDraftMessage("")} aria-label="Dismiss draft update">×</button></div>}

        {duplicateCount > 0 && (
          <button
            className="duplicate-notice"
            onClick={() => {
              setFilter("duplicates");
              setQuery("");
              document.getElementById("collection-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span aria-hidden="true">!</span>
            <strong>You have {duplicateCount} duplicate {duplicateCount === 1 ? "watch" : "watches"}.</strong>
            <em>Click here to review.</em>
          </button>
        )}

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss message">×</button>
          </div>
        )}

        {loading ? (
          <div className="loading-state" role="status">
            <span className="loading-dial" aria-hidden="true" />
            Opening the watch box…
          </div>
        ) : filter === "drafts" ? (
          visibleDrafts.length ? (
            <div className="collection-drafts">
              <div className="discovery-heading">
                <div><span className="section-number">IN REVIEW</span><h2>Draft watches</h2></div>
                <p>Fetched from brand and retailer catalogs. Nothing joins your wishlist until you keep it.</p>
              </div>
              <div className="discovery-grid collection-draft-grid">
                {visibleDrafts.map((draft) => (
                  <article className="discovery-card" key={draft.id}>
                    <div className="discovery-image"><span>{draft.brandName.charAt(0)}</span>{draft.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draft.imageUrl} alt={`${draft.brandName} ${draft.name}`} loading="lazy" referrerPolicy="no-referrer" />
                    )}</div>
                    <div className="discovery-card-copy">
                      <small>{draft.brandName}</small>
                      <h3><button className="draft-title-button" onClick={() => { setDraftEditError(""); setEditingDraft(draft); }}>{draft.name}</button></h3>
                      <p>{draft.reference ? `Ref. ${draft.reference}` : "Reference unavailable"}</p>
                      <strong>{draft.priceCents === null ? "Price unavailable" : formatPrice(draft.priceCents, draft.currency)}</strong>
                      <a href={draft.sourceUrl} target="_blank" rel="noreferrer">Open product page ↗</a>
                      <a href={`/brands/${encodeURIComponent(draft.brandId)}`}>Open brand tray →</a>
                    </div>
                    <div className="discovery-card-actions">
                      <button className="text-button is-danger" disabled={workingDraftId === draft.id} onClick={() => void reviewDraft(draft, "dismiss")}>Dismiss</button>
                      <button className="outline-button draft-edit-button" disabled={workingDraftId === draft.id} onClick={() => { setDraftEditError(""); setEditingDraft(draft); }}>Edit before adding</button>
                      <button className="add-button" disabled={workingDraftId === draft.id} onClick={() => void reviewDraft(draft, "keep")}>{workingDraftId === draft.id ? "Saving…" : "Keep + wishlist"}</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-dial" aria-hidden="true"><span /></div>
              <h3>{discoveries.length ? "No draft watches found" : "Your draft tray is clear"}</h3>
              <p>{discoveries.length ? "Try a different search." : "Fetch new watches from a brand page and they’ll appear here for review."}</p>
              {!discoveries.length && <a className="outline-button drafts-brand-link" href="#brands-heading">Browse followed brands</a>}
            </div>
          )
        ) : Object.keys(groupedWatches).length ? (
          <div className={`brand-groups is-${viewMode}`}>
            <div className="watch-table-header" aria-hidden="true">
              <span>Image</span><span>Brand</span><span>Model / reference</span><span>Listing price</span><span>Market estimate</span><span>Last checked</span><span>Favorite</span><span>Status</span><span />
            </div>
            {Object.entries(groupedWatches).map(([brand, brandWatches]) => (
              <section className="brand-group" key={brand} aria-labelledby={`brand-${brand}`}>
                <div className="brand-heading">
                  <div className="brand-initial" aria-hidden="true">{brand.charAt(0)}</div>
                  <div>
                    <h3 id={`brand-${brand}`}>{brand}</h3>
                    <p>{countLabel(brandWatches.length)}</p>
                  </div>
                </div>

                <div className="watch-list">
                  {brandWatches.map((watch, index) => (
                    <article className="watch-card" key={watch.id}>
                      <div className="watch-index">{String(index + 1).padStart(2, "0")}</div>
                      <div className="watch-photo">
                        <span aria-hidden="true">{watch.brand.charAt(0)}</span>
                        {watch.imageUrl && (
                          <button className="watch-photo-button" onClick={() => setPreviewImage({ url: watch.imageUrl, alt: `${watch.brand} ${watch.model}` })} aria-label={`Enlarge image of ${watch.brand} ${watch.model}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={watch.imageUrl} alt={`${watch.brand} ${watch.model}`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                          </button>
                        )}
                      </div>
                      <div className="watch-table-brand">{watch.brand}</div>
                      <div className="watch-main">
                        <span className="watch-grid-brand">{watch.brand}</span>
                        <h4><button className="watch-title-button" onClick={() => openPriceWatch(watch)}>{watch.model}</button></h4>
                        {watch.listingUrl && (
                          <a className="watch-listing-link" href={watch.listingUrl} target="_blank" rel="noreferrer" aria-label={`Open the listing for ${watch.brand} ${watch.model} in a new tab`}>
                            Open listing <span aria-hidden="true">↗</span>
                          </a>
                        )}
                        <span className="watch-table-reference">{watch.reference ? `Ref. ${watch.reference}` : "No reference"}</span>
                        <div className="watch-meta">
                          {watch.reference && <span>REF. {watch.reference}</span>}
                          <button className="grail-score" onClick={() => void cycleGrailScore(watch)} aria-label={`Grail score ${watch.grailScore} out of 5. Click to increase.`}>
                            <span aria-hidden="true">{"●".repeat(watch.grailScore)}{"○".repeat(5 - watch.grailScore)}</span> Grail {watch.grailScore}/5
                          </button>
                          {watch.notes && <span className="watch-notes">{watch.notes}</span>}
                        </div>
                        <div className="watch-badges">
                          {watch.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                          {watch.wearCount > 0 && <span>{watch.wearCount} {watch.wearCount === 1 ? "wear" : "wears"}</span>}
                          {isServiceDue(watch) && <span className="service-due">Service due</span>}
                          <button className={compareIds.includes(watch.id) ? "compare-toggle is-selected" : "compare-toggle"} onClick={() => toggleCompare(watch)}>{compareIds.includes(watch.id) ? "✓ Comparing" : "+ Compare"}</button>
                        </div>
                      </div>
                      <div className={`price-block ${watch.currentPriceCents !== null && watch.targetPriceCents !== null && watch.currentPriceCents <= watch.targetPriceCents ? "is-deal" : ""}`}>
                        {watch.currentPriceCents !== null ? (
                          <>
                            <strong>{formatPrice(watch.currentPriceCents, watch.currency)}</strong>
                            <small>
                              {watch.targetPriceCents !== null && watch.currentPriceCents <= watch.targetPriceCents
                                ? "At target — take a look"
                                : watch.targetPriceCents !== null
                                  ? `Target ${formatPrice(watch.targetPriceCents, watch.currency)}`
                                  : "Latest price"}
                            </small>
                          </>
                        ) : (
                          <><strong>Track price</strong><small>Add a target</small></>
                        )}
                        {watch.priceHistory.length > 1 && (
                          <div className="mini-spark" aria-label={`${watch.priceHistory.length} recorded prices`}>
                            {sparkHeights(watch.priceHistory).map((point) => <i key={point.id} style={{ height: `${point.height}%` }} />)}
                          </div>
                        )}
                        {watch.marketPriceCents !== null && (
                          <div className="card-market-estimate">
                            <span>Market {formatPrice(watch.marketPriceCents, watch.marketCurrency)}</span>
                            {watch.marketProvider === "the-watch-info" ? <a href="https://thewatchinfo.com" target="_blank" rel="noreferrer">The Watch Info</a> : <small>Manual estimate</small>}
                          </div>
                        )}
                        <button onClick={() => openPriceWatch(watch)}>Details</button>
                      </div>
                      <div className="watch-table-market">
                        <strong>{formatPrice(watch.marketPriceCents, watch.marketCurrency)}</strong>
                        {watch.marketProvider === "the-watch-info" ? <a href="https://thewatchinfo.com" target="_blank" rel="noreferrer">The Watch Info</a> : <small>{watch.marketProvider === "manual" ? "Manual" : "Not tracked"}</small>}
                      </div>
                      <div className="watch-table-checked">{latestPriceCheck(watch) ? new Date(latestPriceCheck(watch)!).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never"}</div>
                      {watch.status === "wishlist" && (
                        <button
                          className={"favorite-toggle" + (watch.isFavorite ? " is-favorite" : "")}
                          onClick={() => void toggleFavorite(watch)}
                          aria-pressed={watch.isFavorite}
                          aria-label={(watch.isFavorite ? "Remove " : "Add ") + watch.model + (watch.isFavorite ? " from favorites" : " to favorites")}
                          title={watch.isFavorite ? "Remove from favorites" : "Add to favorites"}
                        >
                          <span aria-hidden="true">{watch.isFavorite ? "♥" : "♡"}</span>
                        </button>
                      )}
                      <button
                        className={`status-toggle ${watch.status === "owned" ? "is-owned" : ""}`}
                        onClick={() => void toggleStatus(watch)}
                        aria-label={watch.status === "owned" ? `Mark ${watch.model} as wishlist` : `Mark ${watch.model} as purchased`}
                      >
                        <span aria-hidden="true">{watch.status === "owned" ? "✓" : "○"}</span>
                        {watch.status === "owned" ? "Purchased" : "Wishlist"}
                      </button>
                      <button
                        className="remove-button"
                        onClick={() => setDeleteWatch(watch)}
                        aria-label={`Remove ${watch.model}`}
                        title="Remove watch"
                      >
                        ×
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-dial" aria-hidden="true"><span /></div>
            <h3>{watches.length ? "No watches found" : "Your next watch starts here"}</h3>
            <p>
              {watches.length
                ? "Try a different search or collection filter."
                : "Add the first piece to your personal shortlist."}
            </p>
            {!watches.length && (
              <button className="add-button" onClick={openWatchForm}>
                <span aria-hidden="true">+</span> Add your first watch
              </button>
            )}
          </div>
        )}
      </section>

      {compareIds.length > 0 && (
        <aside className="compare-tray" aria-label="Watch comparison">
          <div><strong>{compareIds.length}/3 selected</strong><span>{compareIds.length < 2 ? "Choose one more watch to compare" : compareWatches.map((watch) => watch.model).join(" · ")}</span></div>
          <button className="tray-clear" onClick={() => setCompareIds([])}>Clear</button>
          <button className="add-button" disabled={compareIds.length < 2} onClick={() => setShowCompare(true)}>Compare watches</button>
        </aside>
      )}

      <footer>
        <span>CROWNLOG / PRIVATE INDEX</span>
        <p>Built for the pieces worth remembering.</p>
        <span>EST. 2026</span>
      </footer>

      {showGuide && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowGuide(false);
        }}>
          <section className="watch-modal guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow"><span /> QUICK GUIDE</span>
                <h2 id="guide-title">Where everything lives</h2>
              </div>
              <button onClick={() => setShowGuide(false)} aria-label="Close guide">×</button>
            </div>
            <div className="guide-grid">
              <article><span>01</span><h3>Add a watch</h3><p>Choose <strong>Add watch</strong>. Paste a product URL and use <strong>Fill details</strong>, or complete the fields manually.</p></article>
              <article><span>02</span><h3>Brands</h3><p>Use <strong>Follow brand</strong>. Open a brand card for its Discovery Tray, or use the edit icon to change its website and notes.</p></article>
              <article><span>03</span><h3>Edit & catalog</h3><p>Open <strong>Details</strong> to edit a watch, add its specifications, tags, purchase record, and service dates.</p></article>
              <article><span>04</span><h3>Prices</h3><p>Track an exact listing, confirm a free market estimate in <strong>Details</strong>, or use <strong>Refresh all prices</strong> for both.</p></article>
              <article><span>05</span><h3>Find things</h3><p>Search notes and tags, filter deals or service-due pieces, and sort by grail, price, or date.</p></article>
              <article><span>06</span><h3>Compare</h3><p>Choose <strong>+ Compare</strong> on two or three watches to line up their specs, prices, and scores.</p></article>
              <article><span>07</span><h3>Collector ledger</h3><p>See purchase value, current value, service reminders, and wrist time. Log wears inside an owned watch’s Details.</p></article>
              <article><span>08</span><h3>Data vault</h3><p>Use <strong>Vault</strong> to download a backup, export a CSV, or merge a Crownlog backup into the collection.</p></article>
              <article><span>09</span><h3>Watch roulette</h3><p>Use <strong>Watch roulette</strong> beside the collection heading whenever you want Crownlog to pick one.</p></article>
            </div>
          </section>
        </div>
      )}

      {editingDraft && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (!savingDraftDetails && event.target === event.currentTarget) setEditingDraft(null);
        }}>
          <section className="watch-modal details-modal draft-edit-modal" role="dialog" aria-modal="true" aria-labelledby="draft-edit-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow"><span /> EDIT DRAFT</span>
                <h2 id="draft-edit-title">{editingDraft.brandName} / {editingDraft.name}</h2>
              </div>
              <button disabled={savingDraftDetails} onClick={() => setEditingDraft(null)} aria-label="Close draft editor">×</button>
            </div>
            <form onSubmit={keepEditedDraft}>
              <div className="field-row">
                <label><span>Brand *</span><input name="brand" required defaultValue={editingDraft.brandName} /></label>
                <label><span>Model *</span><input name="model" required defaultValue={editingDraft.name} /></label>
              </div>
              <label><span>Reference</span><input name="reference" defaultValue={editingDraft.reference} /></label>
              <div className="field-row">
                <label><span>Current price</span><input name="currentPrice" inputMode="decimal" defaultValue={editingDraft.priceCents === null ? "" : editingDraft.priceCents / 100} /></label>
                <label><span>Target price</span><input name="targetPrice" inputMode="decimal" placeholder="Optional" /></label>
              </div>
              <div className="field-row">
                <label><span>Currency</span><select name="currency" defaultValue={editingDraft.currency}>{["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "JPY"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
                <label><span>Grail score</span><select name="grailScore" defaultValue="3">{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} / 5</option>)}</select></label>
              </div>
              <label className="favorite-field">
                <input type="checkbox" name="isFavorite" />
                <span className="favorite-field-heart" aria-hidden="true">♥</span>
                <span className="favorite-field-copy"><strong>Favorite this watch</strong><small>Add it to Favorites when this draft joins the wishlist.</small></span>
              </label>
              <label><span>Image URL</span><input name="imageUrl" type="url" defaultValue={editingDraft.imageUrl} placeholder="https://…" /></label>
              <label><span>Notes</span><textarea name="notes" rows={3} placeholder="Why it caught your eye, dial variant, preferred configuration…" /></label>
              <div className="detail-section-heading"><span>SPECIFICATIONS</span></div>
              <div className="field-row">
                <label><span>Movement</span><input name="movement" placeholder="e.g. Miyota 9039 automatic" /></label>
                <label><span>Case size</span><input name="caseSize" placeholder="e.g. 38 mm" /></label>
              </div>
              <div className="field-row">
                <label><span>Case material</span><input name="caseMaterial" placeholder="e.g. Titanium" /></label>
                <label><span>Dial color</span><input name="dialColor" placeholder="e.g. Salmon" /></label>
              </div>
              <div className="field-row">
                <label><span>Water resistance</span><input name="waterResistance" placeholder="e.g. 100 m" /></label>
                <label><span>Tags</span><input name="tags" placeholder="microbrand, diver, summer" /></label>
              </div>
              <a className="listing-link" href={editingDraft.sourceUrl} target="_blank" rel="noreferrer">Open original product page ↗</a>
              {draftEditError && <div className="price-check-status is-error" role="alert">{draftEditError}</div>}
              <div className="modal-actions">
                <button type="button" className="cancel-button" disabled={savingDraftDetails} onClick={() => setEditingDraft(null)}>Cancel</button>
                <button type="submit" className="add-button" disabled={savingDraftDetails}>{savingDraftDetails ? "Adding…" : "Save details + wishlist"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteWatch && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (!deletingWatch && event.target === event.currentTarget) setDeleteWatch(null);
        }}>
          <section className="watch-modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-watch-title" aria-describedby="delete-watch-description">
            <div className="delete-mark" aria-hidden="true">×</div>
            <span className="eyebrow"><span /> REMOVE WATCH</span>
            <h2 id="delete-watch-title">Delete {deleteWatch.model}?</h2>
            <p id="delete-watch-description">
              This will permanently remove the {deleteWatch.brand} {deleteWatch.model}
              {deleteWatch.priceHistory.length ? ` and ${deleteWatch.priceHistory.length} saved price ${deleteWatch.priceHistory.length === 1 ? "record" : "records"}` : ""}.
            </p>
            <div className="delete-actions">
              <button className="cancel-button" disabled={deletingWatch} onClick={() => setDeleteWatch(null)}>Keep watch</button>
              <button className="danger-button" disabled={deletingWatch} onClick={() => void removeWatch(deleteWatch)}>{deletingWatch ? "Deleting…" : "Delete watch"}</button>
            </div>
          </section>
        </div>
      )}

      {duplicateWarning && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (!savingDuplicate && event.target === event.currentTarget) setDuplicateWarning(null);
        }}>
          <section className="watch-modal duplicate-modal" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-watch-title" aria-describedby="duplicate-watch-description">
            <div className="duplicate-mark" aria-hidden="true">!</div>
            <span className="eyebrow"><span /> POSSIBLE DUPLICATE</span>
            <h2 id="duplicate-watch-title">That link is already saved.</h2>
            <p id="duplicate-watch-description">
              Crownlog found {duplicateWarning.existing.brand} {duplicateWarning.existing.model} with the same product link.
            </p>
            <div className="duplicate-actions">
              <button className="cancel-button" disabled={savingDuplicate} onClick={() => setDuplicateWarning(null)}>Go back</button>
              <button className="outline-button" disabled={savingDuplicate} onClick={openExistingDuplicate}>Open existing</button>
              <button className="add-button" disabled={savingDuplicate} onClick={() => void addDuplicateAnyway()}>{savingDuplicate ? "Adding…" : "Add anyway"}</button>
            </div>
          </section>
        </div>
      )}

      {showVault && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowVault(false);
        }}>
          <section className="watch-modal vault-modal" role="dialog" aria-modal="true" aria-labelledby="vault-title">
            <div className="modal-header">
              <div><span className="eyebrow"><span /> DATA VAULT</span><h2 id="vault-title">Your collection, portable.</h2></div>
              <button onClick={() => setShowVault(false)} aria-label="Close data vault">×</button>
            </div>
            <div className="vault-content">
              <p>Crownlog keeps the working collection in its database. These downloads give you a personal copy whenever you want one.</p>
              <div className="vault-grid">
                <article><span>FULL BACKUP</span><h3>JSON archive</h3><p>Every brand, watch, discovery decision, ownership record, and price-history point in one structured file.</p><button className="add-button" onClick={() => void downloadBackup("json")}>Download JSON</button></article>
                <article><span>SPREADSHEET</span><h3>Watch CSV</h3><p>A clean table of the watch collection for Excel, Numbers, Google Sheets, or your own analysis.</p><button className="outline-button" onClick={() => void downloadBackup("csv")}>Download CSV</button></article>
              </div>
              <div className="restore-panel">
                <div><span>RESTORE</span><strong>Merge a Crownlog backup</strong><p>Existing matching records are updated; anything else is added. Nothing outside the backup is removed.</p></div>
                <label className={restoringBackup ? "outline-button is-loading" : "outline-button"}>
                  {restoringBackup ? "Restoring…" : "Choose JSON"}
                  <input type="file" accept="application/json,.json" disabled={restoringBackup} onChange={(event) => void restoreBackup(event)} />
                </label>
              </div>
              {restoreMessage && <div className="restore-message" role="status">{restoreMessage}</div>}
              <small>{brands.length} brands · {watches.length} watches · {watches.reduce((sum, watch) => sum + watch.priceHistory.length, 0)} price records</small>
            </div>
          </section>
        </div>
      )}

      {showCompare && compareWatches.length >= 2 && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowCompare(false);
        }}>
          <section className="watch-modal compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title">
            <div className="modal-header">
              <div><span className="eyebrow"><span /> SIDE BY SIDE</span><h2 id="compare-title">The shortlist</h2></div>
              <button onClick={() => setShowCompare(false)} aria-label="Close comparison">×</button>
            </div>
            <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${compareWatches.length}, minmax(180px, 1fr))` }}>
              {compareWatches.map((watch) => (
                <article className="compare-watch" key={watch.id}>
                  <button className="compare-remove" onClick={() => toggleCompare(watch)} aria-label={`Remove ${watch.model} from comparison`}>×</button>
                  <div className="compare-photo"><span>{watch.brand.charAt(0)}</span>{watch.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={watch.imageUrl} alt="" referrerPolicy="no-referrer" />
                  )}</div>
                  <small>{watch.brand}</small><h3>{watch.model}</h3><p>{watch.reference || "Reference not recorded"}</p>
                  <dl>
                    <div><dt>Grail</dt><dd>{watch.grailScore}/5</dd></div>
                    <div><dt>Price</dt><dd>{formatPrice(watch.currentPriceCents, watch.currency)}</dd></div>
                    <div><dt>Market estimate</dt><dd>{formatPrice(watch.marketPriceCents, watch.marketCurrency)}{watch.marketProvider === "the-watch-info" && <a className="compare-source" href="https://thewatchinfo.com" target="_blank" rel="noreferrer">The Watch Info</a>}</dd></div>
                    <div><dt>Target</dt><dd>{formatPrice(watch.targetPriceCents, watch.currency)}</dd></div>
                    <div><dt>Movement</dt><dd>{watch.movement || "—"}</dd></div>
                    <div><dt>Case</dt><dd>{watch.caseSize || "—"}</dd></div>
                    <div><dt>Material</dt><dd>{watch.caseMaterial || "—"}</dd></div>
                    <div><dt>Dial</dt><dd>{watch.dialColor || "—"}</dd></div>
                    <div><dt>Water resistance</dt><dd>{watch.waterResistance || "—"}</dd></div>
                  </dl>
                  <button className="outline-button compare-details" onClick={() => { setShowCompare(false); openPriceWatch(watch); }}>Open details</button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowForm(false);
        }}>
          <section className="watch-modal" role="dialog" aria-modal="true" aria-labelledby="add-watch-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow"><span /> NEW PIECE</span>
                <h2 id="add-watch-title">Add to the list</h2>
              </div>
              <button onClick={() => setShowForm(false)} aria-label="Close add watch form">×</button>
            </div>
            <form ref={watchFormRef} onSubmit={addWatch}>
              <div className="import-panel">
                <div>
                  <strong>Add from a product page</strong>
                  <small>Paste the exact watch listing—not the brand homepage.</small>
                </div>
                <div className="import-url-row">
                  <input name="listingUrl" type="url" placeholder="https://brand.com/products/watch" autoComplete="url" />
                  <button type="button" className="outline-button" disabled={importingWatch} onClick={() => void importWatchFromUrl()}>{importingWatch ? "Reading…" : "Fill details"}</button>
                </div>
                {importMessage && <p className={importFailed ? "is-error" : ""} role="status">{importMessage}</p>}
              </div>
              <div className="field-row">
                <label>
                  <span>Brand *</span>
                  <input name="brand" required placeholder="e.g. Omega" autoComplete="off" />
                </label>
                <label>
                  <span>Model *</span>
                  <input name="model" required placeholder="e.g. Speedmaster" autoComplete="off" />
                </label>
              </div>
              <label>
                <span>Reference</span>
                <input name="reference" placeholder="e.g. 310.30.42.50.01.002" autoComplete="off" />
              </label>
              <div className="watch-image-field">
                <label>
                  <span>Watch image</span>
                  <input name="imageUrl" type="url" value={newImageUrl} onChange={(event) => setNewImageUrl(event.target.value)} placeholder="https://…/watch.jpg" autoComplete="url" />
                  <small>Filled automatically from product pages, or paste a direct HTTPS image link.</small>
                </label>
                <div className="watch-image-preview">
                  <span>{newImageUrl ? "Image unavailable" : "Image preview"}</span>
                  {newImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={newImageUrl} alt="Watch preview" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  )}
                </div>
              </div>
              <div className="field-row">
                <label>
                  <span>Current price</span>
                  <div className="currency-input"><span>{currencyMark(newCurrency)}</span><input name="currentPrice" inputMode="decimal" placeholder="6,500" /></div>
                </label>
                <label>
                  <span>Your target price</span>
                  <div className="currency-input"><span>{currencyMark(newCurrency)}</span><input name="targetPrice" inputMode="decimal" placeholder="5,900" /></div>
                </label>
              </div>
              <label>
                <span>Price currency</span>
                <select name="currency" value={newCurrency} onChange={(event) => setNewCurrency(event.target.value)}>
                  {['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              <label>
                <span>A note for yourself</span>
                <textarea name="notes" rows={3} placeholder="Dial, year, size, price target…" />
              </label>
              <details className="advanced-fields">
                <summary>Specifications & ownership</summary>
                <div className="field-row">
                  <label><span>Movement</span><input name="movement" placeholder="e.g. Miyota 9039 automatic" /></label>
                  <label><span>Case size</span><input name="caseSize" placeholder="e.g. 38 mm" /></label>
                </div>
                <div className="field-row">
                  <label><span>Case material</span><input name="caseMaterial" placeholder="e.g. Stainless steel" /></label>
                  <label><span>Dial color</span><input name="dialColor" placeholder="e.g. Salmon" /></label>
                </div>
                <label><span>Water resistance</span><input name="waterResistance" placeholder="e.g. 100 m" /></label>
                <label><span>Tags</span><input name="tags" placeholder="microbrand, diver, summer" /><small>Separate tags with commas.</small></label>
                <div className="field-row">
                  <label><span>Purchase price</span><div className="currency-input"><span>{currencyMark(newCurrency)}</span><input name="purchasePrice" inputMode="decimal" placeholder="Optional" /></div></label>
                  <label><span>Purchase date</span><input name="purchaseDate" type="date" /></label>
                </div>
              </details>
              <fieldset>
                <legend>Grail score</legend>
                <div className="grail-options">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <label key={score}><input type="radio" name="grailScore" value={score} defaultChecked={score === 3} /><span>{score}<small>{score === 1 ? "Curious" : score === 5 ? "The grail" : ""}</small></span></label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Where does it belong?</legend>
                <div className="status-options">
                  <label><input type="radio" name="status" value="wishlist" defaultChecked /><span>Wishlist</span></label>
                  <label><input type="radio" name="status" value="owned" /><span>Purchased</span></label>
                </div>
              </fieldset>
              <label className="favorite-field">
                <input type="checkbox" name="isFavorite" />
                <span className="favorite-field-heart" aria-hidden="true">♥</span>
                <span className="favorite-field-copy"><strong>Favorite this watch</strong><small>Add it to the Favorites filter as soon as it is saved.</small></span>
              </label>
              <div className="modal-actions">
                <button type="button" className="cancel-button" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="add-button"><span aria-hidden="true">+</span> Save watch</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showBrandForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeBrandForm();
        }}>
          <section className="watch-modal brand-modal" role="dialog" aria-modal="true" aria-labelledby="add-brand-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow"><span /> BRAND DIRECTORY</span>
                <h2 id="add-brand-title">{editingBrand ? "Edit brand" : "Follow a brand"}</h2>
              </div>
              <button onClick={closeBrandForm} aria-label="Close brand form">×</button>
            </div>
            <form onSubmit={addBrand}>
              <label>
                <span>Brand name *</span>
                <input name="name" required defaultValue={editingBrand?.name || ""} placeholder="e.g. Jaeger-LeCoultre" autoComplete="off" />
              </label>
              <label>
                <span>What draws you to it?</span>
                <textarea name="notes" rows={3} defaultValue={editingBrand?.notes || ""} placeholder="Design language, history, movements…" />
              </label>
              <label>
                <span>Website</span>
                <input name="websiteUrl" type="url" defaultValue={editingBrand?.websiteUrl || ""} placeholder="https://…" autoComplete="url" />
              </label>
              <fieldset>
                <legend>Directory type</legend>
                <div className="status-options">
                  <label><input type="radio" name="category" value="brand" defaultChecked={!editingBrand || editingBrand.category === "brand"} /><span>Watch brand</span></label>
                  <label><input type="radio" name="category" value="retailer" defaultChecked={editingBrand?.category === "retailer"} /><span>Retailer</span></label>
                </div>
              </fieldset>
              <div className="price-note">
                <span aria-hidden="true">i</span>
                You can follow a brand without adding any individual models.
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-button" onClick={closeBrandForm}>Cancel</button>
                <button type="submit" className="add-button"><span aria-hidden="true">{editingBrand ? "✓" : "+"}</span> {editingBrand ? "Save changes" : "Follow brand"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {priceWatch && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPriceWatch(null);
        }}>
          <section className="watch-modal price-modal details-modal" role="dialog" aria-modal="true" aria-labelledby="price-watch-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow"><span /> WATCH DETAILS</span>
                <h2 id="price-watch-title">{priceWatch.model}</h2>
              </div>
              <button onClick={() => setPriceWatch(null)} aria-label="Close price form">×</button>
            </div>
            <form key={`${priceWatch.id}-${priceWatch.updatedAt}`} ref={priceFormRef} onSubmit={updatePrice}>
              <div className="field-row">
                <label><span>Brand *</span><input name="brand" required defaultValue={priceWatch.brand} /></label>
                <label><span>Model *</span><input name="model" required defaultValue={priceWatch.model} /></label>
              </div>
              <label><span>Reference</span><input name="reference" defaultValue={priceWatch.reference} /></label>
              <label><span>Notes</span><textarea name="notes" rows={3} defaultValue={priceWatch.notes} placeholder="Why this watch belongs in the collection…" /></label>
              {priceWatch.status === "wishlist" && (
                <label className="favorite-field">
                  <input type="checkbox" name="isFavorite" defaultChecked={priceWatch.isFavorite} />
                  <span className="favorite-field-heart" aria-hidden="true">♥</span>
                  <span className="favorite-field-copy"><strong>Favorite this watch</strong><small>Show it in the Favorites filter.</small></span>
                </label>
              )}
              <div className="detail-section-heading"><span>PRICE & LISTING</span></div>
              <div className="field-row">
                <label>
                  <span>Latest price</span>
                  <div className="currency-input"><span>{currencyMark(priceCurrency)}</span><input name="currentPrice" inputMode="decimal" defaultValue={priceWatch.currentPriceCents === null ? "" : priceWatch.currentPriceCents / 100} placeholder="6,500" /></div>
                </label>
                <label>
                  <span>Alert me at</span>
                  <div className="currency-input"><span>{currencyMark(priceCurrency)}</span><input name="targetPrice" inputMode="decimal" defaultValue={priceWatch.targetPriceCents === null ? "" : priceWatch.targetPriceCents / 100} placeholder="5,900" /></div>
                </label>
              </div>
              <label>
                <span>Price currency</span>
                <select name="currency" value={priceCurrency} onChange={(event) => setPriceCurrency(event.target.value)}>
                  {['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              <label>
                <span>Retailer or listing link</span>
                <input name="listingUrl" type="url" defaultValue={priceWatch.listingUrl} placeholder="https://…" autoComplete="url" />
              </label>
              <label>
                <span>Watch image</span>
                <input name="imageUrl" type="url" defaultValue={priceWatch.imageUrl} placeholder="https://…/watch.jpg" autoComplete="url" />
              </label>
              {priceWatch.listingUrl && (
                <a className="listing-link" href={priceWatch.listingUrl} target="_blank" rel="noreferrer">Open current listing ↗</a>
              )}
              {(priceCheckMessage || priceWatch.lastPriceCheckAt) && (
                <div className={`price-check-status ${priceCheckMessage && !priceCheckMessage.startsWith("New price") && !priceCheckMessage.startsWith("Still") ? "is-error" : ""}`} role="status">
                  <strong>{priceCheckMessage || priceWatch.lastPriceCheckStatus}</strong>
                  {priceWatch.lastPriceCheckAt && <small>Last checked {new Date(priceWatch.lastPriceCheckAt).toLocaleString()}</small>}
                </div>
              )}
              {priceWatch.priceHistory.length > 0 && (
                <div className="history-panel">
                  <div className="history-heading">
                    <span>Price history</span>
                    <small>{priceWatch.priceHistory.length} {priceWatch.priceHistory.length === 1 ? "record" : "records"}</small>
                  </div>
                  <div className="history-chart" aria-label="Recorded price history">
                    {sparkHeights(priceWatch.priceHistory).map((point) => (
                      <div key={point.id} title={`${formatPrice(point.priceCents, priceWatch.currency)} — ${new Date(point.recordedAt).toLocaleDateString()}`}>
                        <i style={{ height: `${point.height}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="history-range">
                    <span>{new Date(priceWatch.priceHistory[0].recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    <strong>{formatPrice(priceWatch.priceHistory.at(-1)?.priceCents ?? null, priceWatch.currency)}</strong>
                    <span>{new Date(priceWatch.priceHistory.at(-1)?.recordedAt || "").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </div>
                </div>
              )}
              <div className="detail-section-heading"><span>MARKET ESTIMATE</span></div>
              {priceWatch.marketPriceCents !== null && (
                <div className="market-estimate-panel">
                  <div>
                    <span>{priceWatch.marketProvider === "manual" ? "Manual estimate" : priceWatch.marketModelName}</span>
                    <strong>{formatPrice(priceWatch.marketPriceCents, priceWatch.marketCurrency)}</strong>
                    {priceWatch.marketLowCents !== null && priceWatch.marketHighCents !== null && <small>Typical range {formatPrice(priceWatch.marketLowCents, priceWatch.marketCurrency)}–{formatPrice(priceWatch.marketHighCents, priceWatch.marketCurrency)}</small>}
                  </div>
                  <div className="market-estimate-meta">
                    <span className={`confidence-badge is-${priceWatch.marketConfidence || "low"}`}>{priceWatch.marketConfidence === "manual" ? "Manual" : `${priceWatch.marketConfidence || "Low"} confidence`}</span>
                    {priceWatch.marketSampleSize > 0 && <small>{priceWatch.marketSampleSize} market {priceWatch.marketSampleSize === 1 ? "sample" : "samples"}</small>}
                    {priceWatch.marketCheckedAt && <small>Updated {new Date(priceWatch.marketCheckedAt).toLocaleDateString()}</small>}
                    {priceWatch.marketProvider === "the-watch-info" && <a href="https://thewatchinfo.com" target="_blank" rel="noreferrer">Market data from The Watch Info ↗</a>}
                  </div>
                </div>
              )}
              <div className="market-actions">
                <button type="button" className="outline-button" disabled={checkingMarket} onClick={() => void findMarketMatches()}>{checkingMarket ? "Working…" : priceWatch.marketProvider === "the-watch-info" ? "Change market match" : "Find market estimate"}</button>
                {priceWatch.marketProvider === "the-watch-info" && <button type="button" className="text-button" disabled={checkingMarket} onClick={() => void refreshMarketEstimate(true)}>Refresh estimate</button>}
                {priceWatch.marketProvider && <button type="button" className="text-button is-danger" disabled={checkingMarket} onClick={() => void clearMarketMatch()}>Clear estimate</button>}
              </div>
              {marketMessage && <div className="market-message" role="status">{marketMessage}</div>}
              {marketMatches.length > 0 && (
                <div className="market-match-list" aria-label="Possible market matches">
                  {marketMatches.map((match) => (
                    <button type="button" key={match.id} disabled={checkingMarket} onClick={() => void confirmMarketMatch(match)}>
                      <span><strong>{match.name}</strong><small>{match.brand}{match.reference ? ` · Ref. ${match.reference}` : ""}</small></span>
                      <span><strong>{formatPrice(match.averagePriceCents, "USD")}</strong><small>{match.sampleSize} {match.sampleSize === 1 ? "listing" : "listings"}</small></span>
                    </button>
                  ))}
                </div>
              )}
              <label className="manual-market-field">
                <span>Manual market estimate</span>
                <div className="currency-input"><span>{currencyMark(priceCurrency)}</span><input name="manualMarketPrice" inputMode="decimal" defaultValue={priceWatch.marketProvider === "manual" && priceWatch.marketPriceCents !== null ? priceWatch.marketPriceCents / 100 : ""} placeholder="Use when no provider match exists" /></div>
                <small>Saving a number here replaces an automatic estimate. Clear it and save to remove a manual estimate.</small>
              </label>
              <div className="detail-section-heading"><span>SPECIFICATIONS</span></div>
              <div className="field-row">
                <label><span>Movement</span><input name="movement" defaultValue={priceWatch.movement} placeholder="e.g. Sellita SW200-1" /></label>
                <label><span>Case size</span><input name="caseSize" defaultValue={priceWatch.caseSize} placeholder="e.g. 39 mm" /></label>
              </div>
              <div className="field-row">
                <label><span>Case material</span><input name="caseMaterial" defaultValue={priceWatch.caseMaterial} placeholder="e.g. Titanium" /></label>
                <label><span>Dial color</span><input name="dialColor" defaultValue={priceWatch.dialColor} placeholder="e.g. Aventurine" /></label>
              </div>
              <div className="field-row">
                <label><span>Water resistance</span><input name="waterResistance" defaultValue={priceWatch.waterResistance} placeholder="e.g. 200 m" /></label>
                <label><span>Tags</span><input name="tags" defaultValue={priceWatch.tags} placeholder="diver, blue, microbrand" /><small>Separate tags with commas.</small></label>
              </div>
              <div className="detail-section-heading"><span>OWNERSHIP & SERVICE</span></div>
              <div className="field-row">
                <label><span>Purchase price</span><div className="currency-input"><span>{currencyMark(priceCurrency)}</span><input name="purchasePrice" inputMode="decimal" defaultValue={priceWatch.purchasePriceCents === null ? "" : priceWatch.purchasePriceCents / 100} placeholder="Optional" /></div></label>
                <label><span>Purchase date</span><input name="purchaseDate" type="date" defaultValue={priceWatch.purchaseDate} /></label>
              </div>
              <div className="field-row">
                <label><span>Last serviced</span><input name="lastServiceDate" type="date" defaultValue={priceWatch.lastServiceDate} /></label>
                <label><span>Next service due</span><input name="nextServiceDate" type="date" defaultValue={priceWatch.nextServiceDate} /></label>
              </div>
              {priceWatch.status === "owned" && (
                <div className="wear-panel">
                  <div><strong>{priceWatch.wearCount} {priceWatch.wearCount === 1 ? "wear" : "wears"}</strong><span>{priceWatch.lastWornAt ? `Last worn ${new Date(priceWatch.lastWornAt).toLocaleDateString()}` : "No wrist time logged yet"}</span></div>
                  <button type="button" className="outline-button" onClick={() => void recordWear(priceWatch)}>+ Wore today</button>
                </div>
              )}
              <div className="price-note">
                <span aria-hidden="true">!</span>
                Crownlog reads structured pricing from the product page when you check it. Changed prices are saved to history; stores that block checks can still be updated manually.
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-button" onClick={() => setPriceWatch(null)}>Cancel</button>
                <button type="button" className="outline-button check-price-button" disabled={checkingPrice} onClick={() => void checkListingPrice()}>{checkingPrice ? "Checking…" : "Check listing now"}</button>
                <button type="submit" className="add-button">Save details</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {previewImage && (
        <div className="modal-backdrop image-lightbox-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreviewImage(null);
        }}>
          <section className="image-lightbox" role="dialog" aria-modal="true" aria-label={`Large image of ${previewImage.alt}`}>
            <button className="image-lightbox-close" onClick={() => setPreviewImage(null)} aria-label="Close large image">×</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImage.url} alt={previewImage.alt} referrerPolicy="no-referrer" />
            <div><strong>{previewImage.alt}</strong><a href={previewImage.url} target="_blank" rel="noreferrer">Open original image ↗</a></div>
          </section>
        </div>
      )}

      {rouletteWatch && (
        <div className="modal-backdrop roulette-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRouletteWatch(null);
        }}>
          <section className="roulette-modal" role="dialog" aria-modal="true" aria-labelledby="roulette-title">
            <button className="roulette-close" onClick={() => setRouletteWatch(null)} aria-label="Close watch roulette">×</button>
            <span className="eyebrow"><span /> THE WATCH ROULETTE</span>
            {rouletteWatch.imageUrl ? (
              <div className="roulette-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={rouletteWatch.imageUrl} alt={`${rouletteWatch.brand} ${rouletteWatch.model}`} referrerPolicy="no-referrer" />
              </div>
            ) : (
              <div className="roulette-dial" aria-hidden="true"><span>{rouletteWatch.brand.charAt(0)}</span></div>
            )}
            <p>Today’s object of obsession</p>
            <h2 id="roulette-title">{rouletteWatch.model}</h2>
            <h3>{rouletteWatch.brand}</h3>
            <div className="roulette-facts">
              <span>Grail {rouletteWatch.grailScore}/5</span>
              <span>{rouletteWatch.currentPriceCents === null ? "Price not tracked" : formatPrice(rouletteWatch.currentPriceCents, rouletteWatch.currency)}</span>
              <span>{rouletteWatch.status === "owned" ? "In your collection" : "On your wishlist"}</span>
            </div>
            <div className="roulette-actions">
              <button className="outline-button" onClick={spinRoulette}><span aria-hidden="true">↻</span> Spin again</button>
              <button className="add-button" onClick={() => { setRouletteWatch(null); openPriceWatch(rouletteWatch); }}>View price</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
