import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { config as loadEnv } from 'dotenv';

import { buildReviewPrompt, createCodeReviewer } from './lib.js';

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function loadCliEnv(): void {
  loadEnv({ path: join(packageRoot, '.env') });
  loadEnv({ path: join(packageRoot, '.env.local'), override: true });
}

async function getUncommittedDiff(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      cwd: process.cwd(),
    });
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to run git diff HEAD: ${detail}`);
  }
}

export async function main(): Promise<void> {
  loadCliEnv();

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    fail(
      'Missing CURSOR_API_KEY. Set it in the environment, GitHub Actions secrets, or packages/code-reviewer/.env (see .env.example).',
    );
  }

  let diff: string;
  try {
    diff = await getUncommittedDiff();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (!diff.trim()) {
    fail('No uncommitted changes to review (git diff HEAD is empty).');
  }

  const model = process.env.CURSOR_MODEL?.trim() || undefined;

  try {
    const agent = createCodeReviewer({ apiKey, model });
    const result = await agent.generate({
      prompt: buildReviewPrompt(diff),
    });
    console.log(JSON.stringify(result.output, null, 2));
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
