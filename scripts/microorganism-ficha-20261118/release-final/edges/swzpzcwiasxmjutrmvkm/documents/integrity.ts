export const MAX_BYTES = 10 * 1024 * 1024;
export async function measure(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('document_size');
  const starts = (signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  const mime = starts([37,80,68,70,45]) ? 'application/pdf' :
    starts([137,80,78,71,13,10,26,10]) ? 'image/png' : starts([255,216,255]) ? 'image/jpeg' : null;
  if (!mime) throw new Error('document_type');
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), byte => byte.toString(16).padStart(2,'0')).join('');
  return { mime, sha256, size_bytes: bytes.length };
}
export async function boundedBytes(response: Request | Response, signal: AbortSignal, max = MAX_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('document_body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel(); };
  signal.addEventListener('abort', cancel, {once:true});
  try {
    while (true) {
      if (signal.aborted) throw new Error('document_timeout');
      const next = await reader.read();
      if (signal.aborted) throw new Error('document_timeout');
      if (next.done) break;
      size += next.value.length;
      if (size > max) throw new Error('document_size');
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { signal.removeEventListener('abort', cancel); void reader.cancel(); }
}
