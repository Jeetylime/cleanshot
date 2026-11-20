import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Download, HardDrive, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { HomeLogo, SettingsMenu } from './TopBar';
import { Button } from './ui/controls';
import { formatBytes } from '../lib/utils';
import { clearRecents, showToast } from '../store/actions';
import { CACHE_NAME } from '../tools/ai/runtime';
import { clearOfflineCache, takeInventory, type Inventory, type StoreUsage } from '../persistence/inventory';
import { errorMessage } from '../tools/shared/batch';
import { createZip } from '../tools/shared/zip';
import { pickFiles, saveBlob } from '../tools/shared/ui';

function Row({ label, hint, usage, children }: { label: string; hint: string; usage: StoreUsage | undefined; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex min-w-[200px] flex-1 flex-col">
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="text-xs text-subtle">{hint}</span>
      </div>
      <span className="w-[130px] text-right text-xs text-muted tabular-nums">
        {usage ? `${usage.count.toLocaleString()} · ${formatBytes(usage.bytes)}` : '…'}
      </span>
      <div className="flex w-full justify-end gap-2 sm:w-auto">{children}</div>
    </div>
  );
}

/** Everything Studiolo stores on this device, with ways to export or clear it. */
export default function StoragePage() {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => setInv(await takeInventory(CACHE_NAME));
  useEffect(() => {
    const prev = document.title;
    document.title = 'Storage · Studiolo';
    void refresh();
    return () => {
      document.title = prev;
    };
  }, []);

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await fn();
      if (done) showToast(done);
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const backup = async () => {
    const { exportSettings } = await import('../persistence/backup');
    const { blob, summary } = await exportSettings();
    const { downloadBlob } = await import('../engine/export');
    await downloadBlob(blob, `studiolo-settings-${new Date().toISOString().slice(0, 10)}.studiolo-settings`);
    showToast(`Backed up ${summary}`, 'success');
  };

  const restore = async (file: File) => {
    const { importSettings } = await import('../persistence/backup');
    const summary = await importSettings(file);
    showToast(`Restored ${summary}. Reloading…`, 'success');
    setTimeout(() => location.reload(), 1200);
  };

  const exportProjects = async () => {
    const db = await import('../studio/persistence');
    const { docAssetIds } = await import('../studio/actions');
    const list = await db.listProjects();
    if (!list.length) throw new Error('There are no Canvas designs to export.');
    const files: { name: string; blob: Blob }[] = [];
    const used = new Set<string>();
    for (const p of list) {
      const rec = await db.loadProject(p.id);
      if (!rec) continue;
      const assets = (await Promise.all(docAssetIds(rec.doc).map((id) => db.getAsset(id)))).filter((a): a is NonNullable<typeof a> => !!a);
      let name = (rec.name || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled';
      while (used.has(name)) name += ' copy';
      used.add(name);
      files.push({ name: `${name}.studiolo`, blob: await db.buildProjectFile(rec.doc, assets) });
    }
    await saveBlob(await createZip(files), 'studiolo-designs.zip');
  };

  const deleteProjects = async () => {
    if (!confirm('Delete every Canvas design saved in this browser? This can’t be undone. Export them first if you want a copy.')) throw new Error('Cancelled');
    const db = await import('../studio/persistence');
    for (const p of await db.listProjects()) await db.deleteProject(p.id);
    await db.collectGarbage(new Set());
  };

  const persist = async () => {
    const ok = await navigator.storage?.persist?.();
    if (!ok) throw new Error('The browser declined. It usually grants this to installed or frequently used sites.');
  };

  const pct = inv?.estimate ? Math.min(100, (inv.estimate.usage / inv.estimate.quota) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1">
          <HomeLogo />
          <ChevronRight size={14} className="text-subtle" />
          <span className="flex items-center gap-1.5 px-1.5 text-sm font-semibold text-fg" aria-current="page">
            <HardDrive size={14} className="text-muted" /> Storage
          </span>
        </nav>
        <SettingsMenu editorItems={false} />
      </header>
      <main className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-fg">Storage on this device</h1>
            <p className="text-sm leading-[22px] text-muted">Studiolo has no servers. Everything below lives only in this browser, and clearing site data removes it.</p>
          </div>

          <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-panel p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Browser storage used by this site</span>
              <span className="tabular-nums">{inv?.estimate ? `${formatBytes(inv.estimate.usage)} of ${formatBytes(inv.estimate.quota)}` : 'Unknown'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-control" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
              <div className={`h-full rounded-full ${pct > 85 ? 'bg-danger' : 'bg-accent-fill'}`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <ShieldCheck size={13} className={inv?.persisted ? 'text-success' : 'text-subtle'} />
                {inv?.persisted ? 'Protected from automatic cleanup' : 'The browser may clear this data when space runs low'}
              </span>
              {inv && !inv.persisted && (
                <Button className="ml-auto h-7" disabled={!!busy} onClick={() => void act('persist', persist, 'Storage is now protected')}>
                  Protect my data
                </Button>
              )}
              <Button variant="ghost" className="h-7" onClick={() => void refresh()}>
                <RefreshCw size={13} /> Refresh
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-[12px] border border-line bg-panel p-4">
            <h2 className="text-sm font-semibold text-fg">Back up your settings</h2>
            <p className="text-xs leading-[18px] text-muted">
              One file with your preferences, saved styles, brand kit (with logos), saved signatures and Canvas templates, to restore here or in another browser. Designs aren’t included; export them above. Signatures are personal: keep the file private.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="h-7" disabled={!!busy} onClick={() => void act('backup', backup, '')}>
                <Download size={13} /> Download backup
              </Button>
              <Button className="h-7" disabled={!!busy} onClick={() => pickFiles(false, (f) => f[0] && void act('restore', () => restore(f[0]), ''), '.studiolo-settings,application/json')}>
                <Upload size={13} /> Restore from backup…
              </Button>
            </div>
          </section>

          <section className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-panel">
            <Row label="Canvas designs" hint="Autosaved projects in “Your designs”" usage={inv?.projects}>
              <Button className="h-7" disabled={!inv?.projects.count || !!busy} onClick={() => void act('export', exportProjects, 'Designs exported')}>
                <Download size={13} /> Export all
              </Button>
              <Button variant="danger" className="h-7" disabled={!inv?.projects.count || !!busy} onClick={() => void act('del-projects', deleteProjects, 'Designs deleted')}>
                <Trash2 size={13} /> Delete
              </Button>
            </Row>
            <Row label="Canvas images" hint="Photos and logos used by designs, templates and the brand kit" usage={inv?.assets} />
            <Row label="Your templates" hint="Designs saved as templates" usage={inv?.templates} />
            <Row label="Version history" hint="Earlier versions of your designs (deleted with the design)" usage={inv?.versions} />
            <Row label="Edit sessions" hint="Recent screenshots you can reopen" usage={inv ? { count: inv.sessions.count, bytes: inv.sessions.bytes + inv.sessionImages.bytes } : undefined}>
              <Button variant="danger" className="h-7" disabled={!inv?.sessions.count || !!busy} onClick={() => void act('recents', () => clearRecents(), '')}>
                <Trash2 size={13} /> Clear
              </Button>
            </Row>
            <Row label="AI models" hint="Background removal and upscaling weights from Hugging Face" usage={inv?.models}>
              <Button variant="danger" className="h-7" disabled={!inv?.models.count || !!busy} onClick={() => void act('models', () => caches.delete(CACHE_NAME), 'Downloaded models deleted')}>
                <Trash2 size={13} /> Delete
              </Button>
            </Row>
            <Row label="Offline app files" hint="Lets Studiolo open without a connection" usage={inv?.offline}>
              <Button variant="danger" className="h-7" disabled={!inv?.offline.count || !!busy} onClick={() => void act('offline', clearOfflineCache, 'Offline files cleared')}>
                <Trash2 size={13} /> Clear
              </Button>
            </Row>
            <Row label="Preferences" hint="Theme, export settings, brand kit and view options" usage={inv?.localStorage} />
          </section>
        </div>
      </main>
    </div>
  );
}
