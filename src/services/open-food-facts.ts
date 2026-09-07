import type { StockItemIdentityFields } from '@/types/stock';

const DEFAULT_OFF_BASE_URL = 'https://world.openfoodfacts.org';
const CACHE_TTL_MS = 30 * 60 * 1000;
const APP_NAME = 'ZeroWaste';
const APP_VERSION = '1.0.0';
const APP_CONTACT = 'contact@zero-waste.app';
/** OFF-required identification; browsers may override User-Agent on web. */
const OFF_USER_AGENT = `${APP_NAME}/${APP_VERSION} (${APP_CONTACT})`;

const PRODUCT_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'categories_tags',
  'categories_hierarchy',
  'quantity',
  'labels_tags',
] as const;

export type OffMappedIdentity = {
  name: string | null;
  main_category: string | null;
  /** Always null in S-02 — no audience mapping this slice. */
  auxiliary_category: null;
  pack_size: string | null;
};

export type OffLookupResult =
  | { outcome: 'found'; identity: OffMappedIdentity; fromCache: boolean }
  | { outcome: 'not_found'; fromCache: boolean }
  | { outcome: 'error'; error: Error; fromCache: false };

type OffProductPayload = {
  code?: string;
  product_name?: string | null;
  product_name_en?: string | null;
  categories_tags?: string[] | null;
  categories_hierarchy?: string[] | null;
  quantity?: string | null;
  labels_tags?: string[] | null;
  [key: string]: unknown;
};

type OffApiResponse = {
  status?: number;
  status_verbose?: string;
  product?: OffProductPayload;
};

type CacheEntry = {
  result: Extract<OffLookupResult, { outcome: 'found' | 'not_found' }>;
  storedAt: number;
};

const identityCache = new Map<string, CacheEntry>();

function offBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS_BASE_URL?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, '');
  }
  return DEFAULT_OFF_BASE_URL;
}

