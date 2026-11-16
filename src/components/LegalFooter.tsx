/**
 * Site footer with the legal links. Shown on the start screen, section
 * landing pages, Privacy & Models, and the legal pages. Workspaces (the editor
 * canvas and individual tools) reach the same links from the Settings menu
 * instead, so the footer never takes space from the canvas.
 */
const LINKS = [
  { href: '#terms', label: 'Terms of Service' },
  { href: '#privacy-policy', label: 'Privacy Policy' },
  { href: '#acceptable-use', label: 'Acceptable Use' },
  { href: '#privacy', label: 'Privacy & Models' },
];

export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-line pt-5 pb-[max(4px,env(safe-area-inset-bottom))] ${className}`}>
      <div className="flex flex-col items-center gap-2.5 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-xs text-subtle">CleanShot processes your files in your browser.</p>
        <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          <span className="text-2xs font-semibold tracking-[0.04em] text-subtle uppercase">Legal</span>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-xs text-muted hover:text-fg hover:underline">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
