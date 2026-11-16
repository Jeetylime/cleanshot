import { ArrowRight, ImagePlus, Sparkles } from 'lucide-react';
import { useEditor, shallowEqual } from '../store/store';
import * as actions from '../store/actions';
import { goAbout, goEditor, goTools } from '../app/route';
import { TOOLS } from '../tools/registry';
import { Logo, SettingsMenu } from './TopBar';
import { Illustration } from './EmptyState';
import { Kbd } from './ui/Kbd';
import { modKey, timeAgo } from '../lib/utils';
import { openFilePicker } from '../lib/filePicker';

/** Minimal entry point: the screenshot editor or the image tools. */
export function StartScreen() {
  const { docName, recents } = useEditor((s) => ({ docName: s.doc?.name ?? null, recents: s.recents }), shallowEqual);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-line bg-panel px-2.5">
        <Logo />
        <SettingsMenu editorItems={false} />
      </header>

      <main className="scroll-thin flex flex-1 justify-center overflow-y-auto px-5 py-10 sm:items-center">
        <div className="flex w-full max-w-[880px] flex-col gap-8 animate-rise">
          <div className="text-center">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-balance text-fg">What are you working on?</h1>
            <p className="mt-1.5 text-sm text-muted">Polish a screenshot, or reach for a quick image utility.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Screenshot editor */}
            <section className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-pop">
              <button
                type="button"
                onClick={goEditor}
                className="flex flex-col text-left"
                data-testid="open-editor"
                aria-label="Open Screenshot Editor"
              >
                <div className="flex h-[176px] items-center justify-center bg-window px-8 pt-6 pb-4">
                  <div className="w-full max-w-[280px] transition-transform duration-300 group-hover:scale-[1.02]">
                    <Illustration />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-fg">Screenshot Editor</h2>
                    <ArrowRight size={16} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                  <p className="text-sm text-muted">Annotate, blur and redact, add backgrounds and export polished screenshots.</p>
                </div>
              </button>
              <div className="mt-auto flex flex-wrap items-center gap-2 px-5 pt-4 pb-5">
                {docName ? (
                  <button
                    type="button"
                    onClick={goEditor}
                    className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-xs font-semibold text-white shadow-soft hover:bg-accent-hover"
                  >
                    <span className="truncate">Continue “{docName}”</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      goEditor();
                      openFilePicker();
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-xs font-semibold text-white shadow-soft hover:bg-accent-hover"
                  >
                    <ImagePlus size={14} strokeWidth={2.2} />
                    Open screenshot
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    goEditor();
                    actions.openSample();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium text-muted hover:bg-hover hover:text-fg"
                >
                  <Sparkles size={13} />
                  Try a sample
                </button>
                <span className="ml-auto hidden items-center gap-1 text-xs text-subtle sm:flex">
                  or paste <Kbd>{modKey}</Kbd>
                  <Kbd>V</Kbd>
                </span>
              </div>
            </section>

            {/* Image tools */}
            <section className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-pop">
              <button
                type="button"
                onClick={() => goTools()}
                className="flex flex-col text-left"
                data-testid="open-tools"
                aria-label="Open Image Tools"
              >
                <div className="flex h-[176px] items-center justify-center bg-window px-8">
                  <div className="grid grid-cols-4 gap-2.5 transition-transform duration-300 group-hover:scale-[1.02]">
                    {TOOLS.map((t) => (
                      <span
                        key={t.key}
                        className={`relative flex h-[46px] w-[46px] items-center justify-center rounded-[12px] border border-line bg-panel shadow-soft ${
                          t.ai ? 'text-accent' : 'text-muted'
                        }`}
                      >
                        <t.icon size={19} strokeWidth={1.8} />
                        {t.ai && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-window" />}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-fg">Image Tools</h2>
                    <ArrowRight size={16} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                  <p className="text-sm text-muted">Remove backgrounds, upscale, compress, convert, resize and inspect any image.</p>
                </div>
              </button>
              <div className="mt-auto flex flex-wrap gap-1.5 px-5 pt-4 pb-5">
                {TOOLS.filter((t) => ['background-remover', 'compressor', 'converter', 'resizer'].includes(t.key)).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => goTools(t.key)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-control px-2.5 text-xs font-medium text-muted transition-colors hover:bg-active hover:text-fg"
                  >
                    <t.icon size={13} />
                    {t.name.replace('Image ', '')}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {recents.length > 0 && (
            <section aria-label="Recent screenshots" className="flex flex-col gap-2">
              <h3 className="px-0.5 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">Recent screenshots</h3>
              <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
                {recents.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      goEditor();
                      void actions.openSession(r.id);
                    }}
                    className="flex w-[210px] shrink-0 items-center gap-2.5 rounded-[10px] border border-line bg-panel p-1.5 pr-3 text-left transition-colors hover:border-line-strong hover:bg-hover"
                  >
                    <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-window">
                      {r.thumbUrl && <img src={r.thumbUrl} alt="" className="max-h-full max-w-full object-contain" draggable={false} />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-medium text-fg">{r.name}</span>
                      <span className="text-2xs text-subtle">{timeAgo(r.updatedAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <p className="text-center">
            <button type="button" onClick={goAbout} className="text-xs text-subtle hover:text-fg hover:underline">
              Privacy & AI
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
