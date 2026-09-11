/**
 * Default OpenRouter chat model when callers omit `model`.
 * Chosen from the live OpenRouter catalog at implement time (coding-friendly, widely available).
 * Override via `createCodeReviewer({ model })` or CLI `OPENROUTER_MODEL`.
 */
export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash';
