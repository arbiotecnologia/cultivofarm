/** Single existing transport entrypoint chooses reviewed route, never falls back. */
export async function clientDocumentDispatcher(
  bucket: string, path: string, signal: AbortSignal,
  reviewed: (path: string, signal: AbortSignal) => Promise<Blob>,
  existing: (bucket: string, path: string, signal: AbortSignal) => Promise<Blob>,
): Promise<Blob> {
  return bucket === "clientes-docs" ? reviewed(path, signal) : existing(bucket, path, signal);
}