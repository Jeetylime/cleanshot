import { useEffect, type ReactNode } from 'react';
import { ChevronRight, LayoutTemplate, Lock, SquarePen } from 'lucide-react';
import { HomeLogo, SettingsMenu } from './TopBar';
import { goCanvas, goEditor } from '../app/route';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-[22px] text-muted">{children}</div>
    </section>
  );
}

/** The story behind the name, and what the site stands for. */
export default function AboutPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'About · Studiolo';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2.5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1">
          <HomeLogo />
          <ChevronRight size={14} className="text-subtle" />
          <span className="px-1.5 text-sm font-semibold text-fg" aria-current="page">
            About
          </span>
        </nav>
        <SettingsMenu editorItems={false} />
      </header>
      <main className="scroll-thin flex-1 overflow-y-auto px-5 py-10">
        <article className="mx-auto flex w-full max-w-[640px] flex-col gap-9 animate-rise">
          <div className="flex flex-col gap-3">
            <p className="text-2xs font-semibold tracking-[0.08em] text-accent uppercase">About the name</p>
            <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance text-fg">
              Studiolo <span className="font-normal text-subtle">/ stoo-dee-OH-loh /</span>
            </h1>
            <p className="text-[15px] leading-[24px] text-muted">
              Italian for “little study”: a small private room where Renaissance collectors and scholars kept their books, art and instruments, and did their
              thinking and making away from everyone else.
            </p>
          </div>

          <Section title="The original studioli">
            <p>
              In 15th- and 16th-century Italy, the most cultured rulers built themselves a studiolo. They were usually tiny, often just big enough for one person, and
              richly made. The room was a retreat: a place to read, collect, study and create in private.
            </p>
            <p>
              The most famous belonged to Federico da Montefeltro, Duke of Urbino. His studiolo in the ducal palace is lined floor to ceiling with intarsia, wood inlay
              so precise it fools the eye: cupboard doors that seem half open, shelves of books and instruments, a view through an arcade. All of it is flat panels of
              wood. A second studiolo he commissioned, for his palace in Gubbio, is now displayed at the Metropolitan Museum of Art in New York. Isabella d’Este, one
              of the great patrons of her age, filled hers in Mantua with paintings she commissioned from the leading artists of the day.
            </p>
          </Section>

          <Section title="Why we chose it">
            <p>
              Studiolo is built on the same idea: a small, well-made room of your own for creative work. Everything you open here is processed on your own device,
              in your browser. Your images, designs and documents aren’t uploaded, and there’s no account to sign up for. The door, so to speak, stays closed.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { icon: Lock, title: 'Private', text: 'Files stay on your device.' },
                { icon: SquarePen, title: 'Made by hand', text: 'Tools that help you work, not generate for you.' },
                { icon: LayoutTemplate, title: 'Small and complete', text: 'Edit, design, image and PDF tools in one place.' },
              ].map((c) => (
                <div key={c.title} className="flex flex-col gap-1.5 rounded-[12px] border border-line bg-panel p-3">
                  <c.icon size={16} className="text-accent" />
                  <span className="text-[13px] font-semibold text-fg">{c.title}</span>
                  <span className="text-xs leading-[17px] text-muted">{c.text}</span>
                </div>
              ))}
            </div>
          </Section>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={goCanvas} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-accent-fill px-3 text-xs font-semibold text-white shadow-soft hover:bg-accent-hover">
              <LayoutTemplate size={14} /> Start a design
            </button>
            <button type="button" onClick={goEditor} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-control px-3 text-xs font-semibold text-fg hover:bg-active">
              <SquarePen size={14} /> Edit an image
            </button>
          </div>
        </article>
      </main>
    </div>
  );
}
