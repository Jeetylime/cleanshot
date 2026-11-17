/**
 * Remembers the most recently opened Image Tool and PDF Tool (in this browser
 * only), so the home page can offer to pick up where you left off.
 */
import type { PdfToolKey, Route, ToolKey } from './route';

const KEY = 'studiolo:recentTools';

export interface RecentTools {
  tools?: { key: ToolKey; at: number };
  pdf?: { key: PdfToolKey; at: number };
}

export function getRecentTools(): RecentTools {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Record the tool a route opens, if any. */
export function noteRoute(r: Route) {
  if ((r.section !== 'tools' && r.section !== 'pdf') || !r.tool) return;
  try {
    const next = { ...getRecentTools(), [r.section]: { key: r.tool, at: Date.now() } };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode): nothing to remember.
  }
}
