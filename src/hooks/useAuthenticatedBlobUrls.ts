import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { ATTACHMENT_LIMITS, downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";

/** Candidate interface: pass only visible paths, or lazy=true and request on demand. */
export function useAuthenticatedBlobUrls(paths: (string | null | undefined)[], bucket = "consultor-arquivos", options: { enabled?: boolean; lazy?: boolean } = {}) {
  const valid = [...new Set(paths.filter((p): p is string => typeof p === "string" && p.length > 0))];
  const key = JSON.stringify([bucket, valid, options.enabled !== false, options.lazy === true]);
  const fence = useStorageAccessScope(`authenticated-attachments:${key}`);
  const ready = fence.ready && options.enabled !== false;
  const current = useRef({ scope: fence.scope, ready });
  current.current = { scope: fence.scope, ready };
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ scope: string; urls: Record<string, string>; loading: boolean; error: Error | null }>({ scope: "", urls: {}, loading: false, error: null });
  const requestRef = useRef<(path: string) => void>(() => {});

  useLayoutEffect(() => {
    const scope = fence.scope;
    let alive = true;
    let bytes = 0;
    let pending = 0;
    const urls: Record<string, string> = {};
    const controllers = new Map<string, AbortController>();
    let error: Error | null = null;
    const isCurrent = () => alive && current.current.ready && current.current.scope === scope;
    const publish = () => { if (isCurrent()) setResult({ scope, urls: { ...urls }, loading: pending > 0, error }); };
    setResult({ scope, urls: {}, loading: false, error: null });
    const request = (path: string) => {
      if (!isCurrent() || !valid.includes(path) || controllers.has(path) || urls[path]) return;
      if (valid.length > ATTACHMENT_LIMITS.files) { error = new Error("Limite de anexos excedido"); publish(); return; }
      const controller = new AbortController();
      controllers.set(path, controller); pending++; publish();
      void downloadAuthenticatedAttachment(bucket, path, controller.signal).then(blob => {
        if (!isCurrent() || controller.signal.aborted) return;
        if (bytes + blob.size > ATTACHMENT_LIMITS.totalBytes) throw new Error("Limite de anexos excedido");
        bytes += blob.size;
        const url = URL.createObjectURL(blob);
        if (!isCurrent()) { URL.revokeObjectURL(url); return; }
        urls[path] = url;
      }).catch(() => {
        if (isCurrent()) { error = new Error("Anexo indisponível"); failed.add(path); }
      }).finally(() => { controllers.delete(path); pending--; publish(); });
    };
    requestRef.current = request;
    if (ready && !options.lazy) valid.forEach(request);
    return () => {
      alive = false;
      requestRef.current = () => {};
      controllers.forEach(controller => controller.abort());
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
    // key includes paths/options; identity, tenant, roles and epoch are in scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fence.scope, key, ready, attempt]);

  const request = useCallback((path: string) => requestRef.current(path), []);
  const refresh = useCallback(() => setAttempt(n => n + 1), []);
  const visible = ready && result.scope === fence.scope;
  return { urls: visible ? result.urls : {}, loading: visible ? result.loading : ready && !options.lazy, error: visible ? result.error : null, refresh, request };
}