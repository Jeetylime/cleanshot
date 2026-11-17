/** True when every word of the query appears in the item's search text (case-insensitive; dashes count as spaces). */
export function matchesQuery(q: string, ...terms: string[]): boolean {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = terms.join(' ').toLowerCase().replace(/[-_]/g, ' ');
  return words.every((w) => hay.includes(w));
}
