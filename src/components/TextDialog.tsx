import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, ScanText, ShieldCheck, X } from 'lucide-react';
import { useEditor } from '../store/store';
import * as actions from '../store/actions';
import { getImageLayer } from '../engine/privacy';
import { Button, Segmented } from './ui/controls';
import { useOcr } from '../tools/ai/useOcr';
import { findSensitive, linesToText, SENSITIVE, type Finding, type OcrLine } from '../tools/ai/ocr';

/**
 * Edit's "Text in image": recognize the screenshot's text on the device, to
 * copy it or to find and redact sensitive details (emails, keys, cards…).
 */
export function TextDialog() {
  const open = useEditor((s) => s.overlay === 'text');
  return open ? <TextDialogBody /> : null;
}

function TextDialogBody() {
  const doc = useEditor((s) => s.doc);
  const ocr = useOcr();
  const [lines, setLines] = useState<OcrLine[] | null>(null);
  const [kinds, setKinds] = useState<Set<string>>(() => new Set(SENSITIVE.map((s) => s.id)));
  const [style, setStyle] = useState<'redact' | 'blur' | 'pixelate'>('redact');
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    ocr.cancel();
    actions.openOverlay(null);
  };

  useEffect(() => {
    ref.current?.focus();
    if (!doc) return;
    const layer = getImageLayer(doc);
    if (layer) void ocr.run(layer, 'Reading text…').then((l) => l && setLines(l));
    // Run once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findings: Finding[] = lines ? findSensitive(lines, kinds) : [];
  const text = lines ? linesToText(lines) : '';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-fade-in" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Text in image"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close();
        }}
        className="relative flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] border border-line-strong bg-elevated shadow-pop animate-pop-in"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-[length:calc(14px*var(--text-scale))] font-semibold">
            <ScanText size={15} /> Text in image
          </h2>
          <button type="button" aria-label="Close" onClick={close} className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-muted hover:bg-hover hover:text-fg">
            <X size={14} />
          </button>
        </div>
        <div className="scroll-thin flex min-h-[320px] flex-col gap-4 overflow-y-auto px-5 py-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">Find and redact</h3>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {SENSITIVE.map((s) => (
                <label key={s.id} className="flex min-h-[24px] items-center gap-1.5 text-xs text-fg">
                  <input
                    type="checkbox"
                    checked={kinds.has(s.id)}
                    onChange={() =>
                      setKinds((k) => {
                        const n = new Set(k);
                        if (n.has(s.id)) n.delete(s.id);
                        else n.add(s.id);
                        return n;
                      })
                    }
                    className="h-[14px] w-[14px] accent-[var(--color-accent-fill)]"
                  />
                  {s.plural}
                </label>
              ))}
            </div>
            <Segmented ariaLabel="Redaction style" value={style} onChange={setStyle} options={[{ value: 'redact', label: 'Solid block' }, { value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixelate' }]} />
            {lines && (
              <ul className="flex flex-col gap-0.5 text-xs">
                {findings.length === 0 && <li className="text-subtle">Nothing found for the selected kinds.</li>}
                {findings.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-[120px] shrink-0 text-subtle">{f.label}</span>
                    <span className="truncate font-mono text-fg">{f.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="primary"
              className="h-8 self-start"
              disabled={!findings.length}
              onClick={() => {
                actions.addPrivacyRegions(findings, style);
                close();
              }}
            >
              <ShieldCheck size={14} /> Redact {findings.length || ''} {findings.length === 1 ? 'item' : 'items'}
            </Button>
            <p className="text-2xs leading-[15px] text-subtle">Recognition can miss or misread text. Check the result, and cover anything else by hand.</p>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">All text</h3>
            <textarea readOnly value={text} aria-label="Text in the image" placeholder="Reading…" className="min-h-[140px] resize-y rounded-[8px] bg-control p-2.5 text-xs leading-[1.5] text-fg outline-none" />
            <Button className="h-8 self-start" disabled={!text} onClick={() => void navigator.clipboard.writeText(text).then(() => actions.showToast('Text copied', 'success'), () => actions.showToast('Couldn’t copy in this browser.', 'error'))}>
              <Copy size={14} /> Copy text
            </Button>
          </section>
        </div>
        {ocr.status}
      </div>
    </div>,
    document.body,
  );
}
