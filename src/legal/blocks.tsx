import type { ReactNode } from 'react';
import type { LegalDoc } from '../app/route';
import { LEGAL } from './config';

// ---------------------------------------------------------------------------
// Building blocks shared by the three policies

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="text-[length:calc(15px*var(--text-scale))] font-semibold text-fg">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-[22px] text-muted">{children}</div>
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-1.5 pl-4 [&>li]:list-disc [&>li]:marker:text-subtle">{children}</ul>;
}

export function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-fg">{children}</span>;
}

/** Visible stand-in for information that hasn't been provided yet. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded-[4px] bg-accent-soft px-1 py-px font-mono text-[length:calc(12px*var(--text-scale))] text-fg" title="To be filled in by the site operator">
      [{children}]
    </mark>
  );
}

export function DocLink({ doc, children }: { doc: LegalDoc; children: ReactNode }) {
  return (
    <a href={`#${doc}`} className="text-accent hover:underline">
      {children}
    </a>
  );
}


export const ContactEmail = () =>
  LEGAL.contactEmail ? (
    <a href={`mailto:${LEGAL.contactEmail}`} className="text-accent hover:underline">
      {LEGAL.contactEmail}
    </a>
  ) : (
    <Placeholder>CONTACT EMAIL</Placeholder>
  );

export const GoverningLaw = () => (LEGAL.governingLaw ? <>{LEGAL.governingLaw}</> : <Placeholder>GOVERNING JURISDICTION</Placeholder>);

export const MinimumAge = () => (LEGAL.minimumAge !== null ? <>{LEGAL.minimumAge}</> : <Placeholder>MINIMUM AGE</Placeholder>);

export function ContactBlock() {
  return (
    <div className="flex flex-col gap-0.5 rounded-[12px] border border-line bg-panel px-4 py-3 text-sm text-muted">
      <span className="font-medium text-fg">Studiolo</span>
      <span>
        Email: <ContactEmail />
      </span>
    </div>
  );
}

