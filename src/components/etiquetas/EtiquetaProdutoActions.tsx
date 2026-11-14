import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { Tag, Printer, Link as LinkIcon, Eye } from "lucide-react";
import { toast } from "sonner";
import { buildRastreioUrl } from "./QRCodeRastreioProduto";
import { LABEL_TEMPLATES, generationIds, generationPayload, type LabelTemplate } from "@/lib/etiquetas";
interface Props { readOnly?: boolean; envaseId?: string; loteId?: string; etiquetaId?: string | null; traceToken?: string | null; status?: string | null; onChanged?: () => void; }
export function EtiquetaProdutoActions(props: Props) {
  const scope = useStorageAccessScope(`etiquetas:${props.envaseId || props.loteId || props.etiquetaId}`);
  return <Actions key={scope.scope} {...props} scope={scope} />;
}
function Actions({ readOnly = false, envaseId, loteId, etiquetaId, traceToken, status, onChanged, scope }: Props & { scope: ReturnType<typeof useStorageAccessScope> }) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("interna");
  const [template, setTemplate] = useState<LabelTemplate>("etiqueta-op-100x150");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const view = () => { if (etiquetaId) window.open(`/etiquetas/${etiquetaId}/imprimir`, "_blank"); };
  const gerar = async () => {
    if (readOnly || !scope.ready || lock.current) return;
    lock.current = true; setLoading(true); setError(""); const current = scope.capture();
    try {
      const payload = generationPayload(envaseId, envaseId ? undefined : loteId, tipo, template);
      if (!current()) return;
      const { data, error } = await (supabase as any).rpc("rpc_gerar_etiquetas_recipientes_v1", { p_payload: payload });
      if (!current()) return;
      if (error) throw error;
      const ids = generationIds(data);
      setOpen(false); onChanged?.();
      // One canonical print route. Additional UUIDs are explicit selection, never authority.
      window.location.assign(`/etiquetas/${ids[0]}/imprimir?ids=${ids.join(",")}`);
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "Não foi possível confirmar a geração. Consulte antes de repetir."); }
    finally { lock.current = false; if (current()) setLoading(false); }
  };
  return <div className="flex flex-wrap gap-1">
    {!readOnly && (envaseId || loteId) && <Button size="sm" variant="outline" disabled={!scope.ready} onClick={() => setOpen(true)}><Tag className="h-3 w-3 mr-1" />Gerar etiquetas</Button>}
    {etiquetaId && <><Button size="sm" variant="outline" onClick={view}><Eye className="h-3 w-3 mr-1" />Ver</Button><Button size="sm" variant="outline" onClick={view} disabled={status === "cancelada"}><Printer className="h-3 w-3 mr-1" />{status === "gerada" ? "Imprimir" : "Reimprimir"}</Button>{traceToken && <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(buildRastreioUrl(traceToken)); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar o link"); } }}><LinkIcon className="h-3 w-3 mr-1" />Link</Button>}</>}
    <Dialog open={open} onOpenChange={value => { if (!loading) setOpen(value); }}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Gerar etiquetas por recipiente</DialogTitle></DialogHeader>
      <label className="space-y-1">Tipo<Select value={tipo} onValueChange={setTipo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["principal", "reduzida", "caixa", "transporte", "amostra", "interna"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></label>
      {tipo === "interna" ? <p className="text-sm">20 L · 100×150 mm; 5 L · 100×100 mm; 1 L · 80×50 mm</p> : <label className="space-y-1">Formato<Select value={template} onValueChange={v => setTemplate(v as LabelTemplate)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(LABEL_TEMPLATES).map(([code, d]) => <SelectItem key={code} value={code}>{d.width}×{d.height} mm</SelectItem>)}</SelectContent></Select></label>}
      {error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button disabled={loading || !scope.ready} onClick={gerar}>{loading ? "Gerando…" : "Gerar e selecionar recipientes"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
