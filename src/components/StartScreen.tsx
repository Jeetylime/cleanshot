import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ImagePlus, LayoutTemplate } from 'lucide-react';
import { useEditor, shallowEqual } from '../store/store';
import * as actions from '../store/actions';
import { goCanvas, goEditor, goPdf, goTools, type PdfToolKey } from '../app/route';
import { getRecentTools } from '../app/recentTools';
import type { ProjectSummary } from '../studio/persistence';
import { PDF_TOOLS } from '../pdf/registry';
import { TOOLS } from '../tools/registry';
import { HomeLogo, SettingsMenu } from './TopBar';
import { Illustration } from './EmptyState';
import { Kbd } from './ui/Kbd';
import { modKey, timeAgo } from '../lib/utils';
import { openFilePicker } from '../lib/filePicker';

const CanvasPreview = lazy(() => import('../studio/CanvasPreview'));

/** Minimal entry point: Edit, Canvas, Image Tools or PDF Tools. */
export function StartScreen() {
  const { docName } = useEditor((s) => ({ docName: s.doc?.name ?? null }), shallowEqual);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-line bg-panel px-2.5">
        <HomeLogo />
        <SettingsMenu editorItems={false} />
      </header>

      <main className="scroll-thin flex flex-1 justify-center overflow-y-auto px-5 py-10 sm:items-center">
        <div className="flex w-full max-w-[1180px] flex-col gap-8 animate-rise">
          <div className="text-center">
            <h1 className="text-[length:calc(22px*var(--text-scale))] font-semibold tracking-[-0.02em] text-balance text-fg">What are you working on?</h1>
            <p className="mt-1.5 text-sm text-muted">Edit an image, design something new, or reach for a quick image or PDF utility.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Edit */}
            <section className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-pop">
              <button
                type="button"
                onClick={goEditor}
                className="flex flex-col text-left"
                data-testid="open-editor"
              >
                <div className="flex h-[176px] items-center justify-center bg-window px-8 pt-6 pb-4">
                  <div className="w-full max-w-[280px] transition-transform duration-300 group-hover:scale-[1.02]">
                    <Illustration />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[length:calc(15px*var(--text-scale))] font-semibold text-fg">Edit</h2>
                    <ArrowRight size={16} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                  <p className="text-sm text-muted">Annotate, blur and redact a screenshot or photo, frame it on a background and export.</p>
                </div>
              </button>
              <div className="mt-auto flex flex-wrap items-center gap-2 px-5 pt-4 pb-5">
                {docName ? (
                  <button
                    type="button"
                    onClick={goEditor}
                    className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-[8px] bg-accent-fill px-3 text-xs font-semibold text-white shadow-soft hover:bg-accent-hover"
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
                    className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-accent-fill px-3 text-xs font-semibold text-white shadow-soft hover:bg-accent-hover"
                  >
                    <ImagePlus size={14} strokeWidth={2.2} />
                    Open image
                  </button>
                )}
                <span className="ml-auto hidden items-center gap-1 text-xs text-subtle sm:flex">
                  or paste <Kbd>{modKey}</Kbd>
                  <Kbd>V</Kbd>
                </span>
              </div>
            </section>

            {/* Canvas */}
            <section className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-pop">
              <button type="button" onClick={goCanvas} className="flex flex-col text-left" data-testid="open-canvas">
                <div className="flex h-[176px] items-center justify-center bg-window px-6 transition-transform duration-300 group-hover:scale-[1.02]">
                  <Suspense fallback={null}>
                    <CanvasPreview />
                  </Suspense>
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[length:calc(15px*var(--text-scale))] font-semibold text-fg">Canvas</h2>
                    <ArrowRight size={16} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                  <p className="text-sm text-muted">Design posts, thumbnails, banners and slides from scratch or a template.</p>
                </div>
              </button>
              <div className="mt-auto flex flex-wrap items-center gap-2 px-5 pt-4 pb-5">
                <button
                  type="button"
                  onClick={goCanvas}
                  data-testid="start-canvas"
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-accent-fill px-3 text-xs font-semibold text-white shadow-soft hover:bg-accent-hover"
                >
                  <LayoutTemplate size={14} />
                  New design
                </button>
              </div>
            </section>

            {/* Image tools */}
            <section className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-pop">
              <button
                type="button"
                onClick={() => goTools()}
                className="flex flex-col text-left"
                data-testid="open-tools"
              >
                <div className="flex h-[176px] items-center justify-center bg-window px-8">
                  <div className="grid grid-cols-4 gap-2.5 transition-transform duration-300 group-hover:scale-[1.02]">
                    {TOOLS.map((t) => (
                      <span
                        key={t.key}
                        className={`relative flex h-[46px] w-[46px] items-center justify-center rounded-[12px] border border-line bg-panel shadow-soft ${
                          'text-muted'
                        }`}
                      >
                        <t.icon size={19} strokeWidth={1.8} />
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[length:calc(15px*var(--text-scale))] font-semibold text-fg">Image Tools</h2>
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
                    onPointerEnter={() => void t.load()}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-control px-2.5 text-xs font-medium text-muted transition-colors hover:bg-active hover:text-fg"
                  >
                    <t.icon size={13} />
                    {t.name.replace('Image ', '')}
                  </button>
                ))}
              </div>
            </section>

            {/* PDF tools */}
            <section className="group flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-pop">
              <button type="button" onClick={() => goPdf()} className="flex flex-col text-left" data-testid="open-pdf">
                <div className="flex h-[176px] items-center justify-center bg-window px-8">
                  <div className="grid grid-cols-4 gap-2.5 transition-transform duration-300 group-hover:scale-[1.02]">
                    {PDF_TOOLS.map((t) => (
                      <span key={t.key} className="relative flex h-[46px] w-[46px] items-center justify-center rounded-[12px] border border-line bg-panel text-muted shadow-soft">
                        <t.icon size={19} strokeWidth={1.8} />
                      </span>
                    ))}
                    <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px] border border-dashed border-line text-[length:calc(10px*var(--text-scale))] font-bold tracking-wide text-subtle">
                      PDF
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[length:calc(15px*var(--text-scale))] font-semibold text-fg">PDF Tools</h2>
                    <ArrowRight size={16} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                  </div>
                  <p className="text-sm text-muted">Merge, split, organize, sign, compress and convert PDFs without uploading them.</p>
                </div>
              </button>
              <div className="mt-auto flex flex-wrap gap-1.5 px-5 pt-4 pb-5">
                {PDF_TOOLS.filter((t) => ['pdf-merge', 'pdf-split', 'pdf-sign', 'pdf-compress'].includes(t.key)).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => goPdf(t.key as PdfToolKey)}
                    onPointerEnter={() => void t.load?.()}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-control px-2.5 text-xs font-medium text-muted transition-colors hover:bg-active hover:text-fg"
                  >
                    <t.icon size={13} />
                    {t.name.replace(/ PDFs?$/, '').replace('PDF ', '')}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <ContinueRow />

          <p className="text-center text-xs text-subtle">
            Why “Studiolo”?{' '}
            <a href="#about" className="text-muted hover:text-fg hover:underline">
              The story behind the name
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pick up where you left off: the latest item from each section, in the same
// columns as the cards above.

