import { Plus, Trash2 } from 'lucide-react';
import { Section, Segmented, Toggle, ColorPicker, ColorWell, Button } from '../components/ui/controls';
import * as A from './actions';
import { CHART_COLORS } from './extraRender';
import type { ChartElement, ChartKind, QrElement } from './types';

const PALETTES: { label: string; colors: string[] }[] = [
  { label: 'Bright', colors: CHART_COLORS },
  { label: 'Ocean', colors: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'] },
  { label: 'Sunset', colors: ['#ff595e', '#ff924c', '#ffca3a', '#c5ca30', '#8ac926'] },
  { label: 'Mono', colors: ['#1d1d1f', '#48484a', '#8e8e93', '#c7c7cc', '#e5e5ea'] },
  { label: 'Pastel', colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff'] },
];

export function ChartProps({ e, palette }: { e: ChartElement; palette: { value: string; name: string }[] }) {
  const up = (p: Partial<ChartElement>, key?: string) => A.updateElements<ChartElement>([e.id], p, key);
  const setRow = (i: number, p: Partial<{ label: string; value: number }>) => up({ data: e.data.map((d, k) => (k === i ? { ...d, ...p } : d)) }, `chart-${i}`);
  return (
    <>
      <Section title="Chart">
        <Segmented
          ariaLabel="Chart type"
          size="sm"
          value={e.chart}
          onChange={(v: ChartKind) => up({ chart: v })}
          options={[
            { value: 'column', label: 'Column' },
            { value: 'bar', label: 'Bar' },
            { value: 'line', label: 'Line' },
            { value: 'pie', label: 'Pie' },
            { value: 'donut', label: 'Donut' },
          ]}
        />
        <div className="flex flex-col gap-1" role="table" aria-label="Chart data">
          <div className="grid grid-cols-[1fr_80px_24px] gap-1 text-2xs text-subtle" role="row">
            <span role="columnheader">Label</span>
            <span role="columnheader">Value</span>
            <span />
          </div>
          {e.data.map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_24px] items-center gap-1" role="row">
              <input
                value={d.label}
                aria-label={`Label ${i + 1}`}
                onChange={(ev) => setRow(i, { label: ev.target.value })}
                onKeyDown={(ev) => ev.stopPropagation()}
                className="h-7 min-w-0 rounded-[6px] bg-control px-2 text-xs text-fg outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                type="number"
                value={Number.isFinite(d.value) ? d.value : ''}
                aria-label={`Value ${i + 1}`}
                onChange={(ev) => setRow(i, { value: parseFloat(ev.target.value) })}
                onKeyDown={(ev) => ev.stopPropagation()}
                className="h-7 min-w-0 rounded-[6px] bg-control px-2 text-xs text-fg tabular-nums outline-none focus:ring-1 focus:ring-accent"
              />
              <button type="button" aria-label={`Remove row ${i + 1}`} disabled={e.data.length <= 1} onClick={() => up({ data: e.data.filter((_, k) => k !== i) })} className="flex h-6 w-6 items-center justify-center rounded-[5px] text-subtle hover:bg-hover hover:text-fg disabled:opacity-30">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <Button onClick={() => up({ data: [...e.data, { label: `Item ${e.data.length + 1}`, value: 10 }] })} disabled={e.data.length >= 24}>
            <Plus size={12} /> Add row
          </Button>
        </div>
        <label className="flex items-center justify-between text-xs text-muted">
          Labels <Toggle checked={e.showLabels} onChange={(v) => up({ showLabels: v })} label="Show labels" />
        </label>
        <label className="flex items-center justify-between text-xs text-muted">
          Values <Toggle checked={e.showValues} onChange={(v) => up({ showValues: v })} label="Show values" />
        </label>
      </Section>
      <Section title="Colors">
        <div className="flex flex-col gap-1">
          {PALETTES.map((p) => (
            <button key={p.label} type="button" onClick={() => up({ colors: [...p.colors] })} className="flex h-7 items-center gap-2 rounded-[6px] px-1.5 text-xs text-muted hover:bg-hover hover:text-fg" aria-label={`${p.label} colors`}>
              <span className="flex overflow-hidden rounded-[4px]">
                {p.colors.map((c) => (
                  <span key={c} className="h-4 w-4" style={{ background: c }} />
                ))}
              </span>
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">Text</span>
        <ColorPicker value={e.textColor} colors={palette} onChange={(c) => up({ textColor: c }, 'chart-tc')} />
      </Section>
    </>
  );
}

export function QrProps({ e, palette }: { e: QrElement; palette: { value: string; name: string }[] }) {
  const up = (p: Partial<QrElement>, key?: string) => A.updateElements<QrElement>([e.id], p, key);
  return (
    <Section title="QR code">
      <label className="flex flex-col gap-1.5 text-xs text-muted">
        Link or text
        <textarea
          value={e.data}
          rows={2}
          onChange={(ev) => up({ data: ev.target.value }, 'qr-data')}
          onKeyDown={(ev) => ev.stopPropagation()}
          className="resize-none rounded-[7px] bg-control px-2 py-1.5 text-xs text-fg outline-none focus:ring-1 focus:ring-accent"
          placeholder="https://"
        />
      </label>
      <span className="text-xs text-muted">Color</span>
      <ColorPicker value={e.fg} colors={palette} onChange={(c) => up({ fg: c }, 'qr-fg')} />
      <label className="flex items-center justify-between text-xs text-muted">
        Background <Toggle checked={!!e.bg} onChange={(v) => up({ bg: v ? '#ffffff' : null })} label="QR background" />
      </label>
      {e.bg && <ColorWell label="Background color" value={e.bg} onChange={(c) => up({ bg: c }, 'qr-bg')} />}
      <label className="flex items-center justify-between text-xs text-muted">
        Rounded dots <Toggle checked={e.rounded} onChange={(v) => up({ rounded: v })} label="Rounded dots" />
      </label>
      <Segmented
        ariaLabel="Error correction"
        size="sm"
        value={e.ecc}
        onChange={(v: QrElement['ecc']) => up({ ecc: v })}
        options={[
          { value: 'L', label: 'Low', title: 'Smallest code' },
          { value: 'M', label: 'Med', title: 'Recommended' },
          { value: 'Q', label: 'High', title: 'Survives some damage' },
          { value: 'H', label: 'Max', title: 'Survives a logo on top' },
        ]}
      />
      <p className="text-2xs leading-[14px] text-subtle">Keep strong contrast so phones can scan it. Test the code before printing.</p>
    </Section>
  );
}
