import { useMemo, useState } from 'react';
import { FileText, FolderArchive } from 'lucide-react';
import { Button, NumberInput, Segmented, ToggleRow } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../shared/batch';
import { createZip } from '../shared/zip';
import { BatchList } from '../shared/BatchList';
import { Dropzone, FileRow, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink, useImageList } from '../shared/ui';
import { renameAll, type RenameOptions } from './pattern';

const TOKENS = [
  { t: '{name}', d: 'original name' },
  { t: '{n:3}', d: 'number, 3 digits' },
  { t: '{date}', d: 'file date' },
  { t: '{w}x{h}', d: 'size' },
];

export default function BatchRename() {
  const list = useImageList({ multiple: true });
  useFileSink(list.add);
  const [pattern, setPattern] = useState('{name}-{n:3}');
  const [start, setStart] = useState(1);
  const [kase, setKase] = useState<RenameOptions['case']>('keep');
  const [safe, setSafe] = useState(true);
  const [busy, setBusy] = useState(false);
  const names = useMemo(
    () => renameAll(list.items.map((i) => ({ name: i.name, lastModified: i.lastModified, width: i.width, height: i.height })), { pattern, start, step: 1, case: kase, safe }),
    [list.items, pattern, start, kase, safe],
  );

  const download = async () => {
    setBusy(true);
    try {
      // The original bytes are kept as they are; only the names change.
      await saveBlob(await createZip(list.items.map((img, i) => ({ name: names[i], blob: img.file }))), 'renamed.zip');
    } catch (err) {
      showToast(`Couldn’t build the ZIP: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout
      main={
        list.items.length ? (
          <BatchList items={list.items} loading={list.loading} onAdd={list.add} onClear={list.clear} className="min-h-0 flex-1 pt-3">
            {list.items.map((img, i) => (
              <FileRow key={img.id} img={img} onRemove={() => list.remove(img.id)} status={<span className="truncate text-accent" title={names[i]}>→ {names[i]}</span>} />
            ))}
          </BatchList>
        ) : (
          <Dropzone multiple onFiles={list.add} title="Drop images to rename" hint="Files keep their exact contents; only names change" icon={<FileText size={20} />} />
        )
      }
      panel={
        <>
          <PanelSection title="Pattern">
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="Name pattern"
              spellCheck={false}
              className="h-8 rounded-[7px] bg-control px-2.5 font-mono text-sm text-fg outline-none ring-accent focus:ring-1"
            />
            <div className="flex flex-wrap gap-1.5">
              {TOKENS.map((k) => (
                <button key={k.t} type="button" title={k.d} onClick={() => setPattern((p) => p + k.t)} className="h-[24px] rounded-[6px] bg-control px-2 font-mono text-2xs text-fg hover:bg-hover">
                  {k.t}
                </button>
              ))}
            </div>
            <p className="text-2xs leading-[15px] text-subtle">Also {'{time}'} and {'{ext}'}. The extension is added automatically.</p>
          </PanelSection>
          <PanelSection title="Options">
            <NumberInput ariaLabel="Start number" prefix="Start at" value={start} min={0} max={999999} onChange={setStart} />
            <Segmented<RenameOptions['case']>
              ariaLabel="Letter case"
              value={kase}
              onChange={setKase}
              options={[
                { value: 'keep', label: 'Keep' },
                { value: 'lower', label: 'lower' },
                { value: 'upper', label: 'UPPER' },
                { value: 'kebab', label: 'kebab' },
              ]}
            />
            <ToggleRow label="Replace unsafe characters" checked={safe} onChange={setSafe} />
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!list.items.length || busy} onClick={() => void download()}>
          {busy ? <Spinner size={13} /> : <FolderArchive size={14} />} Download renamed ZIP
        </Button>
      }
    />
  );
}
