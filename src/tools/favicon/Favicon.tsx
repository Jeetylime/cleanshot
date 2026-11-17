import { useEffect, useMemo, useState } from 'react';
import { AppWindow, Copy, FolderArchive } from 'lucide-react';
import { Button, ColorWell, Slider, ToggleRow } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { baseName } from '../shared/files';
import { errorMessage } from '../shared/batch';
import { createZip } from '../shared/zip';
import { Dropzone, FileRow, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { buildIco, HTML_SNIPPET, ICON_SIZES, manifestJson, pngBytes, renderIcon, type IconStyle } from './ico';

const PREVIEW_SIZES = [16, 32, 48, 180, 512];

export default function Favicon() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const [padding, setPadding] = useState(8);
  const [radius, setRadius] = useState(18);
  const [useBg, setUseBg] = useState(false);
  const [bg, setBg] = useState('#0a84ff');
  const [name, setName] = useState('My site');
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<number, string>>({});

  const style: IconStyle = useMemo(() => ({ padding: padding / 100, radius: radius / 100, background: useBg ? bg : null }), [padding, radius, useBg, bg]);

  useEffect(() => {
    if (!img) return setUrls({});
    const next: Record<number, string> = {};
    for (const s of PREVIEW_SIZES) next[s] = renderIcon(img.source, s, style).toDataURL('image/png');
    setUrls(next);
  }, [img, style]);

  useEffect(() => {
    if (img) setName(baseName(img.name));
  }, [img]);

  const download = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const files: { name: string; blob: Blob }[] = [];
      const icoParts: { size: number; bytes: Uint8Array }[] = [];
      for (const { size, name: file } of ICON_SIZES) {
        const bytes = await pngBytes(renderIcon(img.source, size, style));
        files.push({ name: file, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }) });
        if (size <= 48) icoParts.push({ size, bytes });
      }
      files.unshift({ name: 'favicon.ico', blob: await buildIco(icoParts) });
      files.push({ name: 'site.webmanifest', blob: new Blob([manifestJson(name, useBg ? bg : '#ffffff')], { type: 'application/manifest+json' }) });
      files.push({ name: 'favicon-snippet.html', blob: new Blob([HTML_SNIPPET + '\n'], { type: 'text/html' }) });
      await saveBlob(await createZip(files), 'favicons.zip');
    } catch (err) {
      showToast(`Couldn’t build icons: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const main = img ? (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col items-center gap-8 overflow-y-auto p-8">
      <div className="flex flex-wrap items-end justify-center gap-6">
        {PREVIEW_SIZES.map((s) => (
          <figure key={s} className="flex flex-col items-center gap-2">
            <span className="flex items-center justify-center rounded-[8px] border border-line bg-[repeating-conic-gradient(#d9d9de_0%_25%,#f4f4f6_0%_50%)] bg-[length:12px_12px] p-2">
              {urls[s] && <img src={urls[s]} alt="" width={Math.min(s, 160)} height={Math.min(s, 160)} style={{ imageRendering: s <= 48 ? 'pixelated' : 'auto' }} />}
            </span>
            <figcaption className="text-2xs text-subtle tabular-nums">{s}×{s}</figcaption>
          </figure>
        ))}
      </div>
      <div className="flex w-full max-w-[420px] items-center gap-2 rounded-[10px] border border-line bg-panel px-3 py-2">
        {urls[16] && <img src={urls[16]} alt="" width={16} height={16} />}
        <span className="truncate text-xs text-fg">{name}</span>
        <span className="ml-auto text-2xs text-subtle">Browser tab preview</span>
      </div>
    </div>
  ) : (
    <Dropzone onFiles={list.add} title="Drop a logo or image" hint="Square images with transparency work best" icon={<AppWindow size={20} />} />
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          {img && (
            <PanelSection title="Source">
              <FileRow img={img} onRemove={list.clear} status={<span className="text-subtle">{img.width}×{img.height}</span>} />
            </PanelSection>
          )}
          <PanelSection title="Style">
            <Slider label="Padding" value={padding} min={0} max={40} unit="%" onChange={(v) => setPadding(Math.round(v))} />
            <Slider label="Corner radius" value={radius} min={0} max={50} unit="%" onChange={(v) => setRadius(Math.round(v))} />
            <ToggleRow label="Background color" checked={useBg} onChange={setUseBg} />
            {useBg && <ColorWell label="Background" value={bg} onChange={setBg} />}
          </PanelSection>
          <PanelSection title="App name">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="App name" className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1" />
            <p className="text-xs leading-[16px] text-subtle">Used in site.webmanifest. The ZIP has favicon.ico (16, 32, 48), PNGs, an Apple touch icon, Android icons and an HTML snippet.</p>
          </PanelSection>
        </>
      }
      footer={
        <>
          <Button className="h-8" onClick={() => void navigator.clipboard.writeText(HTML_SNIPPET).then(() => showToast('HTML snippet copied'))}>
            <Copy size={14} /> Copy HTML
          </Button>
          <Button variant="primary" className="h-8" disabled={!img || busy} onClick={() => void download()}>
            {busy ? <Spinner size={13} /> : <FolderArchive size={14} />} Download icon pack
          </Button>
        </>
      }
    />
  );
}
