import { Fragment } from 'react';
import { useEditor } from '../store/store';
import { setTool } from '../store/actions';
import { TOOL_GROUPS } from './tools';
import { Tooltip } from './ui/Tooltip';
import { Kbd } from './ui/Kbd';

export function ToolSidebar() {
  const tool = useEditor((s) => s.tool);

  return (
    <nav
      aria-label="Tools"
      className="scroll-thin z-10 flex w-[52px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line bg-panel py-2"
    >
      {TOOL_GROUPS.map((group, gi) => (
        <Fragment key={group.id}>
          {gi > 0 && <div className="my-1.5 h-px w-6 shrink-0 bg-line-strong" role="separator" />}
          <div role="group" aria-label={group.label} className="flex flex-col items-center gap-0.5">
            {group.tools.map((t) => {
              const active = tool === t.id;
              const Icon = t.icon;
              return (
                <Tooltip
                  key={t.id}
                  side="right"
                  label={
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        {t.label}
                        {t.shortcut && <Kbd>{t.shortcut}</Kbd>}
                      </span>
                      <span className="text-2xs font-normal text-subtle">{t.hint}</span>
                    </span>
                  }
                >
                  <button
                    type="button"
                    aria-label={t.label}
                    aria-pressed={active}
                    data-tool={t.id}
                    onClick={() => setTool(t.id)}
                    className={`group relative flex h-[34px] w-[34px] items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-150 active:scale-[0.92] ${
                      active ? 'bg-accent-fill text-white shadow-soft' : 'text-muted hover:bg-hover hover:text-fg'
                    }`}
                  >
                    <Icon size={17} strokeWidth={1.85} />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </Fragment>
      ))}
    </nav>
  );
}
