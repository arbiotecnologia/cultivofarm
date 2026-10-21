import { useLayoutEffect, useRef, useState } from "react";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { ATTACHMENT_LIMITS, downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";

export type AttachmentLoader = (path: string, signal: AbortSignal) => Promise<Blob>;

/** Scoped ownership for explicit downloads; never signs or falls back remotely.
 * `load` defaults to the authenticated Storage transport; callers that must go
 * through a canonical Edge may pass their own binary loader (same fences). */
export function useAuthenticatedAttachmentOpener(resource: string, bucket: string, load?: AttachmentLoader) {
  const access = useStorageAccessScope(resource);
  const controllers = useRef(new Map<string, AbortController>());
  const urls = useRef(new Map<string, { url: string; bytes: number }>());
  const [result, setResult] = useState({ scope: "", urls: {} as Record<string, string>, loading: [] as string[] });
  const publish = () => setResult({ scope: access.scope, urls: Object.fromEntries([...urls.current].map(([path, item]) => [path, item.url])), loading: [...controllers.current.keys()] });
  useLayoutEffect(() => {
    const requests = controllers.current;
    const owned = urls.current;
    setResult({ scope: access.scope, urls: {}, loading: [] });
    return () => {
      requests.forEach(controller => controller.abort());
      requests.clear();
      owned.forEach(item => URL.revokeObjectURL(item.url));
      owned.clear();
    };
  }, [access.scope, bucket]);

  /** Resolves true only when this call stored fresh bytes. A parent signal (caller
   * watchdog/fence) aborts the owned I/O so a timed-out request never keeps the
   * path busy or stores late bytes. Returns false on error, abort or busy path. */
  const open = async (path: string, onError: () => void, parent?: AbortSignal): Promise<boolean> => {
    const current = access.capture();
    if (!current() || parent?.aborted || controllers.current.has(path) || urls.current.has(path)) return false;
    const controller = new AbortController();
    // Ownership is released at abort time, not when a (possibly hung) transport settles:
    // a retry can start immediately and the old completion is fenced by identity below.
    const relay = () => {
      controller.abort();
      if (controllers.current.get(path) === controller) { controllers.current.delete(path); if (current()) publish(); }
    };
    parent?.addEventListener("abort", relay, { once: true });
    controllers.current.set(path, controller);
    publish();
    try {
      const blob = await (load ?? ((p: string, s: AbortSignal) => downloadAuthenticatedAttachment(bucket, p, s)))(path, controller.signal);
      if (!current() || controller.signal.aborted) return false;
      if (blob.size > ATTACHMENT_LIMITS.fileBytes || blob.size > ATTACHMENT_LIMITS.totalBytes) throw new Error("Anexo indisponível");
      const total = () => [...urls.current.values()].reduce((sum, item) => sum + item.bytes, 0);
      while (urls.current.size >= ATTACHMENT_LIMITS.files || total() + blob.size > ATTACHMENT_LIMITS.totalBytes) {
        const oldest = urls.current.entries().next().value;
        if (!oldest) break;
        URL.revokeObjectURL(oldest[1].url);
        urls.current.delete(oldest[0]);
      }
      const url = URL.createObjectURL(blob);
      if (!current() || controller.signal.aborted) { URL.revokeObjectURL(url); return false; }
      urls.current.set(path, { url, bytes: blob.size });
      return true;
    } catch {
      if (current() && !controller.signal.aborted) onError();
      return false;
    } finally {
      parent?.removeEventListener("abort", relay);
      // An obsolete completion must not remove a newer request for the same path.
      if (controllers.current.get(path) === controller) controllers.current.delete(path);
      if (current()) publish();
    }
  };
  // Only invoked synchronously by an explicit user click after preparation.
  const download = (path: string, fileName: string) => {
    if (!access.capture()()) return;
    const item = urls.current.get(path);
    if (!item) return;
    urls.current.delete(path); urls.current.set(path, item);
    const link = document.createElement("a");
    link.href = item.url; link.download = fileName.split(/[\\/]/).pop() || "anexo";
    document.body.appendChild(link); link.click(); link.remove();
  };
  /** Revokes prepared bytes that the server no longer confirms as current. */
  const discard = (path: string) => {
    controllers.current.get(path)?.abort(); controllers.current.delete(path);
    const item = urls.current.get(path);
    if (item) { URL.revokeObjectURL(item.url); urls.current.delete(path); }
    if (access.capture()()) publish();
  };
  const visible = access.ready && result.scope === access.scope;
  return { open, download, discard, urls: visible ? result.urls : {}, loadingPaths: visible ? result.loading : [], ready: access.ready };
}