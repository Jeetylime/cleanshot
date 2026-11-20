import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderArchive, Share2 } from 'lucide-react';
import { Button, ColorWell, Segmented, Slider } from '../../components/ui/controls';
import { createCanvas, ctx2d } from '../../engine/images';
import { showToast } from '../../store/actions';
import { encodeCanvas, FORMATS, type OutFormat } from '../shared/encode';
import { baseName } from '../shared/files';
import { errorMessage } from '../shared/batch';
import { createZip } from '../shared/zip';
import { FileRow, PanelSection, pickFiles, saveBlob, Spinner, ToolLayout, useFileSink, useImageList, type LoadedImage } from '../shared/ui';
import { SOCIAL_SIZES, type SocialSize } from './sizes';

type Fit = 'cover' | 'contain';

interface Look {
  img: LoadedImage | null;
  fit: Fit;
  background: string;
  background2: string;
  gradient: boolean;
  text: string;
  textColor: string;
  textSize: number;
}

/** One output: the image (if any) filled or fitted, over a color/gradient, with optional centered text. */
function render(size: SocialSize, look: Look, scale = 1): HTMLCanvasElement {
  const W = Math.round(size.w * scale);
  const H = Math.round(size.h * scale);
  const c = createCanvas(W, H);
  const ctx = ctx2d(c);
  if (look.gradient) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, look.background);
    g.addColorStop(1, look.background2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = look.background;
  ctx.fillRect(0, 0, W, H);
  if (look.img) {
    const s = look.fit === 'cover' ? Math.max(W / look.img.width, H / look.img.height) : Math.min(W / look.img.width, H / look.img.height);
    const dw = look.img.width * s;
    const dh = look.img.height * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(look.img.source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  if (look.text.trim()) {
    const fs = (Math.min(W, H) * look.textSize) / 100;
    ctx.font = `700 ${fs}px "Inter Variable", system-ui, sans-serif`;
    ctx.fillStyle = look.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Wrap to 80% of the width.
    const words = look.text.trim().split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > W * 0.8 && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    const lh = fs * 1.2;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh));
  }
  return c;
}

export default function SocialSizes() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const [picked, setPicked] = useState<Set<string>>(() => new Set(['ig-square', 'ig-story', 'x-post', 'li-post', 'og']));
  const [fit, setFit] = useState<Fit>('cover');
  const [background, setBackground] = useState('#1d1d1f');
  const [background2, setBackground2] = useState('#0a84ff');
  const [gradient, setGradient] = useState(true);
  const [text, setText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textSize, setTextSize] = useState(9);
  const [format, setFormat] = useState<OutFormat>('jpeg');
  const [busy, setBusy] = useState(false);
  const look: Look = useMemo(() => ({ img, fit, background, background2, gradient, text, textColor, textSize }), [img, fit, background, background2, gradient, text, textColor, textSize]);
  const sizes = SOCIAL_SIZES.filter((s) => picked.has(s.id));

  const download = async () => {
    setBusy(true);
    try {
      const files: { name: string; blob: Blob }[] = [];
      const base = img ? baseName(img.name) : 'social';
      for (const s of sizes) {
        const c = render(s, look);
        const r = await encodeCanvas(c, format, 90, background);
        files.push({ name: `${base}-${s.id}-${s.w}x${s.h}.${FORMATS[r.format].ext}`, blob: r.blob });
        c.width = c.height = 0;
      }
      await saveBlob(files.length === 1 ? files[0].blob : await createZip(files), files.length === 1 ? files[0].name : `${base}-social.zip`);
    } catch (err) {
      showToast(`Couldn’t create images: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <ToolLayout
      main={
        <div className="scroll-thin flex min-h-0 flex-1 flex-wrap content-start items-end justify-center gap-5 overflow-y-auto p-6">
          {sizes.length ? sizes.map((s) => <Preview key={s.id} size={s} look={look} />) : <p className="self-center text-sm text-subtle">Pick at least one size.</p>}
        </div>
      }
      panel={
        <>
          <PanelSection title="Image (optional)">
            {img ? (
              <FileRow img={img} onRemove={list.clear} status={<span className="text-subtle">{img.width}×{img.height}</span>} />
            ) : (
              <Button className="h-8" onClick={() => pickFiles(false, list.add)}>
                <Share2 size={14} /> Choose an image…
              </Button>
            )}
            {img && <Segmented<Fit> ariaLabel="Image fit" value={fit} onChange={setFit} options={[{ value: 'cover', label: 'Fill' }, { value: 'contain', label: 'Fit whole image' }]} />}
            {!img && <p className="text-2xs leading-[15px] text-subtle">Without an image you get branded placeholders: color or gradient plus text.</p>}
          </PanelSection>
          <PanelSection title="Background & text">
            <ColorWell label="Color" value={background} onChange={setBackground} />
            <Segmented ariaLabel="Background style" value={gradient ? 'g' : 's'} onChange={(v) => setGradient(v === 'g')} options={[{ value: 's', label: 'Solid' }, { value: 'g', label: 'Gradient' }]} />
            {gradient && <ColorWell label="Second color" value={background2} onChange={setBackground2} />}
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Headline (optional)" aria-label="Headline" className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1" />
            {text && (
              <>
                <ColorWell label="Text color" value={textColor} onChange={setTextColor} />
                <Slider label="Text size" value={textSize} min={3} max={20} unit="%" onChange={(v) => setTextSize(Math.round(v))} />
              </>
            )}
          </PanelSection>
          <PanelSection title={`Sizes (${picked.size})`}>
            <div className="flex flex-col">
              {SOCIAL_SIZES.map((s) => (
                <label key={s.id} className="flex min-h-[26px] items-center gap-2 text-xs text-fg">
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="h-[14px] w-[14px] accent-[var(--color-accent-fill)]" />
                  <span className="min-w-0 flex-1 truncate">
                    {s.platform} · {s.name}
                  </span>
                  <span className="text-2xs text-subtle tabular-nums">
                    {s.w}×{s.h}
                  </span>
                </label>
              ))}
            </div>
          </PanelSection>
          <PanelSection title="Output">
            <Segmented<OutFormat> ariaLabel="Output format" value={format} onChange={setFormat} options={(['jpeg', 'png', 'webp'] as OutFormat[]).map((f) => ({ value: f, label: FORMATS[f].label }))} />
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!sizes.length || busy} onClick={() => void download()}>
          {busy ? <Spinner size={13} /> : <FolderArchive size={14} />} Download {sizes.length} image{sizes.length === 1 ? '' : 's'}
        </Button>
      }
    />
  );
}

function Preview({ size, look }: { size: SocialSize; look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    const k = 240 / Math.max(size.w, size.h);
    const c = render(size, look, k);
    t.width = c.width;
    t.height = c.height;
    ctx2d(t).drawImage(c, 0, 0);
    c.width = c.height = 0;
  }, [size, look]);
  return (
    <figure className="flex flex-col items-center gap-1.5">
      <canvas ref={ref} className="rounded-[4px] shadow-[0_4px_18px_rgba(0,0,0,0.18)]" />
      <figcaption className="text-2xs text-subtle">
        {size.platform} · {size.name}
      </figcaption>
    </figure>
  );
}
