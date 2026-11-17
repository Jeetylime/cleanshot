import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Upload, Wand2, X } from 'lucide-react';
import { Button, ColorWell } from '../components/ui/controls';
import { Tooltip } from '../components/ui/Tooltip';
import { pickFiles } from '../tools/shared/ui';
import { getImage } from '../engine/images';
import { showToast } from '../store/actions';
import { setBrand, useBrand } from './brand';
import { studio } from './store';
import * as A from './actions';
import { FontSelect } from './Properties';
import { allPages } from './pages';
import type { TextElement } from './types';

export function BrandPanel() {
  const brand = useBrand();
  const [pick, setPick] = useState('#0a84ff');

  const addColor = (c: string) => {
    if (brand.colors.some((x) => x.toLowerCase() === c.toLowerCase())) return;
    setBrand({ colors: [...brand.colors, c].slice(0, 16) });
  };

  const colorsFromDesign = () => {
    const doc = studio.get().doc;
    if (!doc) return;
    const found = new Map<string, number>();
    const bump = (c: string | null | undefined) => c && /^#[0-9a-f]{6}$/i.test(c) && found.set(c.toLowerCase(), (found.get(c.toLowerCase()) ?? 0) + 1);
    for (const p of allPages(doc)) {
      if (p.background.kind === 'solid') bump(p.background.color);
      for (const e of p.elements) {
        if (e.type === 'shape') bump(e.fill);
        if (e.type === 'text' || e.type === 'line' || e.type === 'icon') bump(e.color);
      }
    }
    const top = [...found.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const merged = [...brand.colors];
    for (const c of top) if (!merged.includes(c)) merged.push(c);
    setBrand({ colors: merged.slice(0, 16) });
    showToast(top.length ? 'Added this design’s colors to your brand kit.' : 'No colors found in this design.', 'info');
  };

  const applyFonts = () => {
    const doc = studio.get().doc;
    if (!doc || (!brand.headingFont && !brand.bodyFont)) return;
    const texts = doc.elements.filter((e): e is TextElement => e.type === 'text');
    if (!texts.length) return showToast('There’s no text on this page yet.', 'info');
    const sizes = texts.map((t) => t.fontSize).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)];
    A.updateElements<TextElement>(
      texts.map((t) => t.id),
      (t) => {
        const heading = t.fontSize > median * 1.3 || texts.length === 1;
        const f = heading ? brand.headingFont ?? brand.bodyFont : brand.bodyFont ?? brand.headingFont;
        return f ? { fontFamily: f } : {};
      },
    );
    A.ensureDocFonts(studio.get().doc!);
  };

  const uploadLogo = () =>
    pickFiles(true, async (files) => {
      const logos = [...brand.logos];
      for (const f of files) {
        try {
          const a = await A.importAsset(f, f.name);
          logos.push({ id: a.id, width: a.width, height: a.height, name: a.name });
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Couldn’t add that logo.', 'error');
        }
      }
      setBrand({ logos: logos.slice(0, 12) });
    });

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs leading-[17px] text-muted">Save your colors, fonts and logos once. Brand colors appear first in every color picker. Stored in this browser only.</p>

      <section className="flex flex-col gap-2">
        <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">Colors</h3>
        {brand.colors.length > 0 && (
          <div className="grid grid-cols-8 gap-1.5">
            {brand.colors.map((c) => (
              <span key={c} className="group relative">
                <Tooltip label={c}>
                  <span className="block aspect-square w-full rounded-[7px]" style={{ background: c, boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />
                </Tooltip>
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  onClick={() => setBrand({ colors: brand.colors.filter((x) => x !== c) })}
                  className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-elevated text-muted shadow-pop group-hover:flex hover:text-fg"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <ColorWell label="Brand color to add" value={pick} onChange={setPick} />
          <Button onClick={() => addColor(pick)}>
            <Plus size={12} /> Add
          </Button>
        </div>
        <Button onClick={colorsFromDesign}>
          <Wand2 size={12} /> Add colors from this design
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">Fonts</h3>
        <span className="text-xs text-muted">Headings</span>
        <FontSelect value={brand.headingFont ?? 'montserrat'} onChange={(id) => setBrand({ headingFont: id })} />
        <span className="text-xs text-muted">Body text</span>
        <FontSelect value={brand.bodyFont ?? 'inter'} onChange={(id) => setBrand({ bodyFont: id })} />
        <Button onClick={applyFonts} disabled={!brand.headingFont && !brand.bodyFont}>
          Apply brand fonts to this page
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">Logos</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {brand.logos.map((l) => (
            <LogoTile key={l.id} id={l.id} name={l.name} onRemove={() => setBrand({ logos: brand.logos.filter((x) => x.id !== l.id) })} />
          ))}
          <button type="button" onClick={uploadLogo} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line-strong text-2xs text-muted hover:border-accent hover:text-fg">
            <Upload size={15} /> Logo
          </button>
        </div>
      </section>
    </div>
  );
}

function LogoTile({ id, name, onRemove }: { id: string; name: string; onRemove: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(!!getImage(id));
  useEffect(() => {
    let alive = true;
    void A.loadAsset(id).then((ok) => alive && setReady(ok));
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    const img = getImage(id);
    const c = ref.current;
    if (!ready || !img || !c) return;
    const k = Math.min(1, 160 / Math.max(img.width, img.height));
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d')!.drawImage(img.source, 0, 0, c.width, c.height);
  }, [ready, id]);
  return (
    <span className="group relative">
      <button
        type="button"
        title={`Add ${name}`}
        onClick={() => {
          const img = getImage(id);
          if (img) A.addAssetToCanvas({ id, width: img.width, height: img.height, name });
        }}
        className="cs-checker flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px] border border-line p-1.5 hover:border-line-strong"
      >
        <canvas ref={ref} className="max-h-full max-w-full" aria-label={name} />
      </button>
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="absolute -top-1 -right-1 hidden h-5 w-5 items-center justify-center rounded-full bg-elevated text-muted shadow-pop group-hover:flex hover:text-danger">
        <Trash2 size={10} />
      </button>
    </span>
  );
}
