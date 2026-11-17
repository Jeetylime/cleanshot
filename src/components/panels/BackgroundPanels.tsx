import { useState } from 'react';
import { ArrowLeftRight, Ban } from 'lucide-react';
import { useEditor, shallowEqual } from '../../store/store';
import * as actions from '../../store/actions';
import { ASPECT_RATIOS, BACKGROUND_PRESETS, SOLID_SWATCHES, fillToCss } from '../../engine/backgrounds';
import type { BackgroundFill, BackgroundSettings } from '../../types';
import { ColorPicker, ColorWell, Section, Segmented, Slider, Toggle } from '../ui/controls';
import { Tooltip } from '../ui/Tooltip';

function useBackground(): BackgroundSettings | null {
  return useEditor((s) => s.doc?.background ?? null);
}

/** Apply a background change, enabling the background if needed. */
function setBg(patch: Partial<BackgroundSettings>, key?: string) {
  actions.updateBackground({ enabled: true, ...patch }, key);
}

export function PresetGrid({ bg, compact = false }: { bg: BackgroundSettings; compact?: boolean }) {
  const presets = compact ? BACKGROUND_PRESETS.slice(0, 8) : BACKGROUND_PRESETS;
  return (
    <div className={`grid gap-1.5 ${compact ? 'grid-cols-4' : 'grid-cols-4'}`}>
      {!compact && (
        <Tooltip label="Transparent">
          <button
            type="button"
            aria-label="Transparent background"
            aria-pressed={bg.enabled && bg.fill.kind === 'transparent'}
            onClick={() => setBg({ fill: { kind: 'transparent' }, presetId: 'transparent' })}
            className={`relative aspect-[4/3] w-full overflow-hidden rounded-[7px] shadow-[inset_0_0_0_0.5px_rgba(127,127,127,0.5)] transition-transform hover:scale-[1.04] ${
              bg.enabled && bg.presetId === 'transparent' ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : ''
            }`}
            style={{ background: fillToCss({ kind: 'transparent' }) }}
          />
        </Tooltip>
      )}
      {presets.map((p) => {
        const active = bg.enabled && bg.presetId === p.id;
        return (
          <Tooltip key={p.id} label={p.name}>
            <button
              type="button"
              aria-label={`${p.name} background`}
              aria-pressed={active}
              onClick={() => setBg({ fill: p.fill, presetId: p.id })}
              className={`relative aspect-[4/3] w-full overflow-hidden rounded-[7px] shadow-[inset_0_0_0_0.5px_rgba(127,127,127,0.35)] transition-transform hover:scale-[1.04] ${
                active ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : ''
              }`}
              style={{ background: fillToCss(p.fill) }}
            >
              <span className="absolute inset-x-[22%] top-[26%] bottom-[18%] rounded-[3px] bg-white/85 shadow-[0_2px_6px_rgba(0,0,0,0.25)]" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function BackgroundPanel() {
  const bg = useBackground();
  // Hooks must run before the early return, or toggling the background between
  // unset and set changes the hook count and React throws.
  const [tab, setTab] = useState<'solid' | 'gradient'>(() => (bg?.fill.kind === 'gradient' ? 'gradient' : 'solid'));
  if (!bg) return null;
  const fill = bg.fill;
  const mode: 'solid' | 'gradient' | 'preset' =
    fill.kind === 'gradient' && !bg.presetId ? 'gradient' : fill.kind === 'solid' && !bg.presetId ? 'solid' : 'preset';
  const shown = mode === 'preset' ? tab : mode;
  const solidColor = fill.kind === 'solid' ? fill.color : '#ffffff';
  const grad = fill.kind === 'gradient' ? fill : { kind: 'gradient' as const, from: '#a5c8ff', to: '#6f8ff8', angle: 150 };

  const setFill = (f: BackgroundFill, key?: string) => setBg({ fill: f, presetId: null }, key);

  return (
    <>
      <Section
        title="Background"
        action={<Toggle checked={bg.enabled} onChange={(enabled) => actions.updateBackground({ enabled })} label="Background" />}
      >
        <PresetGrid bg={bg} />
      </Section>

      <Section title="Custom">
        <Segmented
          ariaLabel="Fill type"
          value={mode === 'preset' ? ('' as 'solid') : mode}
          onChange={(m) => {
            setTab(m);
            if (m === 'solid') setFill({ kind: 'solid', color: solidColor });
            else setFill({ ...grad });
          }}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
          ]}
        />
        {shown === 'solid' ? (
          <ColorPicker
            value={fill.kind === 'solid' && mode === 'solid' ? fill.color : ''}
            colors={SOLID_SWATCHES.map((c) => ({ value: c, name: c.toUpperCase() }))}
            onChange={(color) => setFill({ kind: 'solid', color }, 'bg:solid')}
          />
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <ColorWell label="Gradient start" value={grad.from} onChange={(from) => setFill({ ...grad, from }, 'bg:from')} />
              <Tooltip label="Swap colors">
                <button
                  type="button"
                  aria-label="Swap colors"
                  onClick={() => setFill({ ...grad, from: grad.to, to: grad.from })}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg"
                >
                  <ArrowLeftRight size={13} />
                </button>
              </Tooltip>
              <ColorWell label="Gradient end" value={grad.to} onChange={(to) => setFill({ ...grad, to }, 'bg:to')} />
            </div>
            <Slider
              label="Angle"
              value={grad.angle}
              min={0}
              max={360}
              unit="°"
              onChange={(angle) => setFill({ ...grad, angle: Math.round(angle) }, 'bg:angle')}
            />
          </>
        )}
      </Section>

      <Section title="Canvas size">
        <div className="grid grid-cols-4 gap-1">
          {ASPECT_RATIOS.map((a) => {
            const active = bg.aspect === a.id;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={active}
                onClick={() => setBg({ aspect: a.id })}
                className={`flex h-[44px] flex-col items-center justify-center gap-1 rounded-[7px] text-2xs font-medium transition-colors ${
                  active ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'
                }`}
              >
                <AspectGlyph ratio={a.value} />
                {a.label}
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function AspectGlyph({ ratio }: { ratio: number | null }) {
  if (!ratio) return <Ban size={13} strokeWidth={1.75} className="opacity-70" />;
  const max = 14;
  const w = ratio >= 1 ? max : max * ratio;
  const h = ratio >= 1 ? max / ratio : max;
  return <span className="block rounded-[2px] border-[1.5px] border-current opacity-80" style={{ width: w, height: h }} />;
}

export function PaddingPanel() {
  const { bg, unit } = useEditor((s) => ({ bg: s.doc?.background ?? null, unit: s.doc?.unit ?? 1 }), shallowEqual);
  if (!bg) return null;
  return (
    <>
      <Section
        title="Frame"
        action={<Toggle checked={bg.enabled} onChange={(enabled) => actions.updateBackground({ enabled })} label="Background" />}
      >
        {!bg.enabled && (
          <p className="text-xs leading-[16px] text-subtle">Adjusting these turns the background on.</p>
        )}
        <Slider label="Padding" value={bg.padding} min={0} max={320} unit="px" onChange={(padding) => setBg({ padding: Math.round(padding) })} />
        <Slider label="Corner radius" value={bg.radius} min={0} max={64} unit="px" onChange={(radius) => setBg({ radius: Math.round(radius) })} />
        <Slider label="Shadow" value={bg.shadow} min={0} max={100} unit="%" onChange={(shadow) => setBg({ shadow: Math.round(shadow) })} />
      </Section>
      <Section title="Presets">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Subtle', padding: 32, radius: 8, shadow: 25 },
            { label: 'Balanced', padding: 64, radius: 12, shadow: 45 },
            { label: 'Spacious', padding: 120, radius: 16, shadow: 65 },
          ].map((p) => {
            const active = bg.enabled && bg.padding === p.padding && bg.radius === p.radius && bg.shadow === p.shadow;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setBg({ padding: p.padding, radius: p.radius, shadow: p.shadow })}
                className={`flex h-[58px] flex-col items-center justify-center gap-1.5 rounded-[7px] text-2xs font-medium transition-colors ${
                  active ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-control text-muted hover:bg-hover hover:text-fg'
                }`}
              >
                <span
                  className="flex h-[26px] w-[38px] items-center justify-center rounded-[4px]"
                  style={{ padding: p.padding / 22, background: 'linear-gradient(135deg, #f3d9a4, #7fb7a4 55%, #2f6f8f)' }}
                >
                  <span
                    className="block h-full w-full bg-white"
                    style={{ borderRadius: p.radius / 6, boxShadow: `0 ${p.shadow / 40}px ${p.shadow / 14}px rgba(0,0,0,.35)` }}
                  />
                </span>
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="text-2xs text-subtle">Sizes scale with the image ({unit}× density).</p>
      </Section>
    </>
  );
}
