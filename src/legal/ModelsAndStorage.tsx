import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../components/ui/controls';
import { clearRecents, showToast } from '../store/actions';
import { useEditor } from '../store/store';
import { formatBytes } from '../lib/utils';
import { goTools } from '../app/route';
import { CACHE_NAME } from '../tools/ai/runtime';
import { RMBG } from '../tools/bgremove/segment';
import { SR_MODELS } from '../tools/upscaler/sr';

/** Interactive pieces of the Privacy Policy: the model table and the storage controls. */

const MODELS = [
  {
    tool: 'Background Remover',
    key: 'background-remover' as const,
    model: 'RMBG-1.4 by BRIA AI',
    repo: RMBG.id,
    size: RMBG.bytes,
    license: 'BRIA RMBG-1.4 license. Free for non-commercial use; commercial use needs an agreement with BRIA.',
  },
  {
    tool: 'Image Upscaler (2×)',
    key: 'upscaler' as const,
    model: 'Swin2SR lightweight ×2',
    repo: SR_MODELS[2].id,
    size: SR_MODELS[2].bytes,
    license: 'Apache 2.0',
  },
  {
    tool: 'Image Upscaler (4×)',
    key: 'upscaler' as const,
    model: 'Swin2SR real-world ×4',
    repo: SR_MODELS[4].id,
    size: SR_MODELS[4].bytes,
    license: 'Apache 2.0',
  },
];

export function ModelsTable() {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="bg-panel text-subtle">
          <tr>
            <th className="px-3 py-2 font-medium">Tool</th>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 text-right font-medium">Size</th>
            <th className="px-3 py-2 font-medium">License</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {MODELS.map((m) => (
            <tr key={m.repo} className="align-top">
              <td className="px-3 py-2.5">
                <button type="button" onClick={() => goTools(m.key)} className="text-left text-fg hover:text-accent">
                  {m.tool}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <a href={`https://huggingface.co/${m.repo}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {m.model}
                </a>
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatBytes(m.size)}</td>
              <td className="px-3 py-2.5">{m.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StorageControls() {
  const recents = useEditor((s) => s.recents.length);
  const [cachedModels, setCachedModels] = useState<number | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      setCachedModels((await cache.keys()).filter((r) => r.url.endsWith('.onnx')).length);
    } catch {
      setCachedModels(0);
    }
    try {
      setUsage((await navigator.storage?.estimate?.())?.usage ?? null);
    } catch {
      setUsage(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const deleteModels = async () => {
    try {
      await caches.delete(CACHE_NAME);
      showToast('Downloaded models deleted');
    } catch {
      showToast('Couldn’t delete the models in this browser.', 'error');
    }
    void refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-panel p-3">
      <Button onClick={() => void clearRecents()} disabled={!recents}>
        <Trash2 size={13} /> Clear {recents || ''} recent {recents === 1 ? 'session' : 'sessions'}
      </Button>
      <Button onClick={() => void deleteModels()} disabled={!cachedModels}>
        <Trash2 size={13} /> Delete {cachedModels || ''} downloaded {cachedModels === 1 ? 'model' : 'models'}
      </Button>
      {usage !== null && <span className="ml-auto text-xs text-subtle tabular-nums">Using {formatBytes(usage)} of browser storage</span>}
    </div>
  );
}
