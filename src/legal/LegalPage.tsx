import { useEffect, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { HomeLogo, SettingsMenu } from '../components/TopBar';
import type { LegalDoc } from '../app/route';
import { LEGAL, LEGAL_COMPLETE } from './config';
import { TermsOfService } from './TermsOfService';
import { PrivacyPolicy } from './PrivacyPolicy';
import { AcceptableUse } from './AcceptableUse';

// ---------------------------------------------------------------------------
// Page shell

const DOCS: Record<LegalDoc, { title: string; summary: string; body: () => ReactNode }> = {
  terms: {
    title: 'Terms of Service',
    summary: 'The rules for using Studiolo, what you can expect from it, and the limits of our responsibility.',
    body: TermsOfService,
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    summary: 'What information is involved when you use Studiolo, where it goes, and the choices you have.',
    body: PrivacyPolicy,
  },
  'acceptable-use': {
    title: 'Acceptable Use Policy',
    summary: 'What you may not use Studiolo for, and what can happen if you do.',
    body: AcceptableUse,
  },
};

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  const meta = DOCS[doc];
  const Body = meta.body;

  useEffect(() => {
    const prev = document.title;
    document.title = `${meta.title} · Studiolo`;
    document.getElementById('legal-scroll')?.scrollTo(0, 0);
    return () => {
      document.title = prev;
    };
  }, [meta.title]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          <HomeLogo />
          <ChevronRight size={14} className="shrink-0 text-subtle" />
          <span className="truncate px-1.5 text-sm font-semibold text-fg" aria-current="page">
            {meta.title}
          </span>
        </nav>
        <SettingsMenu editorItems={false} />
      </header>
      <main id="legal-scroll" className="scroll-thin flex-1 overflow-y-auto px-5 py-10">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-10 animate-rise">
          <article className="flex flex-col gap-9">
            <div className="flex flex-col gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-balance text-fg">{meta.title}</h1>
              <p className="text-sm leading-[21px] text-muted">{meta.summary}</p>
              <p className="text-xs text-subtle">
                Last updated <time dateTime={LEGAL.lastUpdated}>{formatDate(LEGAL.lastUpdated)}</time>
              </p>
              {!LEGAL_COMPLETE && (
                <p className="mt-1 rounded-[10px] border border-line bg-panel px-3 py-2 text-xs leading-[17px] text-muted">
                  This policy is a draft. Highlighted details, such as contact information, are still being finalized.
                </p>
              )}
            </div>

            <nav aria-label="Other policies" className="flex flex-wrap gap-1.5">
              {(Object.keys(DOCS) as LegalDoc[]).map((k) => (
                <a
                  key={k}
                  href={`#${k}`}
                  aria-current={k === doc ? 'page' : undefined}
                  className={`inline-flex h-7 items-center rounded-[7px] px-2.5 text-xs font-medium transition-colors ${
                    k === doc ? 'bg-accent-soft text-fg ring-1 ring-accent' : 'bg-control text-muted hover:bg-active hover:text-fg'
                  }`}
                >
                  {DOCS[k].title}
                </a>
              ))}
            </nav>

            <Body />

            <p className="text-sm">
              <a href="#home" className="text-accent hover:underline">
                ← Back to Studiolo
              </a>
            </p>
          </article>
        </div>
      </main>
    </div>
  );
}
