import fs from 'node:fs';
import path from 'node:path';

/**
 * Load `.env.test.local` (preferred) or `.env.test` into `process.env`
 * without overwriting vars already set in the shell.
 * Does not touch Expo `EXPO_PUBLIC_*` app env files.
 */
export function loadTestEnv(): void {
  const candidates = ['.env.test.local', '.env.test'];

  for (const file of candidates) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) {
      continue;
    }

    const text = fs.readFileSync(full, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const eq = trimmed.indexOf('=');
      if (eq <= 0) {
        continue;
      }

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }

    return;
  }
}

loadTestEnv();
