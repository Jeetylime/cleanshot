import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderArchive, Grid2x2 } from 'lucide-react';
import { Button, Segmented, Slider, ToggleRow } from '../../components/ui/controls';
import { createCanvas, ctx2d } from '../../engine/images';
import { showToast } from '../../store/actions';
import { encodeCanvas, FORMATS, type OutFormat } from '../shared/encode';
import { baseName } from '../shared/files';
import { errorMessage } from '../shared/batch';
import { createZip } from '../shared/zip';
import { Dropzone, FileRow, PanelSection, saveBlob, Spinner, Stage, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { gridTiles } from './split';

const PRESETS = [
  { label: 'Carousel ×3', rows: 1, cols: 3, square: true },
  { label: 'Grid 3×3', rows: 3, cols: 3, square: true },
  { label: '2×2', rows: 2, cols: 2, square: false },
  { label: 'Halves', rows: 1, cols: 2, square: false },
];

export default function Splitter() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(3);
  const [square, setSquare] = useState(true);
  const [format, setFormat] = useState<OutFormat>('png');
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const tiles = useMemo(() => (img ? gridTiles(img.width, img.height, rows, cols, square) : []), [img, rows, cols, square]);

  useEffect(() => {
    const c = preview.current;
    if (!c || !img) return;
    const k = Math.min(1, 1100 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const ctx = ctx2d(c);
    ctx.drawImage(img.source, 0, 0, c.width, c.height);
    // Dim what the square crop leaves out, then draw the cut lines and numbers.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2;
    ctx.font = `600 ${Math.max(12, Math.round(c.width / 40))}px system-ui, sans-serif`;
    tiles.forEach((t, i) => {
      ctx.drawImage(img.source, t.x, t.y, t.w, t.h, t.x * k, t.y * k, t.w * k, t.h * k);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(t.x * k + 1, t.y * k + 1, t.w * k - 2, t.h * k - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(t.x * k + 6, t.y * k + 6, 28, 22);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(i + 1), t.x * k + 12, t.y * k + 23);
    });
  }, [img, tiles]);

  const download = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const files: { name: string; blob: Blob }[] = [];
      const pad = String(tiles.length).length;
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const c = createCanvas(t.w, t.h);
        ctx2d(c).drawImage(img.source, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
        const r = await encodeCanvas(c, format, 92);
        files.push({ name: `${baseName(img.name)}-${String(i + 1).padStart(pad, '0')}.${FORMATS[r.format].ext}`, blob: r.blob });
        c.width = c.height = 0;
      }
      await saveBlob(await createZip(files), `${baseName(img.name)}-tiles.zip`);
    } catch (err) {
      showToast(`Couldn’t split the image: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout
      main={
        img ? (
          <Stage>
            <canvas ref={preview} className="max-h-full max-w-full rounded-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.18)]" />
          </Stage>
        ) : (
          <Dropzone onFiles={list.add} title="Drop an image to split" hint="Cut panoramas into carousel slides, or any image into a grid" icon={<Grid2x2 size={20} />} />
        )
      }
      panel={
        <>
          {img && (
            <PanelSection title="Source">
              <FileRow img={img} onRemove={list.clear} status={<span className="text-subtle">{img.width}×{img.height}</span>} />
            </PanelSection>
          )}
          <PanelSection title="Grid">
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <Button key={p.label} className="h-[28px] text-xs" onClick={() => (setRows(p.rows), setCols(p.cols), setSquare(p.square))}>
                  {p.label}
                </Button>
              ))}
            </div>
            <Slider label="Rows" value={rows} min={1} max={10} onChange={(v) => setRows(Math.round(v))} />
            <Slider label="Columns" value={cols} min={1} max={10} onChange={(v) => setCols(Math.round(v))} />
            <ToggleRow label="Square tiles (crop to fit)" checked={square} onChange={setSquare} />
            {tiles[0] && <p className="text-xs text-subtle tabular-nums">{tiles.length} tiles, about {tiles[0].w}×{tiles[0].h} px each</p>}
          </PanelSection>
          <PanelSection title="Output">
            <Segmented<OutFormat> ariaLabel="Output format" value={format} onChange={setFormat} options={(['png', 'jpeg', 'webp'] as OutFormat[]).map((f) => ({ value: f, label: FORMATS[f].label }))} />
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!img || busy} onClick={() => void download()}>
          {busy ? <Spinner size={13} /> : <FolderArchive size={14} />} Download {tiles.length || ''} tiles
        </Button>
      }
    />
  );
}
