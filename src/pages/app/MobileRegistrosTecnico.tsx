import { formatDateDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, Plus, Pencil } from "lucide-react";

/**
 * Fase 12.7 — View técnica (consultor/admin) de registros_consultor.
 *
 * Read-write conforme regras existentes: técnico enxerga rascunhos próprios
 * e pode abrir para edição quando status ∈ {rascunho, em_andamento}.
 * Nenhuma nova ação mutante é habilitada aqui — todas as mutations reais
 * continuam nas telas de edição/wizard (`/visita-tecnica/:id`).
 */

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  enviado_aprovacao: "Aguardando Aprovação",
  aprovado: "Aprovado",
  convertido_os: "Convertido em OS",
  arquivado: "Arquivado",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  em_andamento: "bg-sky-100 text-sky-700",
  finalizado: "bg-blue-100 text-blue-700",
  enviado_aprovacao: "bg-amber-100 text-amber-700",
  aprovado: "bg-emerald-100 text-emerald-700",
  convertido_os: "bg-purple-100 text-purple-700",
  arquivado: "bg-muted text-muted-foreground",
};

const EDITABLE = new Set(["rascunho", "em_andamento"]);

export default function MobileRegistrosTecnico() {
  const navigate = useNavigate();

  const { data: registros, isLoading, isError, refetch } = useQuery({
    queryKey: ["mobile-registros-tecnico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor")
        .select("*, clientes(nome), fazendas(nome), talhoes(nome)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const openRoteiro = (id: string) => navigate(`/visita-tecnica/${id}?tab=roteiro`);
  const openEdicao = (id: string) => navigate(`/visita-tecnica/${id}`);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-foreground">Registros técnicos</h1>
        <Button size="sm" onClick={() => navigate("/app/visita/novo")}>
          <Plus className="h-4 w-4 mr-1" /> Nova visita
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-destructive">Não foi possível carregar os registros.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      ) : registros?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {registros?.map((r: Record<string, unknown> & { id: string; status: string; clientes?: { nome?: string }; fazendas?: { nome?: string }; talhoes?: { nome?: string }; data_vistoria?: string; objetivo_visita?: string; problema_principal?: string; categoria_problema?: string; nivel_pressao?: string }) => {
            const editable = EDITABLE.has(r.status);
            return (
              <Card
                key={r.id}
                className="p-3 space-y-1 cursor-pointer hover:bg-muted/40 active:bg-muted/60 transition-colors"
                onClick={() => (editable ? openEdicao(r.id) : openRoteiro(r.id))}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-foreground">
                      {r.objetivo_visita || r.problema_principal || "Registro de vistoria"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.clientes?.nome} • {r.fazendas?.nome} • {r.talhoes?.nome}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={`text-[10px] ${STATUS_COLORS[r.status] || ""}`} variant="secondary">
                      {STATUS_LABELS[r.status] || r.status}
                    </Badge>
                    {editable ? (
                      <Pencil className="h-4 w-4 text-muted-foreground" aria-label="Editar" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>{formatDateDisplay(r.data_vistoria)}</span>
                  {r.categoria_problema && (
                    <Badge variant="outline" className="text-[10px] h-4">
                      {r.categoria_problema.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {r.nivel_pressao && r.nivel_pressao !== "medio" && (
                    <Badge variant="outline" className="text-[10px] h-4">
                      {r.nivel_pressao}
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
