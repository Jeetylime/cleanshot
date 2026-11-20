import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button, ToggleRow } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, loadPdfLib, pdfBlob } from '../engine';
import { PDF_ACCEPT, PdfRow, usePageThumbs, usePdfList } from '../ui';
import { ALL_PERMISSIONS, type Permissions } from '../crypto';

const PERMS: { key: keyof Permissions; label: string }[] = [
  { key: 'print', label: 'Printing' },
  { key: 'copy', label: 'Copying text and images' },
  { key: 'modify', label: 'Editing' },
  { key: 'annotate', label: 'Comments and annotations' },
  { key: 'fillForms', label: 'Filling in forms' },
  { key: 'assemble', label: 'Inserting, rotating or deleting pages' },
];

const input = 'h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1';

export default function Protect() {
  const list = usePdfList(false);
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const thumbs = usePageThumbs(file, 120);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [restrict, setRestrict] = useState(false);
  const [owner, setOwner] = useState('');
  const [perms, setPerms] = useState<Permissions>({ ...ALL_PERMISSIONS, modify: false, assemble: false });
  const [busy, setBusy] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ownerSame = restrict && owner && owner === pw;

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const lib = await loadPdfLib();
      const { saveEncrypted } = await import('../crypto');
      const doc = await lib.PDFDocument.load(file.bytes, { updateMetadata: false });
      const bytes = await saveEncrypted(lib, doc, pw, restrict ? owner : '', restrict ? perms : ALL_PERMISSIONS);
      await saveBlob(pdfBlob(bytes), `${baseName(file.name)}-protected.pdf`);
      showToast('Protected with AES-256. Keep the password somewhere safe: it can’t be recovered.', 'success');
    } catch (err) {
      showToast(`Couldn’t protect the PDF: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout
      main={
        file ? (
          <div className="flex flex-1 items-start justify-center p-8">
            <div className="w-full max-w-[420px]">
              <PdfRow file={file} thumb={thumbs[1]} onRemove={list.clear} />
            </div>
          </div>
        ) : (
          <Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a PDF to protect" hint="Add an open password and optional permission limits" icon={<Lock size={20} />} />
        )
      }
      panel={
        <>
          <PanelSection title="Open password">
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Password" placeholder="Password" className={input} />
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Repeat password" placeholder="Repeat password" className={input} />
            {mismatch && <p className="text-xs text-danger">The passwords don’t match.</p>}
            <p className="text-2xs leading-[15px] text-subtle">Encrypted with AES-256. Nobody, including Studiolo, can open the file without this password.</p>
          </PanelSection>
          <PanelSection title="Permissions">
            <ToggleRow label="Limit what people can do" checked={restrict} onChange={setRestrict} />
            {restrict && (
              <>
                {PERMS.map((p) => (
                  <ToggleRow key={p.key} label={p.label} checked={perms[p.key]} onChange={(v) => setPerms({ ...perms, [p.key]: v })} />
                ))}
                <input type="password" autoComplete="new-password" value={owner} onChange={(e) => setOwner(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Permissions password" placeholder="Permissions password (to change these later)" className={input} />
                {ownerSame && <p className="text-xs text-danger">Use a different password, or anyone who can open the file could lift the limits.</p>}
                <p className="text-2xs leading-[15px] text-subtle">PDF apps are expected to honor these limits, but not every app does. Without a permissions password, a random one is used.</p>
              </>
            )}
          </PanelSection>
        </>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!file || !pw || pw !== pw2 || !!ownerSame || busy} onClick={() => void run()}>
          {busy ? <Spinner size={13} /> : <Lock size={14} />} Protect PDF
        </Button>
      }
    />
  );
}
