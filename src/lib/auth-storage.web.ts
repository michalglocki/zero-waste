import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Browser localStorage for web. Avoid importing expo-sqlite on web — its WASM
 * worker breaks Expo Router static SSR bundling.
 */
export const authStorage: SupportedStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(key);
  },
};
