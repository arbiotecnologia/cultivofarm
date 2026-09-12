
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { 
  Search, Calendar, Filter, AlertTriangle, Clock, 
  ChevronRight, ArrowRight, CheckCircle2, RefreshCw, X, Eye
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateDisplay } from "@/lib/date-utils";
import {
  calcularIndicadores,
  classificarVencimento,
  filtrarAlertas,
  hojeSaoPaulo,
  podeReprogramar,
  ROTULO_VENCIMENTO,
  textoOuTraco,
  toDataCivil,
  validarNovaData,
  type FiltroAlerta,
} from "@/lib/monitoramento/alertas";

import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function MonitoramentoAlertas() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FiltroAlerta>("all");
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [newDate, setNewDate] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);

  const hoje = hojeSaoPaulo();

  useEffect(() => {
    document.title = "Alertas de Monitoramento | AR Bio";
  }, []);

  const {
    data: alertas = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["alertas-monitoramento-gestor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas_agronomicos")
        .select(`
          *,
          fazendas:fazenda_id(nome),
          talhoes:talhao_id(nome, fazendas:fazenda_id(clientes:cliente_id(nome)))
        `)
        .eq("status", "monitoramento")
        .order("data_vencimento", { ascending: true })
        .limit(200);

      if (error) throw error;
      return data || [];
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, date, registroId }: { id: string; date: string; registroId?: string }) => {
      // Atualização condicionada ao status: se outro usuário concluiu o
      // monitoramento nesse intervalo, nenhuma linha é afetada e abortamos.
      const { data: updated, error: alertError } = await supabase
        .from("alertas_agronomicos")
        .update({
          data_vencimento: date,
          nivel_risco: "medio", // Reset risk when rescheduled
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .eq("status", "monitoramento")
        .select("id");

      if (alertError) throw alertError;
      if (!updated || updated.length === 0) {
        throw new Error(
          "Este monitoramento já foi concluído ou alterado por outro usuário. Atualize a lista.",
        );
      }

      if (registroId) {
        const { error: regError } = await supabase
          .from("registros_consultor")
          .update({ data_proxima_visita: date })
          .eq("id", registroId);
        if (regError) throw regError;
      }
    },
    onSuccess: () => {
      toast.success("Monitoramento reprogramado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["alertas-monitoramento-gestor"] });
      setSelectedAlert(null);
      setNewDate("");
      setIsRescheduling(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Não foi possível reprogramar o monitoramento.");
      queryClient.invalidateQueries({ queryKey: ["alertas-monitoramento-gestor"] });
    }
  });

  const filteredAlertas = filtrarAlertas(alertas as any[], {
    busca: search,
    filtro: filter,
    hoje,
  });

  const indicadores = calcularIndicadores(filteredAlertas, hoje);

  const getStatusBadge = (date: unknown) => {
    const classificacao = classificarVencimento(date, hoje);
    const rotulo = ROTULO_VENCIMENTO[classificacao];
    if (classificacao === "sem_data") return <Badge variant="outline">{rotulo}</Badge>;
    if (classificacao === "vencido") {
      return <Badge variant="destructive" className="animate-pulse">{rotulo}</Badge>;
    }
    if (classificacao === "hoje") {
      return <Badge variant="default" className="bg-amber-500">{rotulo}</Badge>;
    }
    if (classificacao === "amanha") {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-700">{rotulo}</Badge>;
    }
    return (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200">
        {rotulo}
      </Badge>
    );
  };

  const validacaoData = selectedAlert
    ? validarNovaData(newDate, hoje, selectedAlert.data_vencimento)
    : { ok: false as const };

  const abrirReprogramacao = (alerta: any) => {
    if (!podeReprogramar(alerta?.status)) {
      toast.error("Este monitoramento não está mais em aberto.");
      return;
    }
    setSelectedAlert(alerta);
    setNewDate(toDataCivil(alerta?.data_vencimento) || "");
    setIsRescheduling(true);
  };

  const handleReschedule = () => {
    if (rescheduleMutation.isPending) return;
    if (!selectedAlert) return;
    if (!podeReprogramar(selectedAlert.status)) {
      toast.error("Este monitoramento não está mais em aberto.");
      return;
    }
    const validacao = validarNovaData(newDate, hoje, selectedAlert.data_vencimento);
    if (!validacao.ok) {
      toast.error(validacao.erro);
      return;
    }
    rescheduleMutation.mutate({
      id: selectedAlert.id,
      date: newDate,
      registroId: selectedAlert.registro_origem_id
    });
  };


  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Alertas de Monitoramento"
        description="Gestão de reavaliações técnicas pendentes ou vencidas"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" aria-live="polite">
              {indicadores.vencidos}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700">
              <Clock className="h-4 w-4" /> Vencendo hoje/amanhã
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700" aria-live="polite">
              {indicadores.vencendo}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Em monitoramento (filtro atual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700" aria-live="polite">
              {indicadores.total}
            </div>
          </CardContent>
        </Card>
      </div>


      <Card>
        <CardHeader className="pb-3 border-b mb-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Filtrar por cliente, fazenda ou talhão..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                className="pl-9 h-10"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button 
                variant={filter === "all" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setFilter("all")}
                className="flex-1 sm:flex-none"
              >
                Todos
              </Button>
              <Button 
                variant={filter === "overdue" ? "destructive" : "outline"} 
                size="sm" 
                onClick={() => setFilter("overdue")}
                className="flex-1 sm:flex-none"
              >
                Vencidos
              </Button>
              <Button 
                variant={filter === "expiring" ? "secondary" : "outline"} 
                size="sm" 
                onClick={() => setFilter("expiring")}
                className="flex-1 sm:flex-none bg-amber-100 text-amber-800 hover:bg-amber-200"
              >
                Vencendo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            mobileCards={filteredAlertas.map((a) => (
              <MobileCard
                key={a.id}
                title={(a.talhoes as any)?.fazendas?.clientes?.nome || "Cliente"}
                subtitle={`${(a.fazendas as any)?.nome} • ${(a.talhoes as any)?.nome}`}
                status={getStatusBadge(a.data_vencimento)}
                content={[
                  { label: "Vencimento", value: a.data_vencimento ? formatDateDisplay(a.data_vencimento) : "—" },
                  { label: "Tipo", value: a.tipo_alerta?.toUpperCase() },
                  { label: "Descrição", value: a.descricao },
                ]}
                actions={
                  <div className="flex gap-2 w-full mt-2">
                    <Button 
                      variant="outline" 
                      className="flex-1" 
                      size="sm"
                      onClick={() => {
                        setSelectedAlert(a);
                        setNewDate(a.data_vencimento || "");
                        setIsRescheduling(true);
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" /> Reprogramar
                    </Button>
                    <Button 
                      className="flex-1" 
                      size="sm"
                      onClick={() => navigate(`/visita-tecnica/${a.registro_origem_id || ""}${a.registro_origem_id ? "?tab=roteiro" : ""}`)}
                      disabled={!a.registro_origem_id}
                    >
                      <Eye className="h-4 w-4 mr-2" /> Ver Roteiro
                    </Button>
                  </div>
                }
              />
            ))}
          >
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente / Fazenda / Talhão</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencimento</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAlertas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground italic">
                        Nenhum monitoramento pendente encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredAlertas.map((a) => (
                      <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {(a.talhoes as any)?.fazendas?.clientes?.nome || "Cliente"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {(a.fazendas as any)?.nome} • {(a.talhoes as any)?.nome}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.data_vencimento ? formatDateDisplay(a.data_vencimento) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(a.data_vencimento)}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate" title={a.descricao}>
                          {a.descricao}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Reprogramar"
                              onClick={() => {
                                setSelectedAlert(a);
                                setNewDate(a.data_vencimento || "");
                                setIsRescheduling(true);
                              }}
                            >
                              <RefreshCw className="h-4 w-4 text-primary" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Ver Roteiro da visita de origem"
                              onClick={() => navigate(`/visita-tecnica/${a.registro_origem_id || ""}${a.registro_origem_id ? "?tab=roteiro" : ""}`)}
                              disabled={!a.registro_origem_id}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ResponsiveTable>
        </CardContent>
      </Card>

      <Dialog open={isRescheduling} onOpenChange={setIsRescheduling}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reprogramar Monitoramento</DialogTitle>
            <DialogDescription>
              Ajuste a data da próxima avaliação para este talhão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="date">Nova data de reavaliação</Label>
              <Input
                id="date"
                type="date"
                value={newDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            {selectedAlert && (
              <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
                <p><strong>Cliente:</strong> {(selectedAlert.talhoes as any)?.fazendas?.clientes?.nome}</p>
                <p><strong>Fazenda:</strong> {selectedAlert.fazendas?.nome}</p>
                <p><strong>Talhão:</strong> {selectedAlert.talhoes?.nome}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRescheduling(false)}>Cancelar</Button>
            <Button onClick={handleReschedule} disabled={rescheduleMutation.isPending}>
              {rescheduleMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Nova Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
