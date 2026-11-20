import { useState } from 'react';
import { LockOpen } from 'lucide-react';
import { Button } from '../../components/ui/controls';
import { showToast } from '../../store/actions';
import { errorMessage } from '../../tools/shared/batch';
import { Dropzone, Notice, PanelSection, saveBlob, Spinner, ToolLayout, useFileSink } from '../../tools/shared/ui';
import { baseName, loadPdfLib, pdfBlob } from '../engine';
import { PDF_ACCEPT, PdfRow, usePdfList } from '../ui';

export default function Unlock() {
  const list = usePdfList(false, { allowEncrypted: true });
  useFileSink(list.add);
  const file = list.items[0] ?? null;
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const lib = await loadPdfLib();
      const { loadDecrypted, PasswordError, RestrictedError } = await import('../crypto');
      try {
        const doc = await loadDecrypted(lib, file.bytes, pw, { requireChangeRights: true });
        await saveBlob(pdfBlob(await doc.save()), `${baseName(file.name)}-unlocked.pdf`);
        showToast('Password removed', 'success');
      } catch (err) {
        if (err instanceof PasswordError || err instanceof RestrictedError) setError(err.message);
        else throw err;
      }
    } catch (err) {
      showToast(`Couldn’t unlock the PDF: ${errorMessage(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const plain = file && !file.encrypted;
  return (
    <ToolLayout
      main={
        file ? (
          <div className="flex flex-1 items-start justify-center p-8">
            <div className="flex w-full max-w-[420px] flex-col gap-3">
              <PdfRow file={file} onRemove={() => (list.clear(), setPw(''), setError(null))} />
              {plain && <Notice tone="success">This PDF isn’t protected; there’s nothing to remove.</Notice>}
              {file.encrypted === 'restricted' && <Notice>This PDF opens without a password but has editing restrictions. Enter its permissions (owner) password to remove them.</Notice>}
            </div>
          </div>
        ) : (
          <Dropzone accept={PDF_ACCEPT} onFiles={list.add} title="Drop a protected PDF" hint="Remove its password, using the password you already know" icon={<LockOpen size={20} />} />
        )
      }
      panel={
        <PanelSection title="Password">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
            className="flex flex-col gap-2"
          >
            <input type="password" autoComplete="current-password" value={pw} onChange={(e) => (setPw(e.target.value), setError(null))} onKeyDown={(e) => e.stopPropagation()} aria-label="PDF password" placeholder="Password" className="h-8 rounded-[7px] bg-control px-2.5 text-sm text-fg outline-none ring-accent focus:ring-1" />
            {error && <p className="text-xs text-danger" role="alert">{error}</p>}
          </form>
          <p className="text-2xs leading-[15px] text-subtle">Works with RC4 and AES (128 and 256-bit) protection. Studiolo can’t guess or recover a password you don’t have.</p>
        </PanelSection>
      }
      footer={
        <Button variant="primary" className="h-8" disabled={!file || !!plain || busy} onClick={() => void run()}>
          {busy ? <Spinner size={13} /> : <LockOpen size={14} />} Remove password
        </Button>
      }
    />
  );
}
