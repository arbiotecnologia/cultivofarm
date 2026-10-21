import { useCallback, useEffect, useRef, useState } from "react";
import { useStorageAccessScope } from "./useStorageAccessScope";

export interface FencedPdfDoc { save: (fileName: string) => void }
export type FencedPdfResult = "saved" | "shared" | "cancelled" | "unavailable";

/**
 * Exportação de PDF cercada pelo escopo canônico de acesso (identidade, tenant,
 * papéis, epoch e lease do monitor existente). Mudança de escopo/ready aborta a
 * geração; nada é compartilhado/salvo se o acesso capturado no início deixou de
 * valer. Apresentação apenas — a autorização real permanece no servidor/RLS.
 */
export function useFencedPdfExport(resource: string, share: (doc: FencedPdfDoc, fileName: string) => Promise<boolean>) {
  const access = useStorageAccessScope(`pdf-export:${resource}`);
  const owner = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);

  // Qualquer mudança de escopo/ready (ou unmount) cancela a exportação em curso.
  useEffect(() => () => {
    owner.current?.abort();
    owner.current = null;
    setBusy(false);
  }, [access.scope]);

  const run = useCallback(async (generate: (signal: AbortSignal) => Promise<FencedPdfDoc>, fileName: string): Promise<FencedPdfResult> => {
    if (!access.ready) return "unavailable";
    const authorized = access.capture();
    owner.current?.abort();
    const controller = new AbortController();
    owner.current = controller;
    const live = () => owner.current === controller && !controller.signal.aborted && authorized();
    setBusy(true);
    try {
      const doc = await generate(controller.signal);
      if (!live()) return "cancelled";
      const shared = await share(doc, fileName);
      if (!live()) return "cancelled";
      if (shared) return "shared";
      doc.save(fileName);
      return "saved";
    } finally {
      if (owner.current === controller) { owner.current = null; setBusy(false); }
    }
    // capture is intentionally re-read via access; scope change recreates run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.scope, share]);

  return { run, busy, ready: access.ready };
}
