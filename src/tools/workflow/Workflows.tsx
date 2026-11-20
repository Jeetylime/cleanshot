import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, FolderOpen, Play, Plus, Trash2, Workflow } from 'lucide-react';
import { Button, ColorWell, NumberInput, Segmented, Slider, ToggleRow } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { uid } from '../../lib/utils';
import { encodeCanvas, FORMATS, type OutFormat } from '../shared/encode';
import { errorMessage } from '../shared/batch';
import { createZip } from '../shared/zip';
import { formatFromType, loadImage, releaseImage } from '../shared/files';
import { BatchList } from '../shared/BatchList';
import { Dropzone, FileRow, PanelSection, ProgressBar, saveBlob, Spinner, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { FILTER_PRESETS } from '../filters/adjust';
import { renameAll } from '../rename/pattern';
import { RMBG } from '../bgremove/segment';
import { loadRecipes, runStep, saveRecipes, STEP_INFO, toCanvas, type Recipe, type Step, type StepKind } from './steps';

type DirHandle = {
  name: string;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File> }>;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>;
};
type DirPicker = (o?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle>;
const dirPicker = (): DirPicker | null => {
  const p = (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker;
  return typeof p === 'function' && window.self === window.top ? p.bind(window) : null;
};
const IMG = /\.(png|jpe?g|webp|avif|gif|bmp|heic|heif)$/i;

export default function Workflows() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const [recipes, setRecipes] = useState<Recipe[]>(loadRecipes);
  const [activeId, setActiveId] = useState(recipes[0].id);
  const recipe = recipes.find((r) => r.id === activeId) ?? recipes[0];
  const [folder, setFolder] = useState<{ dir: DirHandle; files: File[] } | null>(null);
  const [writeBack, setWriteBack] = useState(true);
  const [acceptRmbg, setAcceptRmbg] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const needsRmbg = recipe.steps.some((s) => s.kind === 'removeBg');
  const inputs = folder ? folder.files.length : list.items.length;

  const update = (patch: Partial<Recipe>) => {
    const next = recipes.map((r) => (r.id === recipe.id ? { ...r, ...patch } : r));
    setRecipes(next);
    saveRecipes(next);
  };
  const setStep = (i: number, s: Step) => update({ steps: recipe.steps.map((x, k) => (k === i ? s : x)) });
  const move = (i: number, d: -1 | 1) => {
    const steps = [...recipe.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    update({ steps });
  };

  const chooseFolder = async () => {
    const pick = dirPicker();
    if (!pick) return;
    try {
      const dir = await pick({ mode: 'readwrite' });
      const files: File[] = [];
      for await (const e of dir.values()) if (e.kind === 'file' && IMG.test(e.name) && e.getFile) files.push(await e.getFile());
      files.sort((a, b) => a.name.localeCompare(b.name));
      setFolder({ dir, files });
      list.clear();
      if (!files.length) showToast('No images in that folder.', 'info');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showToast(errorMessage(err), 'error');
    }
  };

  const run = async () => {
    const files: { file: Blob & { name?: string; lastModified?: number }; name: string }[] = folder ? folder.files.map((f) => ({ file: f, name: f.name })) : list.items.map((i) => ({ file: i.file, name: i.name }));
    if (!files.length) return;
    setProgress({ done: 0, total: files.length });
    const results: { name: string; blob: Blob }[] = [];
    const names = renameAll(files.map((f) => ({ name: f.name, lastModified: (f.file as File).lastModified ?? null })), { pattern: recipe.output.name || '{name}', start: 1, step: 1, case: 'keep', safe: true });
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      try {
        const f = files[i].file;
        const img = await loadImage(f instanceof File ? f : new File([f], files[i].name, { type: f.type }));
        let c = toCanvas(img.source);
        releaseImage(img);
        for (const s of recipe.steps) c = await runStep(c, s);
        const fmt: OutFormat = recipe.output.format === 'same' ? formatFromType(img.type) ?? 'png' : recipe.output.format;
        const r = await encodeCanvas(c, fmt, recipe.output.quality);
        const base = names[i].replace(/\.[a-z0-9]{2,5}$/i, '');
        results.push({ name: `${base}.${FORMATS[r.format].ext}`, blob: r.blob });
        c.width = c.height = 0;
      } catch (err) {
        failed++;
        console.error(err);
      }
      setProgress({ done: i + 1, total: files.length });
      await new Promise((r) => setTimeout(r, 0));
    }
    try {
      if (!results.length) {
        showToast(`None of the ${files.length} images could be processed.`, 'error');
      } else if (folder && writeBack) {
        const out = await folder.dir.getDirectoryHandle('Studiolo output', { create: true });
        for (const r of results) {
          const w = await (await out.getFileHandle(r.name, { create: true })).createWritable();
          await w.write(r.blob);
          await w.close();
        }
        showToast(`Saved ${results.length} images to “${folder.dir.name}/Studiolo output”${failed ? `; ${failed} failed` : ''}.`, failed ? 'info' : 'success');
      } else if (results.length === 1) await saveBlob(results[0].blob, results[0].name);
      else if (results.length) {
        await saveBlob(await createZip(results), `${recipe.name.replace(/[^\w -]+/g, '').trim() || 'workflow'}.zip`);
        if (failed) showToast(`${failed} image${failed === 1 ? '' : 's'} couldn’t be processed.`, 'info');
      }
    } catch (err) {
      showToast(`Couldn’t save the results: ${errorMessage(err)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  const main = folder ? (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-6">
      <div className="flex items-center gap-2 text-sm text-fg">
        <FolderOpen size={16} /> <span className="font-medium">{folder.dir.name}</span> <span className="text-subtle">· {folder.files.length} images</span>
        <button type="button" className="ml-auto h-[24px] text-xs font-medium text-accent hover:underline" onClick={() => setFolder(null)}>
          Use files instead
        </button>
      </div>
      <ul className="scroll-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto rounded-[10px] border border-line bg-panel p-2 text-xs text-muted">
        {folder.files.map((f) => (
          <li key={f.name} className="truncate">
            {f.name}
          </li>
        ))}
      </ul>
    </div>
  ) : list.items.length ? (
    <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="min-h-0 flex-1 pt-3">
      {list.items.map((img) => (
        <FileRow key={img.id} img={img} onRemove={() => list.remove(img.id)} status={<span className="text-subtle">{img.width}×{img.height}</span>} />
      ))}
    </BatchList>
  ) : (
    <div className="flex flex-1 flex-col">
      <Dropzone multiple onFiles={list.add} title="Drop images to run a workflow" hint="Chain resizing, cropping, filters, watermarks and background removal" icon={<Workflow size={20} />} />
      {dirPicker() && (
        <div className="-mt-10 flex justify-center pb-8">
          <Button className="h-8" onClick={() => void chooseFolder()}>
            <FolderOpen size={14} /> Or process a whole folder…
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <ToolLayout
      main={main}
      panel={
        <>
          <PanelSection title="Workflow">
            <select value={recipe.id} onChange={(e) => setActiveId(e.target.value)} aria-label="Saved workflow" className="h-8 rounded-[7px] bg-control px-2 text-sm text-fg outline-none ring-accent focus:ring-1">
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <input value={recipe.name} onChange={(e) => update({ name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="Workflow name" className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1" />
            <div className="flex gap-1.5">
              <Button className="h-[28px] flex-1 text-xs" onClick={() => {
                const r: Recipe = { id: uid('wf'), name: 'New workflow', steps: [STEP_INFO.resize.make()], output: { format: 'jpeg', quality: 88, name: '{name}' } };
                const next = [...recipes, r];
                setRecipes(next);
                saveRecipes(next);
                setActiveId(r.id);
              }}>
                <Plus size={12} /> New
              </Button>
              <Button className="h-[28px] flex-1 text-xs" onClick={() => {
                const r: Recipe = { ...structuredClone(recipe), id: uid('wf'), name: `${recipe.name} copy` };
                const next = [...recipes, r];
                setRecipes(next);
                saveRecipes(next);
                setActiveId(r.id);
              }}>
                <Copy size={12} /> Duplicate
              </Button>
              <Button className="h-[28px] text-xs" aria-label="Delete workflow" disabled={recipes.length <= 1} onClick={() => {
                const next = recipes.filter((r) => r.id !== recipe.id);
                setRecipes(next);
                saveRecipes(next);
                setActiveId(next[0].id);
              }}>
                <Trash2 size={12} />
              </Button>
            </div>
          </PanelSection>
          <PanelSection title="Steps">
            {recipe.steps.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-[9px] border border-line p-2">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
                    {i + 1}. {STEP_INFO[s.kind].label}
                  </span>
                  <button type="button" aria-label="Move step up" disabled={i === 0} onClick={() => move(i, -1)} className="flex h-[24px] w-[24px] items-center justify-center rounded-[5px] text-muted hover:bg-hover disabled:opacity-30"><ArrowUp size={12} /></button>
                  <button type="button" aria-label="Move step down" disabled={i === recipe.steps.length - 1} onClick={() => move(i, 1)} className="flex h-[24px] w-[24px] items-center justify-center rounded-[5px] text-muted hover:bg-hover disabled:opacity-30"><ArrowDown size={12} /></button>
                  <button type="button" aria-label="Remove step" onClick={() => update({ steps: recipe.steps.filter((_, k) => k !== i) })} className="flex h-[24px] w-[24px] items-center justify-center rounded-[5px] text-muted hover:bg-hover hover:text-danger"><Trash2 size={12} /></button>
                </div>
                <StepFields step={s} onChange={(n) => setStep(i, n)} />
              </div>
            ))}
            <select value="" onChange={(e) => e.target.value && update({ steps: [...recipe.steps, STEP_INFO[e.target.value as StepKind].make()] })} aria-label="Add a step" className="h-8 rounded-[7px] bg-control px-2 text-sm text-fg outline-none ring-accent focus:ring-1">
              <option value="">+ Add a step…</option>
              {(Object.keys(STEP_INFO) as StepKind[]).map((k) => (
                <option key={k} value={k}>
                  {STEP_INFO[k].label}
                </option>
              ))}
            </select>
          </PanelSection>
          <PanelSection title="Output">
            <Segmented
              ariaLabel="Output format"
              value={recipe.output.format}
              onChange={(format) => update({ output: { ...recipe.output, format } })}
              options={[{ value: 'same', label: 'Same' }, { value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WebP' }]}
            />
            {recipe.output.format !== 'png' && <Slider label="Quality" value={recipe.output.quality} min={40} max={100} onChange={(q) => update({ output: { ...recipe.output, quality: Math.round(q) } })} />}
            <label className="flex flex-col gap-1 text-xs text-muted">
              File names
              <input value={recipe.output.name} onChange={(e) => update({ output: { ...recipe.output, name: e.target.value } })} onKeyDown={(e) => e.stopPropagation()} spellCheck={false} className="h-8 rounded-[7px] bg-control px-2.5 font-mono text-sm text-fg outline-none ring-accent focus:ring-1" />
              <span className="text-2xs text-subtle">{'{name}'}, {'{n:3}'}, {'{date}'}, {'{w}x{h}'}… Metadata (EXIF, GPS) is removed.</span>
            </label>
            {folder && <ToggleRow label="Save into “Studiolo output” in the folder" checked={writeBack} onChange={setWriteBack} />}
          </PanelSection>
          {needsRmbg && (
            <PanelSection title="Background removal model">
              <p className="text-2xs leading-[15px] text-muted">
                Uses {RMBG.label} ({RMBG.license}), downloaded once from Hugging Face. You’re responsible for having the rights to the images you process.
              </p>
              <ToggleRow label="I accept the model license" checked={acceptRmbg} onChange={setAcceptRmbg} />
            </PanelSection>
          )}
          {progress && <PanelSection><ProgressBar value={progress.done / progress.total} label={`Processing ${progress.done} of ${progress.total}`} /></PanelSection>}
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!inputs || !recipe.steps.length || !!progress || (needsRmbg && !acceptRmbg)} onClick={() => void run()}>
          {progress ? <Spinner size={13} /> : <Play size={14} />} Run on {inputs || ''} image{inputs === 1 ? '' : 's'}
        </Button>
      }
    />
  );
}

function StepFields({ step, onChange }: { step: Step; onChange: (s: Step) => void }) {
  const presets = useMemo(() => FILTER_PRESETS.filter((p) => p.id !== 'none'), []);
  switch (step.kind) {
    case 'resize':
      return (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberInput ariaLabel="Max width" prefix="W" suffix="px" value={step.maxW} min={16} max={16000} onChange={(maxW) => onChange({ ...step, maxW })} />
            <NumberInput ariaLabel="Max height" prefix="H" suffix="px" value={step.maxH} min={16} max={16000} onChange={(maxH) => onChange({ ...step, maxH })} />
          </div>
          <ToggleRow label="Enlarge smaller images" checked={step.upscale} onChange={(upscale) => onChange({ ...step, upscale })} />
        </>
      );
    case 'crop':
      return <Segmented ariaLabel="Crop ratio" value={step.ratio} onChange={(ratio) => onChange({ ...step, ratio })} options={['1:1', '4:5', '3:2', '16:9', '9:16'].map((r) => ({ value: r, label: r }))} />;
    case 'filter':
      return (
        <select value={step.preset} onChange={(e) => onChange({ ...step, preset: e.target.value })} aria-label="Filter" className="h-8 rounded-[7px] bg-control px-2 text-sm text-fg outline-none">
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      );
    case 'watermark':
      return (
        <>
          <input value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="Watermark text" className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1" />
          <Segmented ariaLabel="Position" value={step.position} onChange={(position) => onChange({ ...step, position })} options={[{ value: 'tl', label: '↖' }, { value: 'tr', label: '↗' }, { value: 'center', label: '•' }, { value: 'bl', label: '↙' }, { value: 'br', label: '↘' }]} />
          <Slider label="Size" value={step.size} min={1} max={15} step={0.5} unit="%" onChange={(size) => onChange({ ...step, size })} />
          <Slider label="Opacity" value={step.opacity} min={10} max={100} unit="%" onChange={(opacity) => onChange({ ...step, opacity: Math.round(opacity) })} />
          <ColorWell label="Color" value={step.color} onChange={(color) => onChange({ ...step, color })} />
        </>
      );
    case 'background':
      return <ColorWell label="Color" value={step.color} onChange={(color) => onChange({ ...step, color })} />;
    case 'border':
      return (
        <>
          <Slider label="Width" value={step.width} min={0.5} max={15} step={0.5} unit="%" onChange={(width) => onChange({ ...step, width })} />
          <ColorWell label="Color" value={step.color} onChange={(color) => onChange({ ...step, color })} />
        </>
      );
    default:
      return <p className="text-2xs text-subtle">Cuts out the main subject, leaving a transparent background.</p>;
  }
}