function ContinueCard({ label, onClick, thumb, title, meta }: { label: string; onClick: () => void; thumb: ReactNode; title: string; meta: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-[12px] border border-line bg-panel p-2 pr-3 text-left transition-colors hover:border-line-strong hover:bg-hover"
    >
      <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-window text-muted">{thumb}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-2xs font-medium text-subtle">{label}</span>
        <span className="truncate text-xs font-semibold text-fg">{title}</span>
        <span className="truncate text-2xs text-subtle">{meta}</span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
    </button>
  );
}

function Empty({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-[12px] border border-dashed border-line px-3 py-2.5">
      <span className="text-2xs font-medium text-subtle">{label}</span>
      <span className="text-xs text-subtle">{text}</span>
    </div>
  );
}

function useLatestDesign(): ProjectSummary | null | undefined {
  const [design, setDesign] = useState<ProjectSummary | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    import('../studio/persistence')
      .then((db) => db.listProjects())
      .then((list) => !cancelled && setDesign(list[0] ?? null))
      .catch(() => !cancelled && setDesign(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return design;
}

function useBlobUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function ContinueRow() {
  const recents = useEditor((s) => s.recents);
  const design = useLatestDesign();
  const designThumb = useBlobUrl(design?.thumb);
  const [recentTools] = useState(getRecentTools);
  const tool = recentTools.tools && TOOLS.find((t) => t.key === recentTools.tools!.key);
  const pdfTool = recentTools.pdf && PDF_TOOLS.find((t) => t.key === recentTools.pdf!.key);
  const edit = recents[0];

  // Wait for the design lookup so the row doesn't appear and then reflow.
  if (design === undefined) return null;
  if (!edit && !design && !tool && !pdfTool) return null;

  const img = (src: string | null) => (src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" draggable={false} /> : null);

  return (
    <section aria-labelledby="continue-heading" className="flex flex-col gap-2.5">
      <h2 id="continue-heading" className="px-0.5 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">
        Pick up where you left off
      </h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {edit ? (
          <ContinueCard
            label={recents.length > 1 ? `Latest edit · ${recents.length} recent` : 'Latest edit'}
            title={edit.name}
            meta={timeAgo(edit.updatedAt)}
            thumb={img(edit.thumbUrl)}
            onClick={() => {
              goEditor();
              void actions.openSession(edit.id);
            }}
          />
        ) : (
          <Empty label="Latest edit" text="Images you edit will appear here." />
        )}
        {design ? (
          <ContinueCard
            label="Latest design"
            title={design.name || 'Untitled design'}
            meta={`${design.width} × ${design.height} · ${timeAgo(design.updatedAt)}`}
            thumb={img(designThumb)}
            onClick={() => {
              goCanvas();
              void import('../studio/actions').then((A) => A.openProject(design.id));
            }}
          />
        ) : (
          <Empty label="Latest design" text="Designs you make will appear here." />
        )}
        {tool ? (
          <ContinueCard label="Last image tool" title={tool.name} meta={timeAgo(recentTools.tools!.at)} thumb={<tool.icon size={18} />} onClick={() => goTools(tool.key)} />
        ) : (
          <Empty label="Last image tool" text="The image tool you use last will appear here." />
        )}
        {pdfTool ? (
          <ContinueCard label="Last PDF tool" title={pdfTool.name} meta={timeAgo(recentTools.pdf!.at)} thumb={<pdfTool.icon size={18} />} onClick={() => goPdf(pdfTool.key as PdfToolKey)} />
        ) : (
          <Empty label="Last PDF tool" text="The PDF tool you use last will appear here." />
        )}
      </div>
    </section>
  );
}
