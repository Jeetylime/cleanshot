import { useSyncExternalStore } from 'react';

/**
 * Brand kit: colors, fonts and logos reused across designs. Stored in this
 * browser (local storage for settings, IndexedDB for logo images).
 */

export interface BrandLogo {
  id: string;
  width: number;
  height: number;
  name: string;
}

export interface Brand {
  colors: string[];
  headingFont: string | null;
  bodyFont: string | null;
  logos: BrandLogo[];
}

const KEY = 'cleanshot:brand';
const EMPTY: Brand = { colors: [], headingFont: null, bodyFont: null, logos: [] };

function load(): Brand {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return EMPTY;
  }
}

let brand: Brand = typeof window === 'undefined' ? EMPTY : load();
const listeners = new Set<() => void>();

export function getBrand(): Brand {
  return brand;
}

export function setBrand(patch: Partial<Brand>) {
  brand = { ...brand, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(brand));
  } catch {
    /* storage unavailable: kit lasts for this session */
  }
  listeners.forEach((l) => l());
}

export function useBrand(): Brand {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => brand,
  );
}

/** Asset ids the brand kit needs kept in storage. */
export function brandAssetIds(): string[] {
  return load().logos.map((l) => l.id);
}
