import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button, Toggle } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, Notice, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, loadPdfLib, pdfBlob } from '../engine';
import { PDF_ACCEPT, PdfRow, usePageThumbs, usePdfList } from '../ui';

type FieldKind = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'list' | 'other';

interface FieldInfo {
  name: string;
  kind: FieldKind;
  value: string | boolean | string[];
  options: string[];
  multiline: boolean;
  readOnly: boolean;
  maxLength?: number;
}

/** Human label from a field's fully qualified name ("form1[0].page1.first_name" → "First name"). */
export function fieldLabel(name: string): string {
  const last = name.split('.').pop()!.replace(/\[\d+\]$/, '');
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1).toLowerCase() : name;
}

export default function FillForm() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 160);
  const [fields, setFields] = useState<FieldInfo[] | null>(null);
  const [flatten, setFlatten] = useState(false);
  const [busy, setBusy] = useState(false);
  const [xfa, setXfa] = useState(false);

  useEffect(() => {
    setFields(null);
    setXfa(false);
    if (!file) return;
    let cancelled = false;
    void (async () => {
      try {
        const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList, PDFName, PDFDict } = await loadPdfLib();
        const doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
        const form = doc.getForm();
        const out: FieldInfo[] = form.getFields().map((f) => {
          const base = { name: f.getName(), readOnly: f.isReadOnly(), options: [] as string[], multiline: false };
          if (f instanceof PDFTextField) return { ...base, kind: 'text', value: f.getText() ?? '', multiline: f.isMultiline(), maxLength: f.getMaxLength() };
          if (f instanceof PDFCheckBox) return { ...base, kind: 'checkbox', value: f.isChecked() };
          if (f instanceof PDFDropdown) return { ...base, kind: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions() };
          if (f instanceof PDFRadioGroup) return { ...base, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions() };
          if (f instanceof PDFOptionList) return { ...base, kind: 'list', value: f.getSelected(), options: f.getOptions() };
          return { ...base, kind: 'other', value: '' };
        });
        // XFA-only forms (Adobe LiveCycle) have no AcroForm fields pdf-lib can fill.
        const hasXfa = out.length === 0 && !!doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict)?.has(PDFName.of('XFA'));
        if (!cancelled) {
          setFields(out.filter((f) => f.kind !== 'other'));
          setXfa(hasXfa);
        }
      } catch (err) {
        if (!cancelled) showToast(`Couldn’t read the form: ${errorMessage(err)}`, 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const set = (name: string, value: FieldInfo['value']) => setFields((fs) => fs && fs.map((f) => (f.name === name ? { ...f, value } : f)));

  const save = async () => {
    if (!file || !fields) return;
    setBusy(true);
    try {
      const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } = await loadPdfLib();
      const doc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const form = doc.getForm();
      for (const info of fields) {
        if (info.readOnly) continue;
        const f = form.getField(info.name);
        if (f instanceof PDFTextField) f.setText(String(info.value) || undefined);
        else if (f instanceof PDFCheckBox) {
          if (info.value) f.check();
          else f.uncheck();
        } else if (f instanceof PDFDropdown || f instanceof PDFRadioGroup) {
          if (info.value) f.select(String(info.value));
          else f.clear();
        }
        else if (f instanceof PDFOptionList) {
          const v = info.value as string[];
          if (v.length) f.select(v);
          else f.clear();
        }
      }
      if (flatten) form.flatten();
      await saveBlob(pdfBlob(await doc.save({ useObjectStreams: true })), `${baseName(file.name)}-filled.pdf`);
    } catch (err) {
      showToast(`Couldn’t save the form: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <ToolLayout
        main={<Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF form" hint="Fill text boxes, checkboxes, dropdowns and radio buttons" icon={<ClipboardList size={20} />} />}
        panel={<PanelSection title="How it works"><p className="text-xs leading-[17px] text-muted">Lists every fillable field in the PDF. Fill them in, then download. Flattening turns the answers into regular page content so they can’t be changed.</p></PanelSection>}
      />
    );
  }

  const input = 'h-8 w-full rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1 disabled:opacity-50';

  return (
    <ToolLayout
      main={
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto flex max-w-[640px] flex-col gap-3">
            {fields === null && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Reading form fields…
              </p>
            )}
            {fields?.length === 0 && <Notice>{xfa ? 'This is an XFA form, which only Adobe Acrobat can fill.' : 'This PDF has no fillable form fields. To add a signature or text, use Sign PDF.'}</Notice>}
            {fields?.map((f) => (
              <label key={f.name} className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-panel p-3 text-xs text-muted">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-fg">{fieldLabel(f.name)}</span>
                  {f.readOnly && <span className="text-2xs text-subtle">Read-only</span>}
                </span>
                {f.kind === 'text' &&
                  (f.multiline ? (
                    <textarea value={String(f.value)} disabled={f.readOnly} maxLength={f.maxLength} onChange={(e) => set(f.name, e.target.value)} onKeyDown={(e) => e.stopPropagation()} rows={3} className={`${input} h-auto py-2`} />
                  ) : (
                    <input value={String(f.value)} disabled={f.readOnly} maxLength={f.maxLength} onChange={(e) => set(f.name, e.target.value)} onKeyDown={(e) => e.stopPropagation()} className={input} />
                  ))}
                {f.kind === 'checkbox' && <Toggle checked={!!f.value} disabled={f.readOnly} onChange={(v) => set(f.name, v)} label={fieldLabel(f.name)} />}
                {(f.kind === 'dropdown' || f.kind === 'radio') && (
                  <select value={String(f.value)} disabled={f.readOnly} onChange={(e) => set(f.name, e.target.value)} className={input}>
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
                {f.kind === 'list' && (
                  <select multiple value={f.value as string[]} disabled={f.readOnly} onChange={(e) => set(f.name, [...e.target.selectedOptions].map((o) => o.value))} className={`${input} h-auto py-1`}>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}
          </div>
        </div>
      }
      panel={
        <>
          <PanelSection title="Document">
            <PdfRow file={file} thumb={thumbs[1]} onRemove={list.clear} />
            {fields && <p className="text-xs text-subtle">{fields.length} fillable {fields.length === 1 ? 'field' : 'fields'}</p>}
          </PanelSection>
          <PanelSection title="Output">
            <label className="flex items-center justify-between text-xs text-muted">
              <span>Flatten (lock the answers)</span>
              <Toggle checked={flatten} onChange={setFlatten} label="Flatten" />
            </label>
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!fields?.length || busy} onClick={() => void save()}>
          {busy ? <Spinner size={13} /> : <ClipboardList size={14} />} Download filled PDF
        </Button>
      }
    />
  );
}