function nonempty(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Primary language subtag from runtime locale; falls back to `en`. */
export function getDeviceLanguageSubtag(): string {
  try {
    const locale =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().locale
        : undefined;
    const primary = locale?.split(/[-_]/)[0]?.toLowerCase();
    if (primary && /^[a-z]{2,3}$/.test(primary)) {
      return primary;
    }
  } catch {
    // Intl unavailable — fall through to en
  }
  return 'en';
}

/**
 * Prefer human English label from an OFF taxonomy tag (`en:sweet-spreads` →
 * `Sweet spreads`); otherwise return the raw tag.
 */
export function humanizeOffCategoryTag(tag: string): string {
  const trimmed = tag.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const colon = trimmed.indexOf(':');
  const body = colon >= 0 ? trimmed.slice(colon + 1) : trimmed;
  const spaced = body.replace(/-/g, ' ').trim();
  if (spaced.length === 0) {
    return trimmed;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function mapOffProductName(
  product: OffProductPayload,
  languageSubtag: string = getDeviceLanguageSubtag()
): string | null {
  const lang = languageSubtag.toLowerCase();
  const localized = nonempty(product[`product_name_${lang}`]);
  if (localized) {
    return localized;
  }
  const en = nonempty(product.product_name_en);
  if (en) {
    return en;
  }
  return nonempty(product.product_name);
}

/**
 * Free-text main category: prefer leaf English taxonomy slug label; else last raw tag.
 * OFF sometimes prefixes localized labels with `en:`; those are skipped when a
 * real `en:ascii-slug` tag exists.
 */
export function mapOffMainCategory(product: OffProductPayload): string | null {
  const tags =
    (Array.isArray(product.categories_tags) && product.categories_tags.length > 0
      ? product.categories_tags
      : null) ??
    (Array.isArray(product.categories_hierarchy)
      ? product.categories_hierarchy
      : null) ??
    [];

  if (tags.length === 0) {
    return null;
  }

  const englishSlugs = tags.filter((tag) => /^en:[a-z0-9-]+$/i.test(tag));
  const chosen =
    englishSlugs.length > 0
      ? englishSlugs[englishSlugs.length - 1]!
      : tags[tags.length - 1]!;
  return humanizeOffCategoryTag(chosen);
}

export function mapOffPackSize(product: OffProductPayload): string | null {
  return nonempty(product.quantity);
}

/** Pure mapper shared by preview + persist paths. */
export function mapOffProductToIdentity(
  product: OffProductPayload,
  languageSubtag: string = getDeviceLanguageSubtag()
): OffMappedIdentity {
  return {
    name: mapOffProductName(product, languageSubtag),
    main_category: mapOffMainCategory(product),
    auxiliary_category: null,
    pack_size: mapOffPackSize(product),
  };
}

export function toStockIdentityFields(
  identity: OffMappedIdentity
): StockItemIdentityFields {
  return {
    name: identity.name,
    main_category: identity.main_category,
    auxiliary_category: identity.auxiliary_category,
    pack_size: identity.pack_size,
  };
}

function isFresh(entry: CacheEntry, now: number = Date.now()): boolean {
  return now - entry.storedAt < CACHE_TTL_MS;
}

/** Returns mapped identity/miss when a non-expired cache entry exists. */
export function getCachedOffLookup(
  barcode: string
): Extract<OffLookupResult, { outcome: 'found' | 'not_found' }> | null {
  const trimmed = barcode.trim();
  if (trimmed === '') {
    return null;
  }
  const entry = identityCache.get(trimmed);
  if (!entry || !isFresh(entry)) {
    if (entry) {
      identityCache.delete(trimmed);
    }
    return null;
  }
  return { ...entry.result, fromCache: true };
}

export function setCachedOffLookup(
  barcode: string,
  result: Extract<OffLookupResult, { outcome: 'found' | 'not_found' }>
): void {
  const trimmed = barcode.trim();
  if (trimmed === '') {
    return;
  }
  identityCache.set(trimmed, {
    result: { ...result, fromCache: false },
    storedAt: Date.now(),
  });
}

/** Clear one barcode, or the entire OFF identity cache when omitted. */
export function invalidateOffIdentityCache(barcode?: string): void {
  if (barcode === undefined) {
    identityCache.clear();
    return;
  }
  const trimmed = barcode.trim();
  if (trimmed !== '') {
    identityCache.delete(trimmed);
  }
}

function buildProductUrl(barcode: string, languageSubtag: string): string {
  const fields: string[] = [...PRODUCT_FIELDS];
  const localized = `product_name_${languageSubtag}`;
  if (!fields.includes(localized)) {
    fields.push(localized);
  }

  const params = new URLSearchParams({
    fields: fields.join(','),
    // Identify the app when browsers strip custom User-Agent (web).
    app_name: APP_NAME,
    app_version: APP_VERSION,
  });

  return `${offBaseUrl()}/api/v2/product/${encodeURIComponent(barcode)}?${params.toString()}`;
}

/**
 * Looks up a barcode in Open Food Facts (cache-first unless bypassed).
 * Distinguishes found / not_found / network-or-HTTP error for soft UI status.
 */
export async function lookupOpenFoodFactsProduct(
  barcode: string,
  options?: { bypassCache?: boolean; languageSubtag?: string }
): Promise<OffLookupResult> {
  const trimmed = barcode.trim();
  if (trimmed === '') {
    return {
      outcome: 'error',
      error: new Error('barcode required'),
      fromCache: false,
    };
  }

  if (!options?.bypassCache) {
    const cached = getCachedOffLookup(trimmed);
    if (cached) {
      return cached;
    }
  }

  const languageSubtag = options?.languageSubtag ?? getDeviceLanguageSubtag();
  const url = buildProductUrl(trimmed, languageSubtag);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': OFF_USER_AGENT,
      },
    });
  } catch (cause) {
    const error =
      cause instanceof Error ? cause : new Error('Open Food Facts network error');
    return { outcome: 'error', error, fromCache: false };
  }

  if (!response.ok) {
    return {
      outcome: 'error',
      error: new Error(
        `Open Food Facts HTTP ${response.status}: ${response.statusText || 'request failed'}`
      ),
      fromCache: false,
    };
  }

  let body: OffApiResponse;
  try {
    body = (await response.json()) as OffApiResponse;
  } catch (cause) {
    const error =
      cause instanceof Error
        ? cause
        : new Error('Open Food Facts response was not JSON');
    return { outcome: 'error', error, fromCache: false };
  }

  if (body.status !== 1 || body.product == null) {
    const miss: OffLookupResult = { outcome: 'not_found', fromCache: false };
    setCachedOffLookup(trimmed, miss);
    return miss;
  }

  const identity = mapOffProductToIdentity(body.product, languageSubtag);
  const found: OffLookupResult = {
    outcome: 'found',
    identity,
    fromCache: false,
  };
  setCachedOffLookup(trimmed, found);
  return found;
}
