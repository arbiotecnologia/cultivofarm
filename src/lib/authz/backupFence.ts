export interface BackupFence { signal: AbortSignal; current: () => boolean }
export async function fencedStep<T>(fence: BackupFence, operation: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const unavailable = () => new Error('Documentos indisponíveis');
  if (fence.signal.aborted || !fence.current()) throw unavailable();
  const controller = new AbortController();
  const deadline = performance.now() + 15_000;
  const abort = () => controller.abort();
  fence.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  const live = () => {
    if (performance.now() >= deadline || !fence.current()) abort();
    return !fence.signal.aborted && !controller.signal.aborted;
  };
  let stop: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => { stop = () => reject(unavailable()); controller.signal.addEventListener('abort', stop, { once: true }); });
  try {
    if (!live()) throw unavailable();
    const value = await Promise.race([Promise.resolve(operation(controller.signal)), aborted]);
    if (!live()) throw unavailable();
    return value;
  } finally {
    clearTimeout(timer);
    fence.signal.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', stop);
    controller.abort();
  }
}