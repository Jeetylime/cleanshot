import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Pipette } from 'lucide-react';
import { clamp } from '../../lib/utils';
import { Tooltip } from './Tooltip';

// ---------------------------------------------------------------------------
// Section

export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-b border-line px-3.5 py-3 last:border-b-0 ${className}`}>
      {(title || action) && (
        <div className="mb-2.5 flex h-5 items-center justify-between">
          {title && <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">{title}</h3>}
          {action}
        </div>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {hint}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step = 1, unit = '', format, onChange, disabled }: SliderProps) {
  const id = useId();
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const display = format ? format(value) : `${Math.round(value * 100) / 100}${unit}`;

  const commitDraft = () => {
    const n = parseFloat(draft);
    if (!Number.isNaN(n)) onChange(clamp(n, min, max));
    setEditing(false);
  };

  return (
    <div className={`flex flex-col gap-1 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs text-muted">
          {label}
        </label>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setEditing(false);
              e.stopPropagation();
            }}
            className="h-[18px] w-12 rounded-[4px] bg-control px-1 text-right text-xs text-fg tabular-nums ring-1 ring-accent"
          />
        ) : (
          <button
            type="button"
            className="-my-[3px] h-[24px] min-w-[24px] rounded-[4px] px-1 text-xs text-fg tabular-nums hover:bg-hover"
            onClick={() => {
              setDraft(String(Math.round(value * 100) / 100));
              setEditing(true);
            }}
            aria-label={`${display}, edit ${typeof label === 'string' ? label : 'value'}`}
          >
            {display}
          </button>
        )}
      </div>
      <input
        id={id}
        type="range"
        className="cs-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Tooltip; also exposed as the accessible description (the visible label stays the name). */
  title?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex w-full gap-0.5 rounded-[7px] bg-control p-0.5 ${size === 'sm' ? 'h-7' : 'h-8'}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        const btn = (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-description={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`flex h-full min-w-0 flex-1 items-center justify-center gap-1 rounded-[5px] px-1.5 text-xs font-medium transition-colors duration-150 ${
              active
                ? 'bg-elevated text-fg shadow-[0_1px_2px_rgba(0,0,0,0.25),0_0_0_0.5px_var(--border-strong)]'
                : 'text-muted hover:text-fg disabled:opacity-40 disabled:hover:text-muted'
            }`}
          >
            {o.label}
          </button>
        );
        return o.title ? (
          <Tooltip key={String(o.value)} label={o.title} className="flex min-w-0 flex-1">
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle switch

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40 ${
        checked ? 'bg-accent-fill' : 'bg-active'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out ${
          checked ? 'translate-x-[12px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-xs text-muted">
      <span>{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Colors

export const ANNOTATION_COLORS = [
  { value: '#ff3b30', name: 'Red' },
  { value: '#ff9500', name: 'Orange' },
  { value: '#ffcc00', name: 'Yellow' },
  { value: '#34c759', name: 'Green' },
  { value: '#0a84ff', name: 'Blue' },
  { value: '#af52de', name: 'Purple' },
  { value: '#ff2d55', name: 'Pink' },
  { value: '#ffffff', name: 'White' },
  { value: '#1c1c1e', name: 'Black' },
];

export function ColorPicker({
  value,
  onChange,
  colors = ANNOTATION_COLORS,
  allowCustom = true,
}: {
  value: string;
  onChange: (v: string) => void;
  colors?: { value: string; name: string }[];
  allowCustom?: boolean;
}) {
  const isCustom = !!value && !colors.some((c) => c.value.toLowerCase() === value.toLowerCase());
  const inputRef = useRef<HTMLInputElement>(null);
  // Native color inputs fire `input` continuously; keep a local value so the
  // swatch updates smoothly while the store coalesces history.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <div className="flex flex-wrap items-center">
      {colors.map((c) => {
        const active = c.value.toLowerCase() === value.toLowerCase();
        const light = ['#ffffff', '#ffcc00', '#f2f2f4', '#ffd60a'].includes(c.value.toLowerCase());
        return (
          <Tooltip key={c.value} label={c.name}>
            <button
              type="button"
              aria-label={c.name}
              aria-pressed={active}
              onClick={() => onChange(c.value)}
              // 24px target (WCAG 2.5.8) around an 18px swatch.
              className="group flex h-[24px] w-[24px] items-center justify-center rounded-full"
            >
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full transition-transform duration-150 group-hover:scale-110 ${
                  active ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : ''
                }`}
                style={{ background: c.value, boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}
              >
                {active && <Check size={11} strokeWidth={3} color={light ? '#111' : '#fff'} />}
              </span>
            </button>
          </Tooltip>
        );
      })}
      {allowCustom && (
        <Tooltip label="Custom color">
          {/* The whole 24px slot is the color input (WCAG 2.5.8); the 18px circle is just the look. */}
          <span className="group relative flex h-[24px] w-[24px] items-center justify-center">
            <span
              className={`pointer-events-none flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-full transition-transform duration-150 group-hover:scale-110 ${
                isCustom ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : ''
              }`}
              style={{
                background: isCustom
                  ? local
                  : 'conic-gradient(from 180deg, #ff3b30, #ffcc00, #34c759, #0a84ff, #af52de, #ff3b30)',
              }}
            >
              {!isCustom && <Pipette size={9} strokeWidth={2.5} className="text-white drop-shadow" />}
            </span>
            <input
              ref={inputRef}
              type="color"
              aria-label="Custom color"
              value={local.length === 7 ? local : '#000000'}
              onChange={(e) => {
                setLocal(e.target.value);
                onChange(e.target.value);
              }}
              className="cs-color absolute inset-0 h-full w-full cursor-default rounded-full opacity-0"
            />
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/** Compact color well with hex readout (used for gradients and backgrounds). */
export function ColorWell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <label className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[6px] bg-control px-1.5 text-xs text-fg hover:bg-hover">
      <span className="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-[4px] shadow-[inset_0_0_0_0.5px_rgba(127,127,127,0.5)]" style={{ background: local }}>
        <input
          type="color"
          aria-label={label}
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            onChange(e.target.value);
          }}
          className="cs-color absolute inset-0 h-full w-full opacity-0"
        />
      </span>
      <span className="truncate font-mono text-[length:calc(11px*var(--text-scale))] text-muted uppercase">{local}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Number input

export function NumberInput({
  value,
  onChange,
  prefix,
  min = 1,
  max = 100000,
  ariaLabel,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: ReactNode;
  min?: number;
  max?: number;
  ariaLabel: string;
  suffix?: ReactNode;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(Math.round(value)));
  }, [value]);

  const commit = (v = draft) => {
    const n = Math.round(parseFloat(v));
    if (!Number.isNaN(n)) {
      const c = clamp(n, min, max);
      onChange(c);
      setDraft(String(c));
    } else {
      setDraft(String(Math.round(value)));
    }
  };

  return (
    <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] bg-control px-2 text-xs ring-accent focus-within:ring-1">
      {prefix && <span className="shrink-0 text-subtle">{prefix}</span>}
      <input
        type="number"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={draft}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(String(Math.round(value)));
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
            const n = clamp((parseFloat(draft) || 0) + d, min, max);
            setDraft(String(n));
            onChange(n);
          }
        }}
        className="w-full min-w-0 bg-transparent text-fg tabular-nums outline-none"
      />
      {suffix && <span className="shrink-0 text-subtle">{suffix}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Buttons

export function Button({
  children,
  onClick,
  variant = 'secondary',
  className = '',
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const styles = {
    primary: 'bg-accent-fill text-white hover:bg-accent-hover shadow-soft',
    secondary: 'bg-control text-fg hover:bg-active shadow-[inset_0_0_0_0.5px_var(--border-strong)]',
    ghost: 'text-muted hover:bg-hover hover:text-fg',
    danger: 'bg-control text-danger hover:bg-active',
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium whitespace-nowrap transition-[background-color,transform,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
