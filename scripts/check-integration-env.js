/**
 * Fail before Jest if integration credentials are missing.
 * Used by `npm run test:integration` so a missing .env.test.local is red, not skip-green.
 */
const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(fileName) {
  const full = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(full)) {
    return;
  }
  const text = fs.readFileSync(full, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
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
}

loadEnvFile('.env.test.local');
loadEnvFile('.env.test');

const url = process.env.SUPABASE_URL?.trim();
const anon = process.env.SUPABASE_ANON_KEY?.trim();
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !anon || !service) {
  console.error(
    [
      'Integration harness requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.',
      'Copy .env.test.example → .env.test.local and fill keys from a dedicated hosted test project (Project Settings → API).',
      'See __tests__/support/README.md.',
    ].join('\n')
  );
  process.exit(1);
}
