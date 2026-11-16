import { useEffect, useState } from 'react';
import { FlipHorizontal2, FlipVertical2, Link2, RotateCcw, RotateCw, Unlink } from 'lucide-react';
import { useEditor, shallowEqual } from '../../store/store';
import * as actions from '../../store/actions';
import { Button, NumberInput, Section } from '../ui/controls';
import { Tooltip } from '../ui/Tooltip';
import { Kbd } from '../ui/Kbd';

const CROP_LABELS: Record<string, string> = {
  free: 'Free',
  original: 'Original',
  '1:1': '1:1',
  '4:3': '4:3',
  '3:2': '3:2',
  '16:9': '16:9',
  '9:16': '9:16',
};

export function CropPanel() {
  const { crop, w, h } = useEditor((s) => ({ crop: s.crop, w: s.doc?.width ?? 0, h: s.doc?.height ?? 0 }), shallowEqual);
  if (!crop) return null;
  const r = crop.rect;
  const set = (patch: Partial<typeof r>) => {
    const next = { ...r, ...patch };
    next.w = Math.min(next.w, w);
    next.h = Math.min(next.h, h);
    if (crop.aspect) {
      if ('h' in patch && !('w' in patch)) next.w = Math.min(w, next.h * crop.aspect);
      else next.h = Math.min(h, next.w / crop.aspect);
      if (next.h * crop.aspect < next.w) next.w = next.h * crop.aspect;
    }
    next.x = Math.min(Math.max(0, next.x), w - next.w);
    next.y = Math.min(Math.max(0, next.y), h - next.h);
    actions.setCropRect(next);
  };

  return (
    <>
      <Section title="Aspect ratio">
        <div className="grid grid-cols-4 gap-1">
          {actions.CROP_PRESETS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={crop.aspectId === id}
              onClick={() => actions.setCropAspect(id)}
              className={`h-7 rounded-[6px] text-xs font-medium transition-colors ${
                crop.aspectId === id ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'
              }`}
            >
              {CROP_LABELS[id]}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Selection" action={<button type="button" className="text-xs text-accent hover:underline" onClick={actions.resetCrop}>Reset</button>}>
        <div className="grid grid-cols-2 gap-1.5">
          <NumberInput ariaLabel="Crop X" prefix="X" value={r.x} min={0} max={w - 1} onChange={(x) => set({ x })} />
          <NumberInput ariaLabel="Crop Y" prefix="Y" value={r.y} min={0} max={h - 1} onChange={(y) => set({ y })} />
          <NumberInput ariaLabel="Crop width" prefix="W" value={r.w} min={2} max={w} onChange={(v) => set({ w: v })} />
          <NumberInput ariaLabel="Crop height" prefix="H" value={r.h} min={2} max={h} onChange={(v) => set({ h: v })} />
        </div>
        <p className="text-xs text-subtle">Hold Shift while dragging to keep proportions.</p>
      </Section>
      <Section>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={actions.cancelCrop}>
            Cancel <Kbd className="ml-0.5">esc</Kbd>
          </Button>
          <Button variant="primary" className="flex-1" onClick={actions.applyCrop}>
            Apply <Kbd className="ml-0.5 !border-white/30 !bg-white/15 !text-white">↵</Kbd>
          </Button>
        </div>
      </Section>
    </>
  );
}

export function ResizePanel() {
  const { w, h } = useEditor((s) => ({ w: s.doc?.width ?? 0, h: s.doc?.height ?? 0 }), shallowEqual);
  const [size, setSize] = useState({ w, h });
  const [locked, setLocked] = useState(true);
  useEffect(() => setSize({ w, h }), [w, h]);
  if (!w) return null;
  const ratio = w / h;
  const changed = size.w !== w || size.h !== h;

  return (
    <>
      <Section title="Image size">
        <div className="flex items-center gap-1.5">
          <NumberInput
            ariaLabel="Width"
            prefix="W"
            value={size.w}
            max={16000}
            onChange={(v) => setSize(locked ? { w: v, h: Math.max(1, Math.round(v / ratio)) } : { ...size, w: v })}
          />
          <Tooltip label={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}>
            <button
              type="button"
              aria-label="Maintain aspect ratio"
              aria-pressed={locked}
              onClick={() => {
                if (!locked) setSize({ w: size.w, h: Math.max(1, Math.round(size.w / ratio)) });
                setLocked(!locked);
              }}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] transition-colors ${
                locked ? 'text-accent hover:bg-hover' : 'text-subtle hover:bg-hover hover:text-fg'
              }`}
            >
              {locked ? <Link2 size={14} /> : <Unlink size={14} />}
            </button>
          </Tooltip>
          <NumberInput
            ariaLabel="Height"
            prefix="H"
            value={size.h}
            max={16000}
            onChange={(v) => setSize(locked ? { w: Math.max(1, Math.round(v * ratio)), h: v } : { ...size, h: v })}
          />
        </div>
        <div className="grid grid-cols-5 gap-1">
          {[25, 50, 75, 150, 200].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setLocked(true);
                setSize({ w: Math.max(1, Math.round((w * p) / 100)), h: Math.max(1, Math.round((h * p) / 100)) });
              }}
              className="h-7 rounded-[6px] bg-control text-xs font-medium text-muted tabular-nums transition-colors hover:bg-hover hover:text-fg"
            >
              {p}%
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!changed} onClick={() => setSize({ w, h })}>
            Reset
          </Button>
          <Button variant="primary" className="flex-1" disabled={!changed} onClick={() => actions.resizeDoc(size.w, size.h)}>
            Apply
          </Button>
        </div>
        <p className="text-xs leading-[16px] text-subtle">Annotations scale with the image. Current size: {w} × {h}px.</p>
      </Section>
    </>
  );
}

export function RotatePanel() {
  const items = [
    { label: 'Rotate left', icon: RotateCcw, run: () => actions.rotate(-1) },
    { label: 'Rotate right', icon: RotateCw, run: () => actions.rotate(1) },
    { label: 'Flip horizontal', icon: FlipHorizontal2, run: () => actions.flip('h') },
    { label: 'Flip vertical', icon: FlipVertical2, run: () => actions.flip('v') },
  ];
  return (
    <Section title="Rotate & flip">
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={it.run}
            className="flex h-[60px] flex-col items-center justify-center gap-1.5 rounded-[8px] bg-control text-xs text-muted transition-[background-color,color,transform] hover:bg-hover hover:text-fg active:scale-[0.97]"
          >
            <it.icon size={18} strokeWidth={1.75} />
            {it.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-subtle">Annotations rotate with the image.</p>
    </Section>
  );
}
