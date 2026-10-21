export interface BackupFence { signal: AbortSignal; current: () => boolean }
export async function fencedStep<T>(fence: BackupFence, operation: () => PromiseLike<T>): Promise<T> {
  const unavailable = () => new Error('Documentos indisponíveis');
  if (fence.signal.aborted || !fence.current()) throw unavailable();
  let stop: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => { stop = () => reject(unavailable()); fence.signal.addEventListener('abort', stop, { once: true }); });
  try {
    const value = await Promise.race([Promise.resolve(operation()), aborted]);
    if (fence.signal.aborted || !fence.current()) throw unavailable();
    return value;
  } finally { fence.signal.removeEventListener('abort', stop); }
}