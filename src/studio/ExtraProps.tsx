import { Plus, Trash2 } from 'lucide-react';
import { Section, Segmented, Toggle, ColorPicker, ColorWell, Button } from '../components/ui/controls';
import * as A from './actions';
import { CHART_COLORS } from './extraRender';
import type { ChartElement, ChartKind, QrElement, TableElement } from './types';

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

const MAX_ROWS = 30;
const MAX_COLS = 10;

export function TableProps({ e, palette }: { e: TableElement; palette: { value: string; name: string }[] }) {
  const up = (p: Partial<TableElement>, key?: string) => A.updateElements<TableElement>([e.id], p, key);
  const cols = Math.max(1, ...e.cells.map((r) => r.length));
  const setCell = (r: number, c: number, v: string) => up({ cells: e.cells.map((row, i) => (i === r ? Array.from({ length: cols }, (_, k) => (k === c ? v : row[k] ?? '')) : row)) }, `cell-${r}-${c}`);
  const addRow = () => up({ cells: [...e.cells, Array(cols).fill('')], h: e.h + e.h / e.cells.length });
  const delRow = (r: number) => e.cells.length > 1 && up({ cells: e.cells.filter((_, i) => i !== r), h: e.h - e.h / e.cells.length });
  const addCol = () => up({ cells: e.cells.map((row) => [...row, '']) });
  const delCol = (c: number) => cols > 1 && up({ cells: e.cells.map((row) => row.filter((_, i) => i !== c)) });
  const pasteCsv = async () => {
    const text = await navigator.clipboard?.readText?.().catch(() => '');
    const src = text || prompt('Paste rows from a spreadsheet or CSV:') || '';
    if (!src.trim()) return;
    const { parseCsv } = await import('./bulk');
    const { headers, rows } = parseCsv(src);
    const cells = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))].slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS));
    if (cells.length) up({ cells, h: (e.h / e.cells.length) * cells.length });
  };
  return (
    <>
      <Section title="Table">
        <div className="scroll-thin -mx-1 overflow-x-auto px-1">
          <table className="border-separate border-spacing-0.5" aria-label="Table cells">
            <thead>
              <tr>
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} className="p-0">
                    <button type="button" aria-label={`Delete column ${c + 1}`} disabled={cols <= 1} onClick={() => delCol(c)} className="flex h-[24px] w-full items-center justify-center rounded-[5px] text-subtle hover:bg-hover hover:text-fg disabled:opacity-30">
                      <Trash2 size={11} />
                    </button>
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {e.cells.map((row, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className="p-0">
                      <input
                        value={row[c] ?? ''}
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        onChange={(ev) => setCell(r, c, ev.target.value)}
                        onKeyDown={(ev) => ev.stopPropagation()}
                        className={`h-7 w-[76px] rounded-[5px] bg-control px-1.5 text-xs text-fg outline-none focus:ring-1 focus:ring-accent ${e.header && r === 0 ? 'font-semibold' : ''}`}
                      />
                    </td>
                  ))}
                  <td className="p-0">
                    <button type="button" aria-label={`Delete row ${r + 1}`} disabled={e.cells.length <= 1} onClick={() => delRow(r)} className="flex h-[24px] w-[24px] items-center justify-center rounded-[5px] text-subtle hover:bg-hover hover:text-fg disabled:opacity-30">
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button onClick={addRow} disabled={e.cells.length >= MAX_ROWS}>
            <Plus size={12} /> Row
          </Button>
          <Button onClick={addCol} disabled={cols >= MAX_COLS}>
            <Plus size={12} /> Column
          </Button>
        </div>
        <Button onClick={() => void pasteCsv()}>Paste from spreadsheet</Button>
        <label className="flex items-center justify-between text-xs text-muted">
          Header row <Toggle checked={e.header} onChange={(v) => up({ header: v })} label="Header row" />
        </label>
        <Segmented ariaLabel="Text alignment" size="sm" value={e.align} onChange={(align) => up({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Text size
          <input type="range" min={8} max={72} value={e.fontSize} onChange={(ev) => up({ fontSize: Number(ev.target.value) }, 'table-font')} className="accent-[var(--accent)]" aria-label="Text size" />
        </label>
      </Section>
      <Section title="Colors">
        <span className="text-xs text-muted">Text</span>
        <ColorPicker value={e.textColor} onChange={(textColor) => up({ textColor }, 'table-text')} colors={palette} />
        {e.header && (
          <>
            <ColorWell label="Header background" value={e.headerBg} onChange={(headerBg) => up({ headerBg }, 'table-hbg')} />
            <ColorWell label="Header text" value={e.headerColor} onChange={(headerColor) => up({ headerColor }, 'table-hc')} />
          </>
        )}
        <ColorWell label="Cell background" value={e.cellBg ?? '#ffffff'} onChange={(cellBg) => up({ cellBg }, 'table-cbg')} />
        <label className="flex items-center justify-between text-xs text-muted">
          Striped rows <Toggle checked={!!e.stripe} onChange={(v) => up({ stripe: v ? '#f2f2f5' : null })} label="Striped rows" />
        </label>
        {e.stripe && <ColorWell label="Stripe" value={e.stripe} onChange={(stripe) => up({ stripe }, 'table-stripe')} />}
        <ColorWell label="Borders" value={e.borderColor} onChange={(borderColor) => up({ borderColor }, 'table-border')} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Border width
          <input type="range" min={0} max={6} step={0.5} value={e.borderWidth} onChange={(ev) => up({ borderWidth: Number(ev.target.value) }, 'table-bw')} className="accent-[var(--accent)]" aria-label="Border width" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Corner radius
          <input type="range" min={0} max={40} value={e.radius} onChange={(ev) => up({ radius: Number(ev.target.value) }, 'table-r')} className="accent-[var(--accent)]" aria-label="Corner radius" />
        </label>
      </Section>
    </>
  );
}
