import { supabase } from "@/integrations/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => new Error("Documento indisponível");
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Binário do termo pela Edge canônica `entrega-termo-pdf` (action "download").
 * Sem URL portadora, sem assinatura de Storage e sem fallback: qualquer falha
 * vira erro neutro. Autorização e vigência são provadas no servidor.
 */
export async function downloadTermoPdf(termoId: string, signal: AbortSignal): Promise<Blob> {
  if (!UUID.test(termoId) || signal.aborted) throw unavailable();
  try {
    const { data, error } = await supabase.functions.invoke("entrega-termo-pdf", {
      body: { termo_id: termoId, action: "download" }, signal,
    });
    if (signal.aborted || error || !(data instanceof Blob)) throw unavailable();
    if (data.size < 5 || data.size > MAX_BYTES) throw unavailable();
    const magic = new TextDecoder().decode(new Uint8Array(await data.slice(0, 5).arrayBuffer()));
    if (magic !== "%PDF-" || signal.aborted) throw unavailable();
    return new Blob([await data.arrayBuffer()], { type: "application/pdf" });
  } catch { throw unavailable(); }
}
