import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaProdutoActions } from "@/components/etiquetas/EtiquetaProdutoActions";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { supabase } from "@/integrations/supabase/client";
interface Props { open: boolean; onOpenChange: (open: boolean) => void; embalagemId: string; onDone?: () => void; }
export function GerarEtiquetaEmbalagemDialog(props: Props) {
  const scope = useStorageAccessScope(`embalagem-etiquetas:${props.embalagemId}:${props.open}`);
  return <Content key={scope.scope} {...props} scope={scope} />;
}
function Content({ open, onOpenChange, embalagemId, onDone, scope }: Props & { scope: ReturnType<typeof useStorageAccessScope> }) {
  const [row, setRow] = useState<{ codigo_embalagem: string; envase_id: string | null; lote_id: string | null; etiqueta_id: string | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !scope.ready) return;
    const current = scope.capture();
    (async () => {
      const { data, error } = await supabase.from("estoque_embalagens").select("codigo_embalagem, envase_id, lote_id, etiqueta_id").eq("id", embalagemId).single();
      if (!current()) return;
      if (error || !data) setError("Embalagem indisponível nesta sessão."); else setRow(data);
    })();
  }, [open, embalagemId, scope.scope]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Etiquetas · {row?.codigo_embalagem}</DialogTitle></DialogHeader>
    {error ? <p role="alert">{error}</p> : !scope.ready ? <p>Consulta indisponível nesta sessão.</p> : !row ? <p role="status">Carregando embalagem…</p> : <EtiquetaProdutoActions envaseId={row.envase_id || undefined} loteId={row.envase_id ? undefined : row.lote_id || undefined} etiquetaId={row.etiqueta_id} onChanged={onDone} />}
  </DialogContent></Dialog>;
}
