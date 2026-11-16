import { LayoutTemplate, SquarePen } from 'lucide-react';
import { goCanvas, goEditor, useRoute } from '../app/route';
import { Tooltip } from './ui/Tooltip';

/**
 * Switch between Studio's two workspaces. Each keeps its own work in memory,
 * so moving back and forth never loses anything.
 */
export function StudioSwitch() {
  const route = useRoute();
  const items = [
    { id: 'editor', label: 'Create', hint: 'Edit an image or screenshot', icon: SquarePen, go: goEditor },
    { id: 'canvas', label: 'Canvas', hint: 'Design from scratch', icon: LayoutTemplate, go: goCanvas },
  ] as const;
  return (
    <div role="tablist" aria-label="Studio workspace" className="flex h-7 items-center gap-0.5 rounded-[8px] bg-control p-0.5">
      {items.map((it) => {
        const active = route.section === it.id;
        return (
          <Tooltip key={it.id} label={it.hint}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={it.go}
              data-testid={`switch-${it.id}`}
              className={`flex h-6 items-center gap-1.5 rounded-[6px] px-2 text-xs font-medium transition-colors ${
                active ? 'bg-elevated text-fg shadow-[0_1px_2px_rgba(0,0,0,0.25),0_0_0_0.5px_var(--border-strong)]' : 'text-muted hover:text-fg'
              }`}
            >
              <it.icon size={13} />
              <span className="max-sm:hidden">{it.label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
