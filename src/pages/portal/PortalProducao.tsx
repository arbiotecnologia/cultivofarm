import { formatDateDisplay } from "@/lib/date-utils";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { labelProducao } from "@/lib/portal/statusAcompanhamento";

export interface PortalProducaoProps {
  embedded?: boolean;
  highlightedOsId?: string | null;
  highlightedOnfarmOsId?: string | null;
}

export default function PortalProducao({
  embedded = false,
  highlightedOsId = null,
  highlightedOnfarmOsId = null,
}: PortalProducaoProps = {}) {
  const { clienteId, loading: cl } = usePortalCliente();
  const navigate = useNavigate();

  const { data: producao = [], isLoading: loading } = useScopedPortalQuery({
    queryKey: ["portalproducao", clienteId], enabled: !!clienteId,
    queryFn: async signal => {
      // Fase 10: buscar OS "manuais" e de Produção separadamente para evitar
      // falso-positivo de IDs cruzados no filtro de programacao_producao.
      const [{ data: osManual }, { data: osOnfarm }] = await Promise.all([
        supabase.from("ordens_servico").select("id, numero_os").eq("cliente_id", clienteId ?? "").abortSignal(signal),
        supabase.from("ordens_servico_onfarm").select("id, numero_os").eq("cliente_id", clienteId ?? "").abortSignal(signal),
      ]);

      const manualMap = new Map((osManual ?? []).map((o: any) => [o.id, o.numero_os]));
      const onfarmMap = new Map((osOnfarm ?? []).map((o: any) => [o.id, o.numero_os]));
      const manualIds = Array.from(manualMap.keys());
      const onfarmIds = Array.from(onfarmMap.keys());

      if (manualIds.length === 0 && onfarmIds.length === 0) {
        return [];
        }

      const filters: string[] = [];
      if (manualIds.length) filters.push(`ordem_servico_id.in.(${manualIds.join(",")})`);
      if (onfarmIds.length) filters.push(`ordem_servico_onfarm_id.in.(${onfarmIds.join(",")})`);

      const { data } = await supabase
        .from("programacao_producao")
        .select("*, produtos(nome), microrganismos(nome, nome_cientifico), lotes(id, controle_qualidade(id))")
        .or(filters.join(","))
        .order("data_programada", { ascending: false }).abortSignal(signal);

      // Fase 10.1: anexar numero_os para exibição e navegação cruzada.
      const enriched = (data ?? []).map((p: any) => ({
        ...p,
        _os_numero:
          (p.ordem_servico_id && manualMap.get(p.ordem_servico_id)) ||
          (p.ordem_servico_onfarm_id && onfarmMap.get(p.ordem_servico_onfarm_id)) ||
          null,
      }));

      return enriched;

    }
  });

  if (cl || loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  const goOS = (p: any) => {
    if (p.ordem_servico_id) {
      navigate(`/portal/acompanhamento?tab=ordens-servico&os=${p.ordem_servico_id}`);
    } else if (p.ordem_servico_onfarm_id) {
      navigate(`/portal/acompanhamento?tab=ordens-servico&os_onfarm=${p.ordem_servico_onfarm_id}`);
    }
  };

  const isHighlighted = (p: any) =>
    (p.ordem_servico_id && highlightedOsId === p.ordem_servico_id) ||
    (p.ordem_servico_onfarm_id && highlightedOnfarmOsId === p.ordem_servico_onfarm_id);

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Produção dos Bioinsumos</h1>
          <p className="text-muted-foreground text-sm">Acompanhe o status dos bioinsumos destinados ao seu atendimento.</p>
        </div>
      )}

      {producao.length === 0 ? (
        <p className="text-muted-foreground text-center py-12 border border-dashed rounded-lg">Nenhuma produção em andamento.</p>
      ) : (
        <div className="space-y-3">
          {producao.map((p) => {
            const nome = (p.produtos as any)?.nome || (p.microrganismos as any)?.nome || "Bioinsumo";
            const cientifico = (p.microrganismos as any)?.nome_cientifico;
            const highlighted = isHighlighted(p);
            const hasOS = !!(p.ordem_servico_id || p.ordem_servico_onfarm_id);

            return (
              <Card
                key={p.id}
                data-testid="producao-card"
                className={cn("transition-all", highlighted && "ring-2 ring-primary bg-primary/5")}
              >
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base sm:text-lg truncate">{nome}</span>
                      {p._os_numero && (
                        <Badge variant="outline" className="text-[10px]">OS {p._os_numero}</Badge>
                      )}
                    </div>
                    {cientifico && (
                      <div className="text-xs italic text-muted-foreground">{cientifico}</div>
                    )}
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      <span>Volume: {p.volume_necessario ? `${p.volume_necessario} mL` : "-"}</span>
                      <span>📅 {p.data_programada ? formatDateDisplay(p.data_programada) : "-"}</span>
                      {(p.lotes ?? []).length > 0 && <span>Lote registrado</span>}
                      {(p.lotes ?? []).some((l: any) => (l.controle_qualidade ?? []).length > 0) && (
                        <span>Laudo disponível</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={p.status === "aprovado" ? "default" : "secondary"} className="px-3 py-1">
                      {labelProducao(p.status)}
                    </Badge>
                    {hasOS && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        onClick={() => goOS(p)}
                        aria-label="Ver ordem de serviço"
                      >
                        <ArrowRight className="h-3 w-3" /> Ver ordem de serviço
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
