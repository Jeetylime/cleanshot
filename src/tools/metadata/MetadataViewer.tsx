import { useEffect, useMemo, useState } from 'react';
import { Copy, FileSearch, MapPin, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui/controls';
import { formatBytes } from '../../lib/utils';
import { canvasToBlob } from '../../engine/images';
import { showToast } from '../../store/actions';
import { aspectLabel, toCanvas } from '../shared/files';
import { hasTransparency } from '../shared/encode';
import { readMetadata, stripMetadata, type ImageMeta, type MetaEntry } from '../shared/metadata';
import { Dropzone, Notice, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink, useImageList } from '../shared/ui';

const GROUP_ORDER = ['Location', 'Camera', 'Capture', 'Author', 'Software', 'Image', 'Encoding', 'Text'];

function Table({ title, rows, danger }: { title: string; rows: { label: string; value: string; sensitive?: boolean }[]; danger?: boolean }) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-line bg-panel">
      <h3 className={`flex items-center gap-1.5 border-b border-line px-3.5 py-2 text-2xs font-semibold tracking-[0.04em] uppercase ${danger ? 'text-danger' : 'text-subtle'}`}>
        {danger && <MapPin size={11} />}
        {title}
      </h3>
      <dl className="divide-y divide-line">
        {rows.map((r, i) => (
          <div key={`${r.label}-${i}`} className="grid grid-cols-[minmax(110px,40%)_1fr] gap-3 px-3.5 py-1.5 text-xs">
            <dt className="text-subtle">{r.label}</dt>
            <dd className={`min-w-0 break-words ${r.sensitive ? 'text-danger' : 'text-fg'}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function MetadataViewer() {
  const list = useImageList({ multiple: false });
  useFileSink(list.add);
  const img = list.items[0] ?? null;
  const [meta, setMeta] = useState<ImageMeta | null>(null);
  const [alpha, setAlpha] = useState<boolean | null>(null);
  const [clean, setClean] = useState<{ blob: Blob; reencoded: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMeta(null);
    setClean(null);
    setAlpha(null);
    if (!img) return;
    let cancelled = false;
    void readMetadata(img.file, img.type).then((m) => !cancelled && setMeta(m));
    setTimeout(() => !cancelled && setAlpha(hasTransparency(img.source)), 0);
    return () => {
      cancelled = true;
    };
  }, [img]);

  const groups = useMemo(() => {
    const g = new Map<string, MetaEntry[]>();
    meta?.entries.forEach((e) => g.set(e.group, [...(g.get(e.group) ?? []), e]));
    return [...g.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
  }, [meta]);

  const sensitive = meta?.entries.filter((e) => e.sensitive) ?? [];
  const hasAny = !!meta && (meta.hasExif || meta.hasXmp || meta.hasIptc || meta.textChunks > 0);

  const makeClean = async () => {
    if (!img || !meta) return;
    setBusy(true);
    try {
      // Removing EXIF also removes the orientation flag; bake rotation into pixels instead.
      const needsReencode = (meta.orientation ?? 1) > 1;
      let blob = needsReencode ? null : await stripMetadata(img.file);
      let reencoded = false;
      if (!blob) {
        const c = toCanvas(img.source);
        blob = await canvasToBlob(c, img.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.95);
        reencoded = true;
      }
      setClean({ blob, reencoded });
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type.replace('image/', '');
      await saveBlob(blob, `${img.name.replace(/\.[^.]+$/, '')}-clean.${ext}`);
    } catch (err) {
      showToast(`Couldn’t strip metadata: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyJson = async () => {
    if (!img || !meta) return;
    const data = {
      file: { name: img.name, size: img.size, type: img.type },
      image: { width: img.width, height: img.height, bitDepth: meta.bitDepth, channels: meta.channels, colorProfile: meta.colorProfile, dpi: meta.dpi },
      metadata: Object.fromEntries(groups.map(([g, rows]) => [g, Object.fromEntries(rows.map((r) => [r.label, r.value]))])),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      showToast('Metadata copied as JSON');
    } catch {
      showToast('Clipboard access was blocked.', 'error');
    }
  };

  if (!img) {
    return (
      <ToolLayout
        main={<Dropzone onFiles={list.add} title="Drop an image to inspect" icon={<FileSearch size={20} />} hint="Photos from phones and cameras carry the most metadata" />}
        panel={
          <PanelSection title="How it works">
            <p className="text-xs leading-[17px] text-muted">
              See an image’s dimensions, color details and hidden EXIF data, such as camera, capture settings and GPS location. Then download a clean copy with that metadata removed. Nothing is uploaded.
            </p>
          </PanelSection>
        }
      />
    );
  }

  const mp = (img.width * img.height) / 1_000_000;

  return (
    <ToolLayout
      main={
        <div className="scroll-thin flex-1 overflow-y-auto p-5">
          <div className="mx-auto grid max-w-[980px] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col gap-3">
              <div className="cs-checker flex max-h-[420px] items-center justify-center overflow-hidden rounded-[12px] border border-line">
                <img src={img.url} alt={img.name} className="max-h-[420px] max-w-full object-contain" />
              </div>
              {meta?.gps && (
                <Notice tone="error">
                  This photo reveals where it was taken ({meta.gps.lat.toFixed(4)}, {meta.gps.lon.toFixed(4)}). Strip metadata before sharing it publicly.
                </Notice>
              )}
            </div>
            <div className="flex flex-col gap-3" data-testid="metadata-tables">
              <Table
                title="File"
                rows={[
                  { label: 'Name', value: img.name },
                  { label: 'Size', value: `${formatBytes(img.size)} (${img.size.toLocaleString()} bytes)` },
                  { label: 'Type', value: `${meta?.format ?? '…'} · ${img.type || 'unknown'}` },
                  ...(img.lastModified ? [{ label: 'Modified', value: new Date(img.lastModified).toLocaleString() }] : []),
                ]}
              />
              <Table
                title="Image"
                rows={[
                  { label: 'Dimensions', value: `${img.width} × ${img.height} px` },
                  { label: 'Aspect ratio', value: aspectLabel(img.width, img.height) },
                  { label: 'Megapixels', value: `${mp.toFixed(mp < 1 ? 2 : 1)} MP` },
                  { label: 'Color', value: meta?.channels ?? '—' },
                  { label: 'Bit depth', value: meta?.bitDepth ? `${meta.bitDepth} bits per channel` : '—' },
                  { label: 'Transparency', value: alpha === null ? 'Checking…' : alpha ? 'Yes' : 'No' },
                  { label: 'Color profile', value: meta?.colorProfile ?? 'None (assumed sRGB)' },
                  { label: 'Resolution', value: meta?.dpi ? `${meta.dpi} DPI` : '—' },
                ]}
              />
              {!meta && (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Spinner size={12} /> Reading metadata…
                </p>
              )}
              {groups.map(([g, rows]) => (
                <Table key={g} title={g} rows={rows} danger={g === 'Location'} />
              ))}
              {meta && !groups.some(([g]) => !['Encoding', 'Image'].includes(g)) && !meta.hasXmp && (
                <p className="rounded-[12px] border border-dashed border-line px-3.5 py-3 text-xs text-muted">No EXIF, XMP or text metadata found in this file.</p>
              )}
            </div>
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Privacy">
            {meta ? (
              hasAny ? (
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={18} className={sensitive.length ? 'shrink-0 text-danger' : 'shrink-0 text-accent'} />
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-fg">
                      {sensitive.length ? `${sensitive.length} sensitive ${sensitive.length === 1 ? 'field' : 'fields'} found` : 'Contains metadata'}
                    </span>
                    <span className="text-muted">
                      {[meta.hasExif && 'EXIF', meta.hasXmp && 'XMP', meta.hasIptc && 'IPTC', meta.textChunks > 0 && `${meta.textChunks} text`].filter(Boolean).join(' · ')}
                    </span>
                    {sensitive.length > 0 && <span className="text-subtle">{sensitive.map((s) => s.label).join(', ')}</span>}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={18} className="shrink-0 text-success" />
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-fg">No identifying metadata</span>
                    <span className="text-muted">This file doesn’t carry EXIF, XMP, IPTC or text data.</span>
                  </div>
                </div>
              )
            ) : (
              <Spinner />
            )}
          </PanelSection>
          <PanelSection title="Clean copy">
            <p className="text-xs leading-[17px] text-muted">
              Removes EXIF (camera, GPS, dates), XMP, IPTC and comments. Pixels aren’t re-compressed and color profiles are kept.
            </p>
            {clean && (
              <Notice tone="success">
                Clean copy saved: {formatBytes(clean.blob.size)}
                {clean.reencoded ? ' (re-encoded to keep the correct orientation)' : ` (${formatBytes(Math.max(0, img.size - clean.blob.size))} of metadata removed)`}
              </Notice>
            )}
          </PanelSection>
          <PanelSection title="Image">
            <button type="button" onClick={() => list.clear()} className="self-start text-xs text-accent hover:underline">
              Inspect a different image
            </button>
          </PanelSection>
        </>
      }
      footer={
        <>
          <Button variant="primary" className="h-8" disabled={!meta || busy} onClick={() => void makeClean()}>
            <ShieldCheck size={14} /> Download without metadata
          </Button>
          <Button className="h-8" disabled={!meta} onClick={() => void copyJson()}>
            <Copy size={13} /> Copy as JSON
          </Button>
        </>
      }
    />
  );
}
