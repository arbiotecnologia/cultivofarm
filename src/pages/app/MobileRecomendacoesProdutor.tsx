import { formatDateDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, ShieldCheck } from "lucide-react";
import { usePortalCliente } from "@/hooks/usePortalCliente";

/**
 * Fase 12.7 — View do produtor.
 *
 * ESTRITAMENTE READ-ONLY. Nenhuma mutation é emitida por esta tela.
 * Filtros de client-side apenas reforçam RLS (autoridade real está no banco):
 *  - somente cliente_id do produtor;
 *  - somente status ∈ {finalizado, enviado_aprovacao, aprovado, convertido_os, arquivado};
 *  - rascunho / em_andamento ficam ocultos.
 *
 * A ação "Confirmar ciência" NÃO é implementada nesta fase — as colunas de
 * suporte ainda não existem em `registros_consultor`. Fica registrado para 12.8.
 */

const STATUS_VISIVEIS = [
  "finalizado",
  "enviado_aprovacao",
  "aprovado",
  "convertido_os",
  "arquivado",
] as const;

const STATUS_LABELS: Record<string, string> = {
  finalizado: "Finalizado",
  enviado_aprovacao: "Em análise",
  aprovado: "Aprovado",
  convertido_os: "Em execução",
  arquivado: "Arquivado",
};

const STATUS_COLORS: Record<string, string> = {
  finalizado: "bg-blue-100 text-blue-700",
  enviado_aprovacao: "bg-amber-100 text-amber-700",
  aprovado: "bg-emerald-100 text-emerald-700",
  convertido_os: "bg-purple-100 text-purple-700",
  arquivado: "bg-muted text-muted-foreground",
};

export default function MobileRecomendacoesProdutor() {
  const navigate = useNavigate();
  const { clienteId, loading: clienteLoading } = usePortalCliente();

  const { data: registros, isLoading, isError, refetch } = useQuery({
    queryKey: ["mobile-recomendacoes-produtor", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor")
        .select("*, clientes(nome), fazendas(nome), talhoes(nome)")
        .eq("cliente_id", clienteId!)
        .in("status", STATUS_VISIVEIS)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Minhas recomendações</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Documentos técnicos emitidos pelo consultor. Somente leitura.
        </p>
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
        <p className="text-[11px] leading-snug text-foreground/80">
          As recomendações a seguir constituem prescrição técnico-agronômica emitida por
          profissional habilitado. Execute-as respeitando as condições locais, a legislação
          vigente e o receituário aplicável.
        </p>
      </div>

      {clienteLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !clienteId ? (
        <div className="text-center py-12 text-muted-foreground space-y-1">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">Produtor não identificado</p>
          <p className="text-xs">
            Não foi possível identificar o produtor vinculado ao seu usuário.
            Entre em contato com o administrador.
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-destructive">Não foi possível carregar as recomendações.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      ) : registros?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma recomendação disponível</p>
        </div>
      ) : (
        <div className="space-y-2">
          {registros?.map((r: Record<string, unknown> & { id: string; status: string; clientes?: { nome?: string }; fazendas?: { nome?: string }; talhoes?: { nome?: string }; data_vistoria?: string; objetivo_visita?: string; problema_principal?: string; categoria_problema?: string; nivel_pressao?: string }) => (
            <Card
              key={r.id}
              className="p-3 space-y-1 cursor-pointer hover:bg-muted/40 active:bg-muted/60 transition-colors"
              onClick={() => navigate(`/portal/registros/${r.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground">
                    {r.objetivo_visita || r.problema_principal || "Recomendação técnica"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.fazendas?.nome} • {r.talhoes?.nome}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge
                    className={`text-[10px] ${STATUS_COLORS[r.status] || ""}`}
                    variant="secondary"
                  >
                    {STATUS_LABELS[r.status] || r.status}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>{formatDateDisplay(r.data_vistoria)}</span>
                {r.categoria_problema && (
                  <Badge variant="outline" className="text-[10px] h-4">
                    {r.categoria_problema.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
