import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { ATTACHMENT_LIMITS, downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";

export interface AuthenticatedBlobPage {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;
  /** Moves the eager window to the page containing `path` (no-op if not listed). */
  showPath: (path: string) => void;
}

/**
 * Downloads attachments through the canonical authenticated SDK fetch (Storage RLS
 * authoritative) and exposes owned blob: URLs. Never signs and never uses stored URLs.
 *
 * Memory bounds:
 *  - eager mode: a window of at most ATTACHMENT_LIMITS.files paths (one page) is
 *    resident; changing page revokes the previous window before loading the next.
 *  - lazy mode: on-demand requests across the whole list, with an LRU cache of at
 *    most ATTACHMENT_LIMITS.files resident Blobs / totalBytes; evicted entries are
 *    revoked and can be requested again.
 */
export function useAuthenticatedBlobUrls(paths: (string | null | undefined)[], bucket = "consultor-arquivos", options: { enabled?: boolean; lazy?: boolean } = {}) {
  const valid = [...new Set(paths.filter((p): p is string => typeof p === "string" && p.length > 0))];
  const pageSize = ATTACHMENT_LIMITS.files;
  const pageCount = Math.max(1, Math.ceil(valid.length / pageSize));
  const [rawPage, setRawPage] = useState(0);
  const page = Math.min(Math.max(0, rawPage), pageCount - 1);
  const lazy = options.lazy === true;
  const windowPaths = lazy ? valid : valid.slice(page * pageSize, (page + 1) * pageSize);
  const key = JSON.stringify([bucket, windowPaths, options.enabled !== false, lazy]);
  const fence = useStorageAccessScope(`authenticated-attachments:${key}`);
  const ready = fence.ready && options.enabled !== false;
  const current = useRef({ scope: fence.scope, ready });
  current.current = { scope: fence.scope, ready };
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ scope: string; urls: Record<string, string>; loading: boolean; loadingPaths: string[]; error: Error | null; failed: string[] }>({ scope: "", urls: {}, loading: false, loadingPaths: [], error: null, failed: [] });
  const requestRef = useRef<(path: string) => void>(() => {});

  useLayoutEffect(() => {
    const scope = fence.scope;
    const authorized = fence.capture();
    let alive = true;
    let bytes = 0;
    let pending = 0;
    const urls: Record<string, string> = {};
    const sizes = new Map<string, number>();
    const order: string[] = []; // LRU (oldest first) of resident paths
    const controllers = new Map<string, AbortController>();
    const failed = new Set<string>();
    let error: Error | null = null;
    const isCurrent = () => alive && current.current.ready && current.current.scope === scope && authorized();
    const publish = () => { if (isCurrent()) setResult({ scope, urls: { ...urls }, loading: pending > 0, loadingPaths: [...controllers.keys()], error, failed: [...failed] }); };
    const evict = (path: string) => {
      const url = urls[path];
      if (url) URL.revokeObjectURL(url);
      delete urls[path];
      bytes -= sizes.get(path) ?? 0;
      sizes.delete(path);
      const index = order.indexOf(path);
      if (index >= 0) order.splice(index, 1);
    };
    setResult({ scope, urls: {}, loading: false, loadingPaths: [], error: null, failed: [] });
    const request = (path: string) => {
      if (!isCurrent() || !windowPaths.includes(path) || controllers.has(path)) return;
      if (urls[path]) { // refresh LRU position
        const index = order.indexOf(path);
        if (index >= 0) { order.splice(index, 1); order.push(path); }
        return;
      }
      failed.delete(path);
      if (!failed.size) error = null;
      const controller = new AbortController();
      controllers.set(path, controller); pending++; publish();
      void downloadAuthenticatedAttachment(bucket, path, controller.signal).then(blob => {
        if (!isCurrent() || controller.signal.aborted) return;
        if (lazy) {
          while (order.length && (order.length >= pageSize || bytes + blob.size > ATTACHMENT_LIMITS.totalBytes)) evict(order[0]);
        }
        if (bytes + blob.size > ATTACHMENT_LIMITS.totalBytes) throw new Error("Limite de anexos excedido");
        const url = URL.createObjectURL(blob);
        if (!isCurrent()) { URL.revokeObjectURL(url); return; }
        bytes += blob.size;
        sizes.set(path, blob.size);
        urls[path] = url;
        order.push(path);
      }).catch(() => {
        if (isCurrent()) { error = new Error("Anexo indisponível"); failed.add(path); }
      }).finally(() => {
        if (controllers.get(path) === controller) { controllers.delete(path); pending--; }
        publish();
      });
    };
    requestRef.current = request;
    if (ready && !lazy) windowPaths.forEach(request);
    return () => {
      alive = false;
      requestRef.current = () => {};
      controllers.forEach(controller => controller.abort());
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
    // key includes window paths/options; identity, tenant, roles and epoch are in scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fence.scope, key, ready, attempt]);

  const request = useCallback((path: string) => requestRef.current(path), []);
  const refresh = useCallback(() => setAttempt(n => n + 1), []);
  const validRef = useRef(valid);
  validRef.current = valid;
  const setPage = useCallback((next: number) => setRawPage(Math.max(0, Math.floor(next))), []);
  const showPath = useCallback((path: string) => {
    const index = validRef.current.indexOf(path);
    if (index >= 0) setRawPage(Math.floor(index / pageSize));
  }, [pageSize]);
  const visible = ready && result.scope === fence.scope;
  const pagination: AuthenticatedBlobPage = { page, pageCount, pageSize, total: valid.length, setPage, showPath };
  return { urls: visible ? result.urls : {}, loading: visible ? result.loading : ready && !lazy, loadingPaths: visible ? result.loadingPaths : [], error: visible ? result.error : null, failed: visible ? result.failed : [], refresh, request, pagination };
}
