/** Immutable Storage writes: collisions are accepted only after byte verification. */
export function isAlreadyExistingObject(error: { statusCode?: string | number; error?: string; message?: string }): boolean {
  return String(error.statusCode) === "409" || error.error === "Duplicate" ||
    ["The resource already exists", "Resource already exists", "Object already exists"].includes(error.message ?? "");
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyExistingObject(
  download: () => Promise<{ data: { arrayBuffer(): Promise<ArrayBuffer> } | null; error: unknown }>,
  expectedHash: string,
  expectedBytes: number,
): Promise<string | null> {
  try {
    const result = await download();
    if (result.error || !result.data) return "FISCAL_PROTOCOLED_STORAGE_VERIFY_FAILED";
    const bytes = new Uint8Array(await result.data.arrayBuffer());
    const hash = await sha256Bytes(bytes);
    return hash === expectedHash && bytes.byteLength === expectedBytes
      ? null : "FISCAL_PROTOCOLED_STORAGE_CONFLICT";
  } catch {
    return "FISCAL_PROTOCOLED_STORAGE_VERIFY_FAILED";
  }
}