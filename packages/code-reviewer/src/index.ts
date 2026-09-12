import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { config as loadEnv } from 'dotenv';

import {
  buildReviewPrompt,
  createCodeReviewer,
  type ReviewOutput,
} from './lib.js';

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function loadCliEnv(): void {
  loadEnv({ path: join(packageRoot, '.env') });
  loadEnv({ path: join(packageRoot, '.env.local'), override: true });
}

/** Prefer `--base <ref>` / `--base=<ref>`; fall back to `REVIEW_BASE`. */
export function resolveReviewBase(argv = process.argv.slice(2)): string | undefined {
  const eq = argv.find((arg) => arg.startsWith('--base='));
  if (eq) {
    const value = eq.slice('--base='.length).trim();
    return value || undefined;
  }

  const flagIndex = argv.indexOf('--base');
  if (flagIndex >= 0) {
    const value = argv[flagIndex + 1]?.trim();
    if (!value || value.startsWith('-')) {
      fail('Missing value for --base (expected a git ref, e.g. origin/main).');
    }
    return value;
  }

  return process.env.REVIEW_BASE?.trim() || undefined;
}

async function getDiff(base: string | undefined): Promise<string> {
  const args = base ? ['diff', `${base}...HEAD`] : ['diff', 'HEAD'];
  try {
    const { stdout } = await execFileAsync('git', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      cwd: process.cwd(),
    });
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const label = base ? `git diff ${base}...HEAD` : 'git diff HEAD';
    throw new Error(`Failed to run ${label}: ${detail}`);
  }
}

function shouldFailOnVerdict(verdict: ReviewOutput['verdict']): boolean {
  const raw = process.env.REVIEW_FAIL_ON?.trim().toLowerCase();
  if (!raw) return false;
  const targets = raw.split(',').map((part) => part.trim()).filter(Boolean);
  return targets.includes(verdict);
}

export async function main(): Promise<void> {
  loadCliEnv();

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    fail(
      'Missing CURSOR_API_KEY. Set it in the environment, GitHub Actions secrets, or packages/code-reviewer/.env (see .env.example).',
    );
  }

  const base = resolveReviewBase();

  let diff: string;
  try {
    diff = await getDiff(base);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (!diff.trim()) {
    fail(
      base
        ? `No changes to review (git diff ${base}...HEAD is empty).`
        : 'No uncommitted changes to review (git diff HEAD is empty).',
    );
  }

  const model = process.env.CURSOR_MODEL?.trim() || undefined;
  const runtime =
    process.env.CURSOR_RUNTIME?.trim().toLowerCase() === 'cloud'
      ? 'cloud'
      : 'local';
  const cloudRepoUrl = process.env.CURSOR_CLOUD_REPO_URL?.trim() || undefined;
  const cloudStartingRef =
    process.env.CURSOR_CLOUD_STARTING_REF?.trim() || undefined;
  const cloudPrUrl = process.env.CURSOR_CLOUD_PR_URL?.trim() || undefined;

  try {
    const agent = createCodeReviewer({
      apiKey,
      model,
      runtime,
      cloud: cloudRepoUrl
        ? {
            repoUrl: cloudRepoUrl,
            startingRef: cloudStartingRef,
            prUrl: cloudPrUrl,
          }
        : undefined,
    });
    const result = await agent.generate({
      prompt: buildReviewPrompt(diff, base ? { base } : undefined),
    });
    console.log(JSON.stringify(result.output, null, 2));

    if (shouldFailOnVerdict(result.output.verdict)) {
      fail(
        `Review verdict "${result.output.verdict}" matches REVIEW_FAIL_ON=${process.env.REVIEW_FAIL_ON}`,
        2,
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Code review failed: ${detail}`);
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
