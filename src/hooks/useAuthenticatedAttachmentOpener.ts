import { useLayoutEffect, useRef } from "react";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";

/** Scoped ownership for explicit downloads; never signs or falls back remotely. */
export function useAuthenticatedAttachmentOpener(resource: string, bucket: string) {
  const access = useStorageAccessScope(resource);
  const controllers = useRef(new Map<string, AbortController>());
  const urls = useRef(new Set<string>());
  useLayoutEffect(() => {
    const requests = controllers.current;
    const owned = urls.current;
    return () => {
      requests.forEach(controller => controller.abort());
      requests.clear();
      owned.forEach(url => URL.revokeObjectURL(url));
      owned.clear();
    };
  }, [access.scope, bucket]);

  const open = async (path: string, onError: () => void) => {
    if (!access.ready || controllers.current.has(path)) return;
    const current = access.capture();
    const controller = new AbortController();
    controllers.current.set(path, controller);
    try {
      const blob = await downloadAuthenticatedAttachment(bucket, path, controller.signal);
      if (!current() || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (!current()) { URL.revokeObjectURL(url); return; }
      urls.current.add(url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      if (current() && !controller.signal.aborted) onError();
    } finally {
      // An obsolete completion must not remove a newer request for the same path.
      if (controllers.current.get(path) === controller) controllers.current.delete(path);
    }
  };
  return { open, ready: access.ready };
}