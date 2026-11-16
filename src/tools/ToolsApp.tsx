import { Component, Suspense, type ReactNode } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import type { ToolKey } from '../app/route';
import { goTools } from '../app/route';
import { HomeLogo, SettingsMenu } from '../components/TopBar';
import { TOOLS, TOOL_GROUPS, toolMeta, type ToolMeta } from './registry';
import { AiBadge, Spinner } from './shared/ui';
import { ToolPreview } from './ToolPreview';

export default function ToolsApp({ tool }: { tool: ToolKey | null }) {
  const meta = tool ? toolMeta(tool) : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="relative z-20 flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          <HomeLogo hideWordmarkOnMobile={!!meta} />
          <ChevronRight size={14} className="shrink-0 text-subtle" />
          <button
            type="button"
            onClick={() => goTools()}
            className={`shrink-0 rounded-[6px] px-1.5 py-1 text-sm transition-colors hover:bg-hover ${meta ? 'text-muted hover:text-fg' : 'font-semibold text-fg'}`}
            aria-current={meta ? undefined : 'page'}
          >
            Image Tools
          </button>
          {meta && (
            <>
              <ChevronRight size={14} className="shrink-0 text-subtle" />
              <span className="flex min-w-0 items-center gap-1.5 px-1 text-sm font-semibold text-fg" aria-current="page">
                <meta.icon size={14} className="shrink-0 text-muted" />
                <span className="truncate">{meta.name}</span>
                {meta.ai && <AiBadge />}
              </span>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {meta && <span className="hidden text-xs text-subtle xl:inline">{meta.tagline}</span>}
          <SettingsMenu editorItems={false} />
        </div>
      </header>
      {meta ? (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted">
              <Spinner /> Loading {meta.name}…
            </div>
          }
        >
          <ToolErrorBoundary key={meta.key} name={meta.name}>
            <meta.component />
          </ToolErrorBoundary>
        </Suspense>
      ) : (
        <ToolsLanding />
      )}
    </div>
  );
}

function ToolCard({ t }: { t: ToolMeta }) {
  return (
    <button
      type="button"
      onClick={() => goTools(t.key)}
      data-testid={`tool-card-${t.key}`}
      className="group flex items-start gap-3 rounded-[12px] border border-line bg-panel p-3 text-left transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-pop active:translate-y-0"
    >
      <ToolPreview tool={t.key} />
      <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <span className="flex items-center gap-1.5">
          <t.icon size={14} className={t.ai ? 'text-accent' : 'text-muted'} />
          <span className="truncate text-[13px] font-semibold text-fg">{t.name}</span>
          {t.ai && <AiBadge className="ml-auto" />}
        </span>
        <span className="text-xs leading-[16px] text-muted">{t.description}</span>
        {t.batch && <span className="text-2xs text-subtle">Batch supported</span>}
      </span>
    </button>
  );
}

function ToolsLanding() {
  return (
    <main className="scroll-thin flex-1 overflow-y-auto px-5 py-8">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-7 animate-rise">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">Image Tools</h1>
            <p className="mt-1 text-sm text-muted">Focused utilities for everyday image work.</p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-subtle">
            <Lock size={11} />
            Processed on your device. AI models download once, on first use.
          </p>
        </div>
        {TOOL_GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`group-${g.id}`} className="flex flex-col gap-2.5">
            <h2 id={`group-${g.id}`} className="px-0.5 text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">
              {g.label}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {TOOLS.filter((t) => t.group === g.id).map((t) => (
                <ToolCard key={t.key} t={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

/** Keeps a failing tool from taking down the whole app. */
class ToolErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-fg">{this.props.name} ran into a problem</p>
          <p className="text-sm text-muted">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="h-8 rounded-[8px] bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-hover"
          >
            Reload tool
          </button>
        </div>
      </div>
    );
  }
}
