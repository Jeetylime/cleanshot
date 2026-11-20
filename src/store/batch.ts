import type { EditorDoc } from '../types';
import { store } from './store';
import { showToast, commitTextEdit } from './actions';
import { decodeImage, constrainSource, registerImage, releaseImages, createCanvas, ctx2d, canvasToBlob } from '../engine/images';
import { computeLayout, renderDocument } from '../engine/render';
import { downloadBlob, exportDocument, EXTENSION, MIME } from '../engine/export';
import { readPngDpi } from '../lib/png';
import { clamp, uid, stripExtension } from '../lib/utils';
import { FONT_FAMILY } from '../engine/text';

/**
 * Edit extras that work on more than the open screenshot:
 * - Batch frame: apply the current background, padding, shadow and device
 *   frame to many images and download them as a ZIP.
 * - Before/after: compare another image ("before") with the current export
 *   ("after") side by side, stacked, or as an animated GIF.
 */

function unitFor(w: number, h: number, dpi: number | null): number {
  if (dpi && dpi >= 110) return clamp(Math.round((dpi / 72) * 4) / 4, 1, 4);
  if (dpi && dpi > 0) return 1;
  return clamp(Math.round((Math.max(w, h) / 1600) * 4) / 4, 1, 4);
}

export async function batchFrame(files: File[]) {
  const cur = store.get().doc;
  if (!cur || !files.length) return;
  commitTextEdit();
  const prefs = store.get().exportPrefs;
  const bg = { ...cur.background, enabled: true };
  const out: { name: string; blob: Blob }[] = [];
  const ids: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      store.set({ busy: `Framing ${i + 1} of ${files.length}…` });
      const f = files[i];
      try {
        const [src] = constrainSource(await decodeImage(f));
        const entry = registerImage(src, { blob: null });
        ids.push(entry.id);
        const unit = unitFor(entry.width, entry.height, await readPngDpi(f));
        const doc: EditorDoc = {
          id: uid('batch'),
          name: stripExtension(f.name) || `image-${i + 1}`,
          imageId: entry.id,
          originalImageId: entry.id,
          width: entry.width,
          height: entry.height,
          unit,
          originalUnit: unit,
          annotations: [],
          background: bg,
          createdAt: Date.now(),
        };
        const L = computeLayout(doc);
        const r = await exportDocument(doc, { format: prefs.format, quality: prefs.quality, width: L.outW * prefs.scale, height: L.outH * prefs.scale });
        out.push({ name: `${doc.name}.${EXTENSION[r.format]}`, blob: r.blob });
      } catch {
        showToast(`Skipped ${f.name}: it couldn’t be read.`, 'error');
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    if (!out.length) return;
    if (out.length === 1) {
      await downloadBlob(out[0].blob, out[0].name);
    } else {
      const { createZip } = await import('../tools/shared/zip');
      await downloadBlob(await createZip(out), 'framed-images.zip');
    }
    showToast(`Framed ${out.length} image${out.length === 1 ? '' : 's'}`, 'success');
  } finally {
    releaseImages(ids);
    store.set({ busy: null });
  }
}

export type CompareLayout = 'side' | 'stacked' | 'gif';

/** Render both images at the same scale with "Before" / "After" labels. */
export async function beforeAfter(beforeFile: File, layout: CompareLayout) {
  const doc = store.get().doc;
  if (!doc) return;
  commitTextEdit();
  store.set({ busy: 'Building comparison…' });
  try {
    const before = await decodeImage(beforeFile);
    const L = computeLayout(doc);
    const after = renderDocument(doc, { width: L.outW, height: L.outH, matte: '#ffffff' });
    // Fit both to the same height (side) or width (stacked/gif), capped for size.
    const maxSide = 2400;
    const u = Math.max(1, doc.unit);
    const label = Math.round(18 * u);
    const gap = Math.round(24 * u);
    let blob: Blob;
    if (layout === 'gif') {
      const W = Math.min(maxSide, Math.max(after.width, 1));
      const k = W / after.width;
      const H = Math.round(after.height * k);
      const frame = (img: CanvasImageSource, iw: number, ih: number, text: string) => {
        const c = createCanvas(W, H);
        const ctx = ctx2d(c, { willReadFrequently: true });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        const s = Math.min(W / iw, H / ih);
        ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
        badge(ctx, text, Math.round(label * k * 1.4) || 14, 12 * k * u, 12 * k * u);
        return ctx.getImageData(0, 0, W, H).data;
      };
      const { encodeGif } = await import('../lib/gif');
      blob = await encodeGif(
        [
          { data: frame(before, before.width, before.height, 'Before'), delay: 1200 },
          { data: frame(after, after.width, after.height, 'After'), delay: 1200 },
        ],
        { width: W, height: H },
      );
    } else {
      const side = layout === 'side';
      const target = side ? Math.max(after.height, 1) : Math.max(after.width, 1);
      const sb = target / (side ? before.height : before.width);
      const bw = Math.round(before.width * sb);
      const bh = Math.round(before.height * sb);
      const aw = after.width;
      const ah = after.height;
      const head = label * 2.2;
      let W = side ? bw + aw + gap * 3 : Math.max(bw, aw) + gap * 2;
      let H = side ? Math.max(bh, ah) + gap * 2 + head : bh + ah + gap * 3 + head * 2;
      const k = Math.min(1, maxSide / Math.max(W, H));
      W = Math.round(W * k);
      H = Math.round(H * k);
      const c = createCanvas(W, H);
      const ctx = ctx2d(c);
      ctx.scale(k, k);
      ctx.fillStyle = '#f2f2f5';
      ctx.fillRect(0, 0, W / k, H / k);
      ctx.fillStyle = '#1d1d1f';
      ctx.font = `600 ${label}px ${FONT_FAMILY}`;
      ctx.textBaseline = 'middle';
      if (side) {
        ctx.fillText('Before', gap, gap + head / 2);
        ctx.fillText('After', gap * 2 + bw, gap + head / 2);
        ctx.drawImage(before, gap, gap + head, bw, bh);
        ctx.drawImage(after, gap * 2 + bw, gap + head, aw, ah);
      } else {
        ctx.fillText('Before', gap, gap + head / 2);
        ctx.drawImage(before, gap, gap + head, bw, bh);
        const y2 = gap * 2 + head + bh;
        ctx.fillText('After', gap, y2 + head / 2);
        ctx.drawImage(after, gap, y2 + head, aw, ah);
      }
      blob = await canvasToBlob(c, MIME.png);
    }
    const name = `${stripExtension(doc.name) || 'screenshot'} before-after.${layout === 'gif' ? 'gif' : 'png'}`;
    await downloadBlob(blob, name);
    showToast('Comparison saved', 'success');
  } catch (err) {
    console.error(err);
    showToast('Couldn’t build the comparison.', 'error');
  } finally {
    store.set({ busy: null });
  }
}

function badge(ctx: CanvasRenderingContext2D, text: string, size: number, x: number, y: number) {
  ctx.font = `700 ${size}px ${FONT_FAMILY}`;
  const w = ctx.measureText(text).width + size * 1.2;
  const h = size * 1.8;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size * 0.6, y + h / 2);
}
