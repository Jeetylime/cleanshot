import { createCanvas, ctx2d } from './images';
import { FONT_FAMILY } from './text';

/**
 * Procedurally draws a realistic-looking app screenshot (at 2x) so people
 * can try the editor without having an image at hand. It deliberately
 * contains "sensitive" details (email, API key, card) to redact.
 */
export function createSampleScreenshot(): HTMLCanvasElement {
  const S = 2;
  const W = 1180;
  const H = 740;
  const c = createCanvas(W * S, H * S);
  const ctx = ctx2d(c);
  ctx.scale(S, S);
  const font = (w: number, s: number) => `${w} ${s}px ${FONT_FAMILY}`;
  const text = (t: string, x: number, y: number, size = 13, weight = 400, color = '#1d1d1f', align: CanvasTextAlign = 'left') => {
    ctx.font = font(weight, size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  };
  const rr = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  // Window
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Title bar
  ctx.fillStyle = '#f6f6f7';
  ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = '#e4e4e7';
  ctx.fillRect(0, 44, W, 1);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(22 + i * 20, 22, 6, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });
  text('Northwind — Billing', W / 2, 22, 13, 600, '#3a3a3c', 'center');

  // Sidebar
  ctx.fillStyle = '#f9f9fa';
  ctx.fillRect(0, 45, 220, H - 45);
  ctx.fillStyle = '#ececee';
  ctx.fillRect(220, 45, 1, H - 45);
  rr(16, 64, 30, 30, 8, '#4f46e5');
  text('N', 31, 79, 15, 700, '#fff', 'center');
  text('Northwind', 56, 74, 14, 700);
  text('Pro workspace', 56, 90, 11, 400, '#86868b');
  const nav = ['Overview', 'Projects', 'Team', 'Billing', 'Integrations', 'API Keys', 'Settings'];
  nav.forEach((n, i) => {
    const y = 128 + i * 34;
    if (n === 'Billing') rr(12, y - 14, 196, 28, 7, '#e8e7fd');
    ctx.beginPath();
    ctx.roundRect(26, y - 6, 12, 12, 3);
    ctx.fillStyle = n === 'Billing' ? '#4f46e5' : '#c7c7cc';
    ctx.fill();
    text(n, 48, y, 13, n === 'Billing' ? 600 : 500, n === 'Billing' ? '#3730a3' : '#3a3a3c');
  });
  rr(12, H - 72, 196, 52, 10, '#ffffff', '#e5e5ea');
  ctx.beginPath();
  ctx.arc(38, H - 46, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  text('AM', 38, H - 46, 11, 700, '#fff', 'center');
  text('Alex Morgan', 60, H - 54, 12, 600);
  text('alex.morgan@northwind.io', 60, H - 38, 10.5, 400, '#86868b');

  // Main header
  const X = 252;
  text('Billing', X, 82, 24, 700);
  text('Manage your plan, payment details and invoices.', X, 108, 13, 400, '#6e6e73');
  rr(W - 166, 66, 136, 34, 8, '#4f46e5');
  text('Upgrade plan', W - 98, 83, 13, 600, '#fff', 'center');

  // Plan card
  rr(X, 136, 430, 176, 12, '#ffffff', '#e5e5ea');
  text('CURRENT PLAN', X + 20, 162, 11, 600, '#86868b');
  text('Pro', X + 20, 194, 26, 700);
  rr(X + 76, 182, 58, 22, 11, '#dcfce7');
  text('Active', X + 105, 193, 11, 600, '#15803d', 'center');
  text('$49', X + 410, 192, 26, 700, '#1d1d1f', 'right');
  text('per month, billed monthly', X + 410, 216, 11.5, 400, '#86868b', 'right');
  ctx.fillStyle = '#f0f0f2';
  ctx.fillRect(X + 20, 236, 390, 1);
  text('Seats', X + 20, 258, 12.5, 500, '#6e6e73');
  text('14 of 20 used', X + 410, 258, 12.5, 600, '#1d1d1f', 'right');
  rr(X + 20, 276, 390, 8, 4, '#eef0f4');
  rr(X + 20, 276, 390 * 0.7, 8, 4, '#4f46e5');

  // Payment card
  const PX = X + 450;
  rr(PX, 136, W - PX - 30, 176, 12, '#ffffff', '#e5e5ea');
  text('PAYMENT METHOD', PX + 20, 162, 11, 600, '#86868b');
  rr(PX + 20, 182, 52, 34, 6, '#1a1f71');
  text('VISA', PX + 46, 199, 12, 800, '#fff', 'center');
  text('Visa ending in 4242', PX + 86, 192, 13.5, 600);
  text('Expires 08 / 2028', PX + 86, 210, 12, 400, '#86868b');
  text('Billing email', PX + 20, 248, 12.5, 500, '#6e6e73');
  text('finance@northwind.io', PX + 20, 268, 13.5, 600);
  text('Edit', W - 50, 248, 12.5, 600, '#4f46e5', 'right');

  // Usage chart
  rr(X, 330, 430, 220, 12, '#ffffff', '#e5e5ea');
  text('API usage', X + 20, 356, 13.5, 600);
  text('Last 12 weeks', X + 410, 356, 11.5, 400, '#86868b', 'right');
  const vals = [32, 41, 38, 52, 47, 61, 58, 72, 69, 84, 79, 93];
  vals.forEach((v, i) => {
    const bh = v * 1.45;
    const bx = X + 26 + i * 33;
    const by = 528 - bh;
    rr(bx, by, 20, bh, 4, i === vals.length - 1 ? '#4f46e5' : '#c7d2fe');
  });
  ctx.fillStyle = '#f0f0f2';
  ctx.fillRect(X + 20, 529, 390, 1);

  // API key card
  rr(PX, 330, W - PX - 30, 220, 12, '#ffffff', '#e5e5ea');
  text('Secret API key', PX + 20, 356, 13.5, 600);
  text('Use this key to authenticate server-side requests.', PX + 20, 378, 11.5, 400, '#86868b');
  rr(PX + 20, 398, W - PX - 70, 40, 8, '#f5f5f7', '#e5e5ea');
  ctx.font = `500 12.5px "SF Mono", ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace`;
  ctx.fillStyle = '#1d1d1f';
  ctx.textAlign = 'left';
  ctx.fillText('nw_live_8Hc2Qx7eZvKYmo4C9f3Tq8PxWnR7', PX + 34, 418);
  text('Created Oct 14, 2026 · Last used 2 hours ago', PX + 20, 462, 11.5, 400, '#86868b');
  rr(PX + 20, 490, 96, 32, 8, '#ffffff', '#d2d2d7');
  text('Copy key', PX + 68, 506, 12.5, 600, '#1d1d1f', 'center');
  rr(PX + 126, 490, 96, 32, 8, '#fff1f0', '#ffd4d0');
  text('Revoke', PX + 174, 506, 12.5, 600, '#d70015', 'center');

  // Invoices
  rr(X, 568, W - X - 30, 150, 12, '#ffffff', '#e5e5ea');
  text('Invoices', X + 20, 592, 13.5, 600);
  const rows = [
    ['INV-2026-011', 'Nov 1, 2026', '$49.00', 'Paid'],
    ['INV-2026-010', 'Oct 1, 2026', '$49.00', 'Paid'],
    ['INV-2026-009', 'Sep 1, 2026', '$39.00', 'Paid'],
  ];
  rows.forEach((r, i) => {
    const y = 626 + i * 30;
    ctx.fillStyle = '#f0f0f2';
    ctx.fillRect(X + 20, y - 15, W - X - 70, 1);
    text(r[0], X + 20, y, 12.5, 500);
    text(r[1], X + 230, y, 12.5, 400, '#6e6e73');
    text(r[2], X + 430, y, 12.5, 600);
    rr(X + 560, y - 10, 46, 20, 10, '#dcfce7');
    text(r[3], X + 583, y, 11, 600, '#15803d', 'center');
    text('Download', W - 50, y, 12.5, 600, '#4f46e5', 'right');
  });

  return c;
}
