import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderArchive, LayoutDashboard } from 'lucide-react';
import { Button, Slider } from '../../components/ui/controls';
import { canvasToBlob, createCanvas, ctx2d } from '../../engine/images';
import { showToast } from '../../store/actions';
import { errorMessage } from '../shared/batch';
import { createZip } from '../shared/zip';
import { BatchList } from '../shared/BatchList';
import { Dropzone, FileRow, PanelSection, saveBlob, Spinner, Stage, ToolLayout, useFileSink, useImageList, type LoadedImage } from '../shared/ui';
import { packGrid, spriteCss, spriteJson, type SpriteLayout } from './pack';

function drawSheet(items: LoadedImage[], layout: SpriteLayout): HTMLCanvasElement {
  const c = createCanvas(Math.max(1, layout.width), Math.max(1, layout.height));
  const ctx = ctx2d(c);
  layout.frames.forEach((f, i) => ctx.drawImage(items[i].source, f.x, f.y, f.w, f.h));
  return c;
}

export default function SpriteSheet() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const [cols, setCols] = useState(0);
  const [padding, setPadding] = useState(2);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const layout = useMemo(() => packGrid(list.items.map((i) => ({ name: i.name, width: i.width, height: i.height })), cols, padding), [list.items, cols, padding]);

  useEffect(() => {
    const t = preview.current;
    if (!t || !list.items.length) return;
    const c = drawSheet(list.items, layout);
    t.width = c.width;
    t.height = c.height;
    ctx2d(t).drawImage(c, 0, 0);
    c.width = c.height = 0;
  }, [list.items, layout]);

  const download = async () => {
    setBusy(true);
    try {
      const c = drawSheet(list.items, layout);
      const png = await canvasToBlob(c, 'image/png');
      c.width = c.height = 0;
      await saveBlob(
        await createZip([
          { name: 'spritesheet.png', blob: png },
          { name: 'spritesheet.css', blob: new Blob([spriteCss(layout, 'spritesheet.png')], { type: 'text/css' }) },
          { name: 'spritesheet.json', blob: new Blob([spriteJson(layout, 'spritesheet.png')], { type: 'application/json' }) },
        ]),
        'spritesheet.zip',
      );
    } catch (err) {
      showToast(`Couldn’t build the sprite sheet: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const main = list.items.length ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <Stage>
        <canvas ref={preview} className="max-h-full max-w-full bg-[repeating-conic-gradient(#d9d9de_0%_25%,#f4f4f6_0%_50%)] bg-[length:16px_16px] [image-rendering:pixelated]" />
      </Stage>
      <div className="max-h-[34%] shrink-0 border-t border-line">
        <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="pt-2">
          {list.items.map((img, i) => (
            <FileRow key={img.id} img={img} onRemove={() => list.remove(img.id)} status={<span className="text-subtle tabular-nums">#{i + 1} · {img.width}×{img.height}</span>} />
          ))}
        </BatchList>
      </div>
    </div>
  ) : (
    <Dropzone multiple onFiles={list.add} title="Drop sprites or icons" hint="Get one PNG plus CSS classes and a JSON atlas" icon={<LayoutDashboard size={20} />} />
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          <PanelSection title="Layout">
            <Slider label="Columns" value={cols} min={0} max={16} format={(v) => (v === 0 ? 'Auto' : String(v))} onChange={(v) => setCols(Math.round(v))} />
            <Slider label="Padding" value={padding} min={0} max={32} unit="px" onChange={(v) => setPadding(Math.round(v))} />
            {list.items.length > 0 && <p className="text-xs text-subtle tabular-nums">Sheet: {layout.width}×{layout.height} px, {list.items.length} sprites</p>}
          </PanelSection>
          <PanelSection title="Includes">
            <p className="text-xs leading-[16px] text-subtle">spritesheet.png, spritesheet.css (a class per sprite, named after its file) and spritesheet.json (frames by file name, for game engines).</p>
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!list.items.length || busy} onClick={() => void download()}>
          {busy ? <Spinner size={13} /> : <FolderArchive size={14} />} Download sprite sheet
        </Button>
      }
    />
  );
}
