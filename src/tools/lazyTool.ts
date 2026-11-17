import { lazy, type ComponentType } from 'react';

/**
 * A lazily loaded tool component plus a `load` function that starts fetching
 * its chunk early (hover, focus). Both share one promise, so prefetching and
 * rendering never download twice.
 */
export function lazyTool(factory: () => Promise<{ default: ComponentType }>) {
  let p: Promise<{ default: ComponentType }> | null = null;
  const load = () => {
    p ??= factory().catch((err) => {
      p = null;
      throw err;
    });
    return p;
  };
  return { component: lazy(load), load: () => load().catch(() => undefined) };
}
