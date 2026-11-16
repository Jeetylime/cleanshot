import { ArrowRight, ChevronRight, ImagePlus, LayoutTemplate, Sparkles, SquarePen } from 'lucide-react';
import { openSample } from '../store/actions';
import { HomeLogo, SettingsMenu } from '../components/TopBar';
import { Illustration } from '../components/EmptyState';
import { Kbd } from '../components/ui/Kbd';
import { goCanvas, goEditor } from '../app/route';
import { openFilePicker } from '../lib/filePicker';
import { modKey } from '../lib/utils';
import { TemplateThumb } from './LeftPanel';

/** Studio entry: pick Create (edit an image) or Canvas (design from scratch). */
export default function StudioHub() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1">
          <HomeLogo />
          <ChevronRight size={14} className="text-subtle" />
          <span className="px-1.5 text-sm font-semibold text-fg" aria-current="page">
            Studio
          </span>
        </nav>
        <SettingsMenu editorItems={false} />
      </header>
      <main className="scroll-thin flex flex-1 justify-center overflow-y-auto px-5 py-10 sm:items-center">
        <div className="flex w-full max-w-[880px] flex-col gap-7 animate-rise">
          <div className="text-center">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-balance text-fg">What would you like to make?</h1>
            <p className="mt-1.5 text-sm text-muted">Everything stays on your device. No account needed.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-pop">
              <button type="button" onClick={goEditor} className="flex flex-col text-left" data-testid="hub-create" aria-label="Open Create">
                <div className="flex h-[176px] items-center justify-center bg-window px-8 pt-6 pb-4">
                  <div className="w-full max-w-[280px] transition-transform duration-300 group-hover:scale-[1.02]">
                    <Illustration />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                      <SquarePen size={15} className="text-accent" /> Create
                    </h2>
                    <ArrowRight size={16} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                  <p className="text-sm text-muted">Start from an image or screenshot. Annotate, blur and redact, add a background and export.</p>
                </div>
              </button>
              <div className="mt-auto flex flex-wrap items-center gap-2 px-5 pt-4 pb-5">
                <button
                  type="button"
                  onClick={() => {
                    goEditor();
                    openFilePicker();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-xs font-semibold text-white shadow-soft hover:bg-accent-hover"
                >
                  <ImagePlus size={14} /> Upload image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    goEditor();
                    openSample();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium text-muted hover:bg-hover hover:text-fg"
                >
                  <Sparkles size={13} /> Try a sample
                </button>
                <span className="ml-auto hidden items-center gap-1 text-xs text-subtle sm:flex">
                  or paste <Kbd>{modKey}</Kbd>
                  <Kbd>V</Kbd>
                </span>
              </div>
            </section>
            <section className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-pop">
              <button type="button" onClick={goCanvas} className="flex flex-col text-left" data-testid="hub-canvas" aria-label="Open Canvas">
                <div className="flex h-[176px] items-center justify-center gap-3 bg-window px-8">
                  {['quote', 'youtube', 'event'].map((id, i) => (
                    <div key={id} className={`w-[84px] transition-transform duration-300 group-hover:scale-[1.03] ${i === 1 ? 'w-[110px]' : ''}`}>
                      <TemplateThumb id={id} />
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                      <LayoutTemplate size={15} className="text-accent" /> Canvas
                    </h2>
                    <ArrowRight size={16} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                  <p className="text-sm text-muted">Design from scratch or a template: posts, thumbnails, banners and slides.</p>
                </div>
              </button>
              <div className="mt-auto flex flex-wrap items-center gap-2 px-5 pt-4 pb-5">
                <button type="button" onClick={goCanvas} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-control px-3 text-xs font-semibold text-fg hover:bg-active">
                  New design
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
