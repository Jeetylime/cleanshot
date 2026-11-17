import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEditor, shallowEqual } from '../../store/store';
import * as actions from '../../store/actions';
import { computeLayout } from '../../engine/render';
import { TYPE_LABELS } from '../../engine/annotations';
import { toolDef } from '../tools';
import { AnnotationPanel } from './AnnotationPanel';
import { BackgroundPanel, PaddingPanel, PresetGrid } from './BackgroundPanels';
import { CropPanel, ResizePanel, RotatePanel } from './CanvasPanels';
import { Section, Toggle } from '../ui/controls';
import { Kbd } from '../ui/Kbd';
import { modKey } from '../../lib/utils';
import type { ToolId } from '../../types';

type Mode = 'crop' | 'resize' | 'rotate' | 'background' | 'padding' | 'selection' | 'tool' | 'document';

function usePanelState() {
  return useEditor(
    (s) => {
      let mode: Mode = 'document';
      if (s.crop) mode = 'crop';
      else if (s.tool === 'resize' || s.tool === 'rotate' || s.tool === 'background' || s.tool === 'padding') mode = s.tool;
      else if (s.selection.length) mode = 'selection';
      else if (s.tool !== 'select') mode = 'tool';
      let title = '';
      let hint = '';
      if (mode === 'selection') {
        const sel = s.doc?.annotations.filter((a) => s.selection.includes(a.id)) ?? [];
        const types = new Set(sel.map((a) => a.type));
        title = sel.length === 1 ? TYPE_LABELS[sel[0].type] : types.size === 1 ? `${sel.length} ${TYPE_LABELS[sel[0].type]}s` : `${sel.length} objects`;
        hint = sel.length > 1 ? 'Changes apply to all selected objects' : '';
      } else if (mode === 'document') {
        title = 'Screenshot';
      } else {
        const def = toolDef((mode === 'tool' ? s.tool : mode) as ToolId);
        title = def?.label ?? '';
        hint = def?.hint ?? '';
      }
      return { mode, title, hint, open: s.propertiesOpen };
    },
    shallowEqual,
  );
}

export function PropertiesPanel() {
  const { mode, title, hint, open } = usePanelState();

  let body: ReactNode;
  switch (mode) {
    case 'crop':
      body = <CropPanel />;
      break;
    case 'resize':
      body = <ResizePanel />;
      break;
    case 'rotate':
      body = <RotatePanel />;
      break;
    case 'background':
      body = <BackgroundPanel />;
      break;
    case 'padding':
      body = <PaddingPanel />;
      break;
    case 'selection':
    case 'tool':
      body = <AnnotationPanel />;
      break;
    default:
      body = <DocumentPanel />;
  }

  return (
    <aside
      aria-label="Properties"
      className={`scroll-thin absolute inset-y-0 right-0 z-30 flex w-[264px] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel shadow-pop transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:shadow-none ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="sticky top-0 z-10 flex min-h-[46px] items-start justify-between gap-2 border-b border-line bg-panel/95 px-3.5 pt-3 pb-2.5 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-[length:calc(13px*var(--text-scale))] font-semibold text-fg" data-testid="panel-title">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-xs leading-[15px] text-subtle">{hint}</p>}
        </div>
        <button
          type="button"
          aria-label="Close properties"
          onClick={actions.toggleProperties}
          className="-mr-1 flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg lg:hidden"
        >
          <X size={14} />
        </button>
      </div>
      <div key={mode} className="animate-fade-in">
        {body}
      </div>
    </aside>
  );
}

function DocumentPanel() {
  const info = useEditor(
    (s) => {
      if (!s.doc) return null;
      const L = computeLayout(s.doc);
      return {
        w: s.doc.width,
        h: s.doc.height,
        outW: L.outW,
        outH: L.outH,
        unit: s.doc.unit,
        count: s.doc.annotations.length,
        bg: s.doc.background,
      };
    },
    shallowEqual,
  );
  if (!info) return null;
  return (
    <>
      <Section title="Image">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-subtle">Image</dt>
          <dd className="text-right text-fg tabular-nums">
            {info.w} × {info.h}
          </dd>
          <dt className="text-subtle">Output</dt>
          <dd className="text-right text-fg tabular-nums">
            {info.outW} × {info.outH}
          </dd>
          <dt className="text-subtle">Density</dt>
          <dd className="text-right text-fg tabular-nums">{info.unit}×</dd>
          <dt className="text-subtle">Annotations</dt>
          <dd className="text-right text-fg tabular-nums">{info.count}</dd>
        </dl>
      </Section>
      <Section
        title="Background"
        action={
          <Toggle checked={info.bg.enabled} onChange={(enabled) => actions.updateBackground({ enabled })} label="Background" />
        }
      >
        <PresetGrid bg={info.bg} compact />
        <button
          type="button"
          className="self-start text-xs text-accent hover:underline"
          onClick={() => actions.setTool('background')}
        >
          More background options
        </button>
      </Section>
      <Section title="Tips">
        <ul className="flex flex-col gap-2 text-xs text-muted">
          <Tip keys={['Space']}>Hold and drag to pan</Tip>
          <Tip keys={[modKey, 'Scroll']}>Zoom around the cursor</Tip>
          <Tip keys={['⇧']}>Constrain shapes and angles</Tip>
          <Tip keys={[modKey, 'V']}>Paste a new screenshot</Tip>
          <Tip keys={['?']}>All keyboard shortcuts</Tip>
        </ul>
      </Section>
    </>
  );
}

function Tip({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{children}</span>
      <span className="flex shrink-0 gap-0.5">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </li>
  );
}
