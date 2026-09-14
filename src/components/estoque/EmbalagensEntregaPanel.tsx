import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmbalagemStatusBadge } from "./EmbalagemStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Package, CheckCircle2, Truck, AlertTriangle } from "lucide-react";
import { ConferenciaEmbalagemQR } from "./ConferenciaEmbalagemQR";

const MSG_ERRO_ACAO = "Não foi possível concluir a ação. Tente novamente.";

export function EmbalagensEntregaPanel({ entregaId, compact = false }: { entregaId: string; compact?: boolean }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // react-query isola os dados por entregaId: ao trocar de entrega o estado é
  // limpo e uma resposta atrasada da entrega anterior não sobrescreve a atual.
  const {
    data: embalagens,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["entrega-embalagens", entregaId],
    enabled: !!entregaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estoque_embalagens")
        .select("id, codigo_embalagem, status, volume, unidade, validade_em, lote_id, etiqueta_id")
        .eq("entrega_id", entregaId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const lista = embalagens ?? [];
  const carregado = !isLoading && !isError && !!embalagens;

  const resumo = useMemo(() => {
    const r = { total: lista.length, reservadas: 0, separadas: 0, entregues: 0, sem_etiqueta: 0 };
    for (const e of lista) {
      if (e.status === "reservado") r.reservadas++;
      if (e.status === "separado") r.separadas++;
      if (e.status === "entregue") r.entregues++;
      if (!e.etiqueta_id) r.sem_etiqueta++;
    }
    return r;
  }, [lista]);

  const action = async (rpc: string, params: any, label: string) => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc(rpc, params);
      if (error) throw error;
      toast({ title: label });
      await refetch();
    } catch {
      toast({ title: "Erro", description: MSG_ERRO_ACAO, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />Embalagens vinculadas à entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground" data-testid="embalagens-carregando">
            Carregando embalagens...
          </p>
        )}

        {isError && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2"
            data-testid="embalagens-erro"
          >
            <p>Não foi possível carregar as embalagens desta entrega.</p>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
          </div>
        )}

        {carregado && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                ["Total", resumo.total],
                ["Reservadas", resumo.reservadas],
                ["Separadas", resumo.separadas],
                ["Entregues", resumo.entregues],
                ["Sem etiqueta", resumo.sem_etiqueta],
              ].map(([k, v]) => (
                <div key={k as string} className="border rounded-md p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
                  <div className="text-lg font-bold">{v as number}</div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground">
              A contagem refere-se às embalagens individuais rastreadas por código, e não à
              quantidade total envasada da entrega.
            </p>

            {resumo.sem_etiqueta > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                <AlertTriangle className="h-3 w-3" />
                {resumo.sem_etiqueta} embalagem(ns) sem etiqueta vinculada.
              </div>
            )}

            {lista.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma embalagem rastreada vinculada a esta entrega.</p>
            ) : (
              lista.map((e) => (
                <div key={e.id} className="flex items-center justify-between border rounded-md p-2 gap-2 flex-wrap">
                  <div className="flex flex-col">
                    <span className="font-mono text-sm font-semibold">{e.codigo_embalagem}</span>
                    <span className="text-xs text-muted-foreground">{e.volume} {e.unidade} · val. {e.validade_em ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <EmbalagemStatusBadge status={e.status} />
                    {!compact && e.status === "reservado" && (
                      <Button size="sm" variant="outline" disabled={loading}
                        onClick={() => action("rpc_confirmar_separacao_embalagem", { p_embalagem_id: e.id }, "Separação confirmada")}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />Separar
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}

            {!compact && lista.some((e) => ["reservado", "separado"].includes(e.status)) && (
              <Button className="w-full mt-2" disabled={loading}
                onClick={() => action("rpc_confirmar_entrega_embalagens", { p_entrega_id: entregaId }, "Entrega física confirmada")}>
                <Truck className="h-4 w-4 mr-2" />Confirmar entrega física das embalagens
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground pt-1">
              Confirmação física não substitui assinatura/comprovante de recebimento.
            </p>
          </>
        )}

        {!compact && (
          <div className="pt-2">
            <ConferenciaEmbalagemQR entregaId={entregaId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
