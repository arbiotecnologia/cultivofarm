import { GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatDateTimeDisplay } from "@/lib/date-utils";

interface Props {
  entidadeTipo: "produto" | "microrganismo";
  entidadeId: string;
  canApprove: boolean;
}

interface Versao {
  id: string;
  campo: string;
  conteudo_anterior: string | null;
  conteudo_novo: string | null;
  origem: string;
  status: string;
  modelo_ia: string | null;
  criado_em: string;
  revisado_em: string | null;
  observacao: string | null;
}

export function VersoesHistoricoTab({ entidadeTipo, entidadeId, canApprove }: Props) {
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | "pendente">("pendente");

  const load = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("ficha_tecnica_versoes")
      .select("*")
      .eq("entidade_tipo", entidadeTipo)
      .eq("entidade_id", entidadeId)
      .order("criado_em", { ascending: false })
      .limit(100);
    if (filter === "pendente") q = q.eq("status", "pendente");
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setVersoes((data as any[]) ?? []);
    setLoading(false);
  }, [entidadeTipo, entidadeId, filter]);

  useEffect(() => { load(); }, [load]);

  const aprovar = async (id: string) => {
    toast.error(GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE);
    return;
    const { error } = await supabase.rpc("aprovar_ficha_versao" as any, { p_versao_id: id });
    if (error) return toast.error(error.message);
    toast.success("Versão aprovada e aplicada");
    load();
  };

  const rejeitar = async (id: string) => {
    toast.error(GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE);
    return;
    const obs = window.prompt("Motivo da rejeição (opcional):") ?? null;
    const { error } = await supabase.rpc("rejeitar_ficha_versao" as any, { p_versao_id: id, p_observacao: obs });
    if (error) return toast.error(error.message);
    toast.success("Versão rejeitada");
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={filter === "pendente" ? "default" : "outline"} onClick={() => setFilter("pendente")}>Pendentes</Button>
        <Button size="sm" variant={filter === "todos" ? "default" : "outline"} onClick={() => setFilter("todos")}>Todas</Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : versoes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma versão {filter === "pendente" ? "pendente" : "registrada"}.</p>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {versoes.map((v) => (
            <div key={v.id} className="border rounded p-2 space-y-1 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold">{v.campo}</span>
                  <Badge variant={v.status === "pendente" ? "default" : v.status === "aprovada" ? "secondary" : "outline"} className="text-[9px]">{v.status}</Badge>
                  <Badge variant="outline" className="text-[9px]">{v.origem}</Badge>
                  {v.modelo_ia && <span className="text-[9px] text-muted-foreground">{v.modelo_ia}</span>}
                </div>
                <span className="text-[10px] text-muted-foreground">{formatDateTimeDisplay(v.criado_em)}</span>
              </div>
              {v.observacao && <p className="text-[10px] text-amber-700 italic">{v.observacao}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                <div>
                  <p className="text-[9px] uppercase text-muted-foreground">Anterior</p>
                  <pre className="whitespace-pre-wrap text-[10px] bg-muted/40 p-1 rounded max-h-32 overflow-y-auto">{v.conteudo_anterior || "(vazio)"}</pre>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-muted-foreground">Novo</p>
                  <pre className="whitespace-pre-wrap text-[10px] bg-emerald-50 p-1 rounded max-h-32 overflow-y-auto">{v.conteudo_novo || "(vazio)"}</pre>
                </div>
              </div>
              {canApprove && v.status === "pendente" && (
                <div className="flex gap-1 justify-end pt-1">
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => rejeitar(v.id)}>
                    <X className="h-3 w-3 mr-1" />Rejeitar
                  </Button>
                  <Button size="sm" className="h-6 text-[10px]" onClick={() => aprovar(v.id)}>
                    <Check className="h-3 w-3 mr-1" />Aprovar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
