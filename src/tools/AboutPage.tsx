import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import { HomeLogo, SettingsMenu } from '../components/TopBar';
import { Button } from '../components/ui/controls';
import { clearRecents, showToast } from '../store/actions';
import { useEditor } from '../store/store';
import { formatBytes } from '../lib/utils';
import { goTools } from '../app/route';
import { CACHE_NAME } from './ai/runtime';
import { RMBG } from './bgremove/segment';
import { SR_MODELS } from './upscaler/sr';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-[21px] text-muted">{children}</div>
    </section>
  );
}

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

export default function AboutPage() {
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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1">
          <HomeLogo />
          <ChevronRight size={14} className="text-subtle" />
          <span className="px-1.5 text-sm font-semibold text-fg" aria-current="page">
            Privacy & Models
          </span>
        </nav>
        <SettingsMenu editorItems={false} />
      </header>
      <main className="scroll-thin flex-1 overflow-y-auto px-5 py-10">
        <article className="mx-auto flex w-full max-w-[680px] flex-col gap-9 animate-rise">
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-balance text-fg">Privacy & Models</h1>
            <p className="text-sm leading-[21px] text-muted">
              What CleanShot downloads, what it stores in your browser, and how the Background Remover and Image Upscaler work.
            </p>
          </div>

          <Section title="Your images stay in this tab">
            <p>
              CleanShot is a set of static files with no server behind it, so there is nowhere for an image to be sent. Editing, compression, conversion and both models
              all run in your browser using Canvas and WebAssembly. Closing the tab ends all processing.
            </p>
            <p>
              The only network requests after the page loads are model downloads, described below. Those requests fetch files; they contain none of your image data.
            </p>
          </Section>

          <Section title="Is this generative AI?">
            <p>
              No. Nothing in CleanShot creates images from a prompt, and nothing generates text. Two tools use small, task-specific neural networks; every other tool
              uses standard image processing.
            </p>
            <p>
              <span className="font-medium text-fg">Background Remover</span> uses a segmentation model. It only decides, pixel by pixel, what belongs to the subject and
              what belongs to the background. It never adds or changes pixels; it only makes the background transparent.
            </p>
            <p>
              <span className="font-medium text-fg">Image Upscaler</span> uses a super-resolution model. It rebuilds edges and fine texture from the pixels already in your
              image, so its added detail is an estimate based on your image, not new content.
            </p>
          </Section>

          <Section title="Models">
            <p>
              Both tools use open, published models. Nothing downloads until you start one of those tools and confirm, and each model then stays cached in this browser so
              it works offline afterwards.
            </p>
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
            <p>
              Models download from huggingface.co. Like any website, Hugging Face sees your IP address when it serves the file. The ONNX Runtime engine that runs them (about
              21 MB) is served by this site.
            </p>
          </Section>

          <Section title="Limitations">
            <p>
              <span className="font-medium text-fg">Background Remover</span> predicts its cut-out at 1024 px and scales it up to your image. Clear subjects (people,
              products, pets) work well. It can struggle with glass and other transparent objects, thin structures like bike spokes, and hair against a similar-colored
              background. On very large photos the edges can look soft. The Erase and Restore brushes are there for these cases.
            </p>
            <p>
              <span className="font-medium text-fg">Image Upscaler</span> reconstructs plausible detail; it doesn’t recover detail that was never captured. It can invent
              texture, sharpen noise, or reshape small text and faces, so don’t rely on an upscaled image as evidence or for identification. To keep processing under a
              few minutes, 2× works on images up to 1280 px and 4× up to 640 px; larger images are reduced first.
            </p>
            <p>Both run on your processor, not a cloud GPU, so speed depends on your device. A large image can take a minute.</p>
          </Section>

          <Section title="What’s saved in this browser">
            <ul className="flex flex-col gap-1.5 pl-4 [&>li]:list-disc">
              <li>Recent screenshot editor sessions, including the image and your edits, up to 10, in IndexedDB.</li>
              <li>Preferences such as theme, tool colors and export format, in local storage.</li>
              <li>Downloaded models, in the browser’s cache storage.</li>
            </ul>
            <p>None of this leaves your device. You can clear it here, or by clearing site data in your browser.</p>
            <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-panel p-3">
              <Button onClick={() => void clearRecents()} disabled={!recents}>
                <Trash2 size={13} /> Clear {recents || ''} recent {recents === 1 ? 'session' : 'sessions'}
              </Button>
              <Button onClick={() => void deleteModels()} disabled={!cachedModels}>
                <Trash2 size={13} /> Delete {cachedModels || ''} downloaded {cachedModels === 1 ? 'model' : 'models'}
              </Button>
              {usage !== null && <span className="ml-auto text-xs text-subtle tabular-nums">Using {formatBytes(usage)} of browser storage</span>}
            </div>
          </Section>
        </article>
      </main>
    </div>
  );
}
