import { useEffect, useMemo, useState } from 'react';
import { Download, PenTool } from 'lucide-react';
import { Button, Segmented, Slider, ToggleRow } from '../../components/ui/controls';
import { createCanvas, ctx2d } from '../../engine/images';
import { baseName } from '../shared/files';
import { formatBytes } from '../../lib/utils';
import { CompareSlider, Dropzone, FileRow, PanelSection, saveBlob, Spinner, ToolLayout, useBlobUrl, useFileSink, useImageList } from '../shared/ui';
import { traceToSvg, type TraceResult } from './trace';

const PRESETS = [
  { id: 'logo', label: 'Logo', colors: 4, detail: 70, despeckle: 4, smooth: true },
  { id: 'illustration', label: 'Illustration', colors: 12, detail: 75, despeckle: 6, smooth: true },
  { id: 'poster', label: 'Poster', colors: 6, detail: 45, despeckle: 12, smooth: true },
  { id: 'pixel', label: 'Pixel art', colors: 16, detail: 100, despeckle: 0, smooth: false },
];

export default function ImageToSvg() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const [colors, setColors] = useState(6);
  const [detail, setDetail] = useState(70);
  const [despeckle, setDespeckle] = useState(4);
  const [smooth, setSmooth] = useState(true);
  const [resolution, setResolution] = useState(700);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const blob = useMemo(() => (result ? new Blob([result.svg], { type: 'image/svg+xml' }) : null), [result]);
  const url = useBlobUrl(blob);

  useEffect(() => {
    if (!img) return setResult(null);
    setBusy(true);
    const t = setTimeout(() => {
      // Trace a reduced copy (fast), then scale the paths back to full size.
      const k = Math.min(1, resolution / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k));
      const h = Math.max(1, Math.round(img.height * k));
      const c = createCanvas(w, h);
      const ctx = ctx2d(c, { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img.source, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      c.width = c.height = 0;
      setResult(traceToSvg(data, w, h, { colors, tolerance: 0.35 + ((100 - detail) / 100) * 3, minArea: despeckle, smooth }, img.width, img.height));
      setBusy(false);
    }, 150);
    return () => clearTimeout(t);
  }, [img, colors, detail, despeckle, smooth, resolution]);

  return (
    <ToolLayout
      main={
        img ? (
          <div className="relative flex min-h-0 flex-1 p-6">
            {url && <CompareSlider before={img.url} after={url} width={img.width} height={img.height} beforeLabel="Original" afterLabel="SVG" checker />}
            {busy && (
              <span className="absolute top-8 right-8 flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-xs text-muted shadow">
                <Spinner size={12} /> Tracing…
              </span>
            )}
          </div>
        ) : (
          <Dropzone onFiles={list.add} title="Drop an image to vectorize" hint="Best for logos, icons, flat illustrations and pixel art" icon={<PenTool size={20} />} />
        )
      }
      panel={
        <>
          {img && (
            <PanelSection title="Source">
              <FileRow img={img} onRemove={list.clear} status={<span className="text-subtle">{img.width}×{img.height}</span>} />
            </PanelSection>
          )}
          <PanelSection title="Style">
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <Button key={p.id} className="h-[28px] text-xs" onClick={() => (setColors(p.colors), setDetail(p.detail), setDespeckle(p.despeckle), setSmooth(p.smooth))}>
                  {p.label}
                </Button>
              ))}
            </div>
            <Slider label="Colors" value={colors} min={2} max={32} onChange={(v) => setColors(Math.round(v))} />
            <Slider label="Detail" value={detail} min={0} max={100} unit="%" onChange={(v) => setDetail(Math.round(v))} />
            <Slider label="Ignore specks under" value={despeckle} min={0} max={60} unit=" px²" onChange={(v) => setDespeckle(Math.round(v))} />
            <ToggleRow label="Smooth curves" checked={smooth} onChange={setSmooth} />
          </PanelSection>
          <PanelSection title="Tracing resolution">
            <Segmented<number>
              ariaLabel="Tracing resolution"
              value={resolution}
              onChange={setResolution}
              options={[
                { value: 400, label: 'Fast' },
                { value: 700, label: 'Normal' },
                { value: 1200, label: 'Fine' },
              ]}
            />
          </PanelSection>
          {result && (
            <PanelSection title="Result">
              <p className="text-xs text-subtle tabular-nums">
                {result.paths} colors, {result.points.toLocaleString()} points, {formatBytes(result.svg.length)}
              </p>
            </PanelSection>
          )}
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!blob || busy} onClick={() => blob && img && void saveBlob(blob, `${baseName(img.name)}.svg`)}>
          <Download size={14} /> Download SVG
        </Button>
      }
    />
  );
}
