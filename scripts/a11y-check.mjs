/* global window, document */ // used inside page.evaluate, which runs in the browser
// WCAG 2.2 AA automated check (axe-core) over every section and tool, in both themes.
// Start the dev server first (npm run dev), then: node scripts/a11y-check.mjs [baseUrl]
// Exits non-zero if any violation is found. Automated checks cover only part of WCAG;
// keyboard, reflow and screen-reader checks are still manual (see #accessibility).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axeSrc = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');

const { TOOL_KEYS, PDF_TOOL_KEYS, LEGAL_DOCS } = await import('../src/app/route.ts').catch(() => ({}));
const routes = ['home', 'palette', 'settings-menu', 'editor', 'editor-doc', 'editor-settings', 'canvas-templates', 'canvas-editor', 'canvas-draw', 'canvas-templates-panel', 'canvas-selected', 'canvas', 'tools', 'pdf', 'storage', 'about', ...(LEGAL_DOCS ?? []), ...(TOOL_KEYS ?? []), ...(PDF_TOOL_KEYS ?? [])];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
let failures = 0;
for (const theme of ['dark', 'light']) {
  await page.goto(base + '#home');
  await page.evaluate((t) => localStorage.setItem('cleanshot:prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('cleanshot:prefs') || '{}'), theme: t })), theme);
  for (const r of routes) {
    if (r === 'editor-doc' || r === 'editor-settings') {
      await page.goto(base + '#editor');
      await page.reload();
      await page.getByRole('button', { name: /Try a sample/ }).click();
      if (r === 'editor-settings') await page.getByRole('button', { name: 'Settings' }).click();
    } else if (r === 'canvas-templates') {
      // Canvas start page, Templates tab with a search.
      await page.goto(base + '#canvas');
      await page.reload();
      await page.waitForTimeout(800);
      await page.getByRole('radio', { name: /Templates/ }).click();
      await page.getByLabel('Search templates').fill('post');
    } else if (r === 'canvas-selected') {
      // A text element selected: floating toolbar, Style tab with Effects open.
      await page.goto(base + '#canvas');
      await page.reload();
      await page.waitForTimeout(800);
      if (await page.locator('[data-testid=preset-square]').count()) await page.locator('[data-testid=preset-square]').click();
      await page.waitForTimeout(800);
      await page.locator('[data-testid=rail-text]').click();
      await page.locator('aside button').filter({ hasText: /heading/i }).first().click();
      await page.waitForTimeout(400);
      const fx = page.getByRole('button', { name: /^Effects/ });
      if ((await fx.getAttribute('aria-expanded')) === 'false') await fx.click();
    } else if (r === 'canvas-editor' || r === 'canvas-draw' || r === 'canvas-templates-panel') {
      // A design open in the Canvas editor (with the Elements search or Draw panel showing).
      await page.goto(base + '#canvas');
      await page.reload();
      await page.waitForTimeout(800);
      if (await page.locator('[data-testid=preset-square]').count()) await page.locator('[data-testid=preset-square]').click();
      await page.waitForTimeout(800);
      await page.locator(`[data-testid=rail-${r === 'canvas-draw' ? 'draw' : r === 'canvas-templates-panel' ? 'templates' : 'elements'}]`).click();
    } else if (r === 'palette') {
      await page.goto(base + '#home');
      await page.reload();
      await page.waitForTimeout(500);
      await page.keyboard.press('Control+k');
    } else if (r === 'settings-menu') {
      await page.goto(base + '#home');
      await page.reload();
      await page.getByRole('button', { name: 'Settings' }).click();
    } else {
      await page.goto(base + '#' + r);
      await page.reload();
    }
    await page.waitForTimeout(900);
    await page.addScriptTag({ content: axeSrc });
    const violations = await page.evaluate(async () =>
      (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => ({
        id: v.id,
        help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      })),
    );
    for (const v of violations) {
      failures++;
      console.log(`✗ ${theme} #${r}: ${v.id}: ${v.help}\n    ${v.nodes.join('\n    ')}`);
    }
  }
}
await browser.close();
console.log(failures ? `\n${failures} violation(s)` : `✓ No axe violations on ${routes.length} routes × 2 themes`);
process.exit(failures ? 1 : 0);
