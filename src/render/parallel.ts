export type CaptureInOrderOptions<T> = {
  /** How many frames there are, numbered from 0. */
  readonly count: number;
  /** How many captures run at once. Worker `w` takes frames `w`, `w + workers`, … */
  readonly workers: number;
  /** How many frames may wait, captured but unwritten, ahead of the next one to write. */
  readonly ahead: number;
  readonly capture: (worker: number, frame: number) => Promise<T>;
  /** Called once per frame, in frame order, one call at a time. */
  readonly write: (result: T, frame: number) => Promise<void>;
};

/**
 * Captures frames on several workers at once and writes them strictly in
 * order. Frames are interleaved across workers, so a small buffer is enough
 * to put them back in order.
 */
export const captureInOrder = async <T>({
  count,
  workers,
  ahead,
  capture,
  write,
}: CaptureInOrderOptions<T>): Promise<void> => {
  const ready = new Map<number, T>();
  let next = 0;
  let draining = false;
  let waiting: (() => void)[] = [];
  let failed: { readonly error: unknown } | undefined;

  const waitForRoom = async (frame: number) => {
    while (!failed && frame >= next + ahead)
      await new Promise<void>((resolve) => waiting.push(resolve));
  };
  const wakeWaiters = () => {
    const woken = waiting;
    waiting = [];
    for (const resolve of woken) resolve();
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      while (!failed && ready.has(next)) {
        const result = ready.get(next) as T;
        ready.delete(next);
        await write(result, next);
        next += 1;
        wakeWaiters();
      }
    } finally {
      draining = false;
    }
  };

  const runWorker = async (worker: number) => {
    try {
      for (let frame = worker; frame < count; frame += workers) {
        await waitForRoom(frame);
        if (failed) return;
        ready.set(frame, await capture(worker, frame));
        await drain();
      }
    } catch (error) {
      failed ??= { error };
      wakeWaiters();
    }
  };

  // Every worker settles before this returns, so the caller can safely close what they use.
  await Promise.all(Array.from({ length: Math.min(workers, count) }, (_, w) => runWorker(w)));
  if (failed) throw failed.error;
};
