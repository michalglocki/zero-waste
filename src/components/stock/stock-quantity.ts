/** Parse add-delta: integer ≥ 0; non-numeric / negative → 0. */
export function parseAddDelta(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return 0;
  }
  if (!/^\d+$/.test(trimmed)) {
    return 0;
  }
  return Number.parseInt(trimmed, 10);
}
