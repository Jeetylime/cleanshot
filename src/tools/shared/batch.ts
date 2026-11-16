/**
 * Run `worker` over `items` with limited concurrency. Errors are reported
 * per item instead of aborting the whole batch.
 */
export async function runBatch<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  opts: {
    concurrency?: number;
    onStart?: (index: number) => void;
    onDone?: (index: number, result: R) => void;
    onError?: (index: number, error: unknown) => void;
    signal?: { cancelled: boolean };
  } = {},
): Promise<void> {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      if (opts.signal?.cancelled) return;
      const i = next++;
      opts.onStart?.(i);
      try {
        const r = await worker(items[i], i);
        opts.onDone?.(i, r);
      } catch (err) {
        opts.onError?.(i, err);
      }
      // Yield so the UI can paint progress between items.
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'Something went wrong.';
}
