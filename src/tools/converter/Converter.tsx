import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Download, FolderArchive } from 'lucide-react';
import { Button, ColorWell, Segmented, Slider } from '../../components/ui/controls';
import { formatBytes } from '../../lib/utils';
import { canEncode, encodeCanvas, FORMATS, withExtension, type OutFormat } from '../shared/encode';
import { toCanvas } from '../shared/files';
import { errorMessage, runBatch } from '../shared/batch';
import { createZip } from '../shared/zip';
import { BatchList } from '../shared/BatchList';
import {
  Advanced,
  Dropzone,
  FileRow,
  Notice,
  PanelSection,
  ProgressBar,
  saveBlob,
  Spinner,
  ToolLayout,
  useFileSink,
  useImageList,
} from '../shared/ui';

interface Result {
  status: 'working' | 'done' | 'error';
  blob?: Blob;
  format?: OutFormat;
  error?: string;
  key: string;
}

export default function Converter() {
  const list = useImageList({ multiple: true });
  const [format, setFormat] = useState<OutFormat>('webp');
  const [quality, setQuality] = useState(90);
  const [matte, setMatte] = useState('#ffffff');
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);
  const [avif, setAvif] = useState<boolean | null>(null);
  useFileSink(list.add);

  useEffect(() => {
    void canEncode('avif').then(setAvif);
  }, []);

  // Results are tied to the settings that produced them.
  const settingsKey = `${format}|${FORMATS[format].lossy ? quality : ''}|${FORMATS[format].alpha ? '' : matte}`;
  const current = (id: string) => (results[id]?.key === settingsKey ? results[id] : undefined);
  const done = list.items.filter((i) => current(i.id)?.status === 'done');
  const pending = list.items.filter((i) => current(i.id)?.status !== 'done');
  const progress = useMemo(() => (list.items.length ? done.length / list.items.length : 0), [done.length, list.items.length]);

  const convert = async () => {
    setRunning(true);
    const key = settingsKey;
    await runBatch(
      pending,
      async (img) => {
        const canvas = toCanvas(img.source);
        try {
          return await encodeCanvas(canvas, format, quality, matte);
        } finally {
          canvas.width = canvas.height = 0;
        }
      },
      {
        concurrency: 2,
        onStart: (i) => setResults((r) => ({ ...r, [pending[i].id]: { status: 'working', key } })),
        onDone: (i, res) => setResults((r) => ({ ...r, [pending[i].id]: { status: 'done', blob: res.blob, format: res.format, key } })),
        onError: (i, err) => setResults((r) => ({ ...r, [pending[i].id]: { status: 'error', error: errorMessage(err), key } })),
      },
    );
    setRunning(false);
  };

  const downloadAll = async () => {
    const files = done.map((img) => ({ name: withExtension(img.name, current(img.id)!.format!), blob: current(img.id)!.blob! }));
    if (files.length === 1) return saveBlob(files[0].blob, files[0].name);
    const zip = await createZip(files);
    await saveBlob(zip, `converted-${FORMATS[format].ext}.zip`);
  };

  const totalIn = done.reduce((s, i) => s + i.size, 0);
  const totalOut = done.reduce((s, i) => s + (current(i.id)?.blob?.size ?? 0), 0);

  const main = list.items.length ? (
    <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="flex-1 pt-2">
      {list.items.map((img) => {
        const r = current(img.id);
        return (
          <FileRow
            key={img.id}
            img={img}
            onRemove={() => list.remove(img.id)}
            status={
              r?.status === 'working' ? (
                <Spinner size={13} />
              ) : r?.status === 'done' ? (
                <span className="text-muted">
                  {FORMATS[r.format!].label} · <span className="text-fg">{formatBytes(r.blob!.size)}</span>
                </span>
              ) : r?.status === 'error' ? (
                <span className="text-danger" title={r.error}>
                  Failed
                </span>
              ) : (
                <span className="text-subtle">{img.type.replace('image/', '').toUpperCase()} → {FORMATS[format].label}</span>
              )
            }
            right={
              r?.status === 'done' ? (
                <button
                  type="button"
                  aria-label={`Download ${img.name}`}
                  onClick={() => saveBlob(r.blob!, withExtension(img.name, r.format!))}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg"
                >
                  <Download size={14} />
                </button>
              ) : null
            }
          />
        );
      })}
    </BatchList>
  ) : (
    <Dropzone multiple onFiles={list.add} title="Drop images to convert" icon={<ArrowLeftRight size={20} />} />
  );

  const errors = list.items.filter((i) => current(i.id)?.status === 'error');

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          <PanelSection title="Output format">
            <Segmented<OutFormat>
              ariaLabel="Output format"
              value={format}
              onChange={(f) => (f === 'avif' && avif === false ? undefined : setFormat(f))}
              options={(['png', 'jpeg', 'webp', 'avif'] as OutFormat[]).map((f) => ({
                value: f,
                label: <span className={f === 'avif' && avif === false ? 'opacity-40' : ''}>{FORMATS[f].label}</span>,
                title: f === 'avif' && avif === false ? 'AVIF encoding isn’t supported by this browser' : undefined,
              }))}
            />
            {FORMATS[format].lossy && (
              <Slider label="Quality" value={quality} min={10} max={100} unit="%" onChange={(q) => setQuality(Math.round(q))} />
            )}
            <p className="text-xs leading-[16px] text-subtle">
              {format === 'png' && 'Lossless. Keeps transparency.'}
              {format === 'jpeg' && 'Best compatibility. No transparency: transparent areas are filled.'}
              {format === 'webp' && 'Smaller than JPEG at similar quality. Keeps transparency.'}
              {format === 'avif' && 'Smallest files, newer format. Keeps transparency.'}
            </p>
          </PanelSection>
          {!FORMATS[format].alpha && (
            <Advanced>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Fill for transparent areas</span>
                <ColorWell label="Fill color" value={matte} onChange={setMatte} />
              </div>
            </Advanced>
          )}
          {done.length > 0 && (
            <PanelSection title="Result">
              <dl className="grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-subtle">Converted</dt>
                <dd className="text-right text-fg tabular-nums">
                  {done.length} of {list.items.length}
                </dd>
                <dt className="text-subtle">Total size</dt>
                <dd className="text-right text-fg tabular-nums">
                  {formatBytes(totalIn)} → {formatBytes(totalOut)}
                </dd>
              </dl>
            </PanelSection>
          )}
          {errors.length > 0 && (
            <div className="px-4 py-3">
              <Notice tone="error">
                {errors.length} {errors.length === 1 ? 'image' : 'images'} failed: {current(errors[0].id)?.error}
              </Notice>
            </div>
          )}
        </>
      }
      footer={
        <>
          {running && <ProgressBar value={progress} label={<span>Converting… {done.length}/{list.items.length}</span>} />}
          <Button variant="primary" className="h-8" disabled={!pending.length || running} onClick={convert}>
            <ArrowLeftRight size={14} />
            {pending.length && list.items.length
              ? `Convert ${pending.length} ${pending.length === 1 ? 'image' : 'images'} to ${FORMATS[format].label}`
              : list.items.length
                ? 'All converted'
                : 'Add images to convert'}
          </Button>
          <Button className="h-8" disabled={!done.length || running} onClick={() => void downloadAll()}>
            <FolderArchive size={14} />
            {done.length > 1 ? `Download all as ZIP (${done.length})` : 'Download'}
          </Button>
        </>
      }
    />
  );
}
