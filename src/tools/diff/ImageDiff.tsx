import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, GitCompareArrows } from 'lucide-react';
import { Button, Segmented, Slider } from '../../components/ui/controls';
import { canvasToBlob, createCanvas, ctx2d } from '../../engine/images';
import { CompareSlider, Dropzone, FileRow, PanelSection, saveBlob, Stage, ToolLayout, useFileSink, useImageList, type LoadedImage } from '../shared/ui';
import { diffPixels } from './compare';

type Mode = 'slider' | 'overlay' | 'difference' | 'side';

const MAX = 2400;

/** Draw an image onto a w×h canvas (top-left aligned, unscaled; images of different sizes are compared on the larger canvas). */
function pixels(img: LoadedImage, w: number, h: number): ImageData {
  const c = createCanvas(w, h);
  const ctx = ctx2d(c, { willReadFrequently: true });
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  ctx.drawImage(img.source, 0, 0, img.width * k, img.height * k);
  return ctx.getImageData(0, 0, w, h);
}

export default function ImageDiff() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const [a, b] = list.items;
  const [mode, setMode] = useState<Mode>('difference');
  const [threshold, setThreshold] = useState(16);
  const [opacity, setOpacity] = useState(50);
  const canvas = useRef<HTMLCanvasElement>(null);

  const size = useMemo(() => {
    if (!a || !b) return null;
    const k = Math.min(1, MAX / Math.max(a.width, a.height, b.width, b.height));
    return { w: Math.round(Math.max(a.width, b.width) * k), h: Math.round(Math.max(a.height, b.height) * k) };
  }, [a, b]);

  const data = useMemo(() => (a && b && size ? { pa: pixels(a, size.w, size.h), pb: pixels(b, size.w, size.h) } : null), [a, b, size]);
  const result = useMemo(() => (data && size ? diffPixels(data.pa.data, data.pb.data, size.w, size.h, threshold) : null), [data, size, threshold]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size || !data || !result || !a || !b) return;
    c.width = size.w;
    c.height = size.h;
    const ctx = ctx2d(c);
    if (mode === 'difference') {
      ctx.putImageData(new ImageData(result.image as Uint8ClampedArray<ArrayBuffer>, size.w, size.h), 0, 0);
      if (result.bounds) {
        ctx.strokeStyle = '#ff2d55';
        ctx.lineWidth = Math.max(2, size.w / 400);
        ctx.setLineDash([8, 6]);
        const r = result.bounds;
        ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
      }
    } else if (mode === 'overlay') {
      ctx.putImageData(data.pa, 0, 0);
      const t = createCanvas(size.w, size.h);
      ctx2d(t).putImageData(data.pb, 0, 0);
      ctx.globalAlpha = opacity / 100;
      ctx.drawImage(t, 0, 0);
      ctx.globalAlpha = 1;
    }
  }, [mode, size, data, result, opacity, a, b]);

  const download = async () => {
    const c = canvas.current;
    if (!c) return;
    await saveBlob(await canvasToBlob(c, 'image/png'), `difference.png`);
  };

  const pct = result ? (result.changed / result.total) * 100 : 0;

  let main;
  if (!a || !b) {
    main = <Dropzone multiple onFiles={list.add} title={a ? 'Drop the second image' : 'Drop two images to compare'} hint="Find what changed between two screenshots or versions" icon={<GitCompareArrows size={20} />} />;
  } else if (mode === 'slider') {
    main = (
      <div className="flex min-h-0 flex-1 p-6">
        <CompareSlider before={a.url} after={b.url} width={size!.w} height={size!.h} beforeLabel="A" afterLabel="B" />
      </div>
    );
  } else if (mode === 'side') {
    main = (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-4 p-6">
        {[a, b].map((img, i) => (
          <figure key={img.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <img src={img.url} alt={`Image ${i ? 'B' : 'A'}`} className="max-h-[70vh] max-w-full rounded-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.18)]" />
            <figcaption className="text-xs text-subtle">{i ? 'B' : 'A'} · {img.width}×{img.height}</figcaption>
          </figure>
        ))}
      </div>
    );
  } else {
    main = (
      <Stage>
        <canvas ref={canvas} className="max-h-full max-w-full rounded-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.18)]" />
      </Stage>
    );
  }

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          <PanelSection title="Images">
            {list.items.slice(0, 2).map((img, i) => (
              <FileRow key={img.id} img={img} onRemove={() => list.remove(img.id)} status={<span className="text-subtle">{i ? 'B' : 'A'} · {img.width}×{img.height}</span>} />
            ))}
            {list.items.length > 2 && <p className="text-xs text-subtle">Only the first two images are compared.</p>}
            {a && b && (a.width !== b.width || a.height !== b.height) && <p className="text-xs text-subtle">Sizes differ, so the images are aligned at the top-left corner.</p>}
          </PanelSection>
          <PanelSection title="View">
            <Segmented<Mode>
              ariaLabel="Comparison view"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'difference', label: 'Diff' },
                { value: 'slider', label: 'Slider' },
                { value: 'overlay', label: 'Overlay' },
                { value: 'side', label: 'Side' },
              ]}
            />
            {mode === 'difference' && <Slider label="Tolerance" value={threshold} min={0} max={120} onChange={(v) => setThreshold(Math.round(v))} />}
            {mode === 'overlay' && <Slider label="B opacity" value={opacity} min={0} max={100} unit="%" onChange={(v) => setOpacity(Math.round(v))} />}
          </PanelSection>
          {result && (
            <PanelSection title="Result">
              <p className="text-sm text-fg tabular-nums">{result.changed === 0 ? 'No differences found.' : `${result.changed.toLocaleString()} pixels differ (${pct < 0.01 ? '<0.01' : pct.toFixed(2)}%).`}</p>
              {result.bounds && <p className="text-xs text-subtle tabular-nums">Changed area: {result.bounds.w}×{result.bounds.h} at {result.bounds.x}, {result.bounds.y}</p>}
            </PanelSection>
          )}
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!result || (mode !== 'difference' && mode !== 'overlay')} onClick={() => void download()}>
          <Download size={14} /> Download view
        </Button>
      }
    />
  );
}
