
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
import { isBefore, isToday, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateDisplay } from "@/lib/date-utils";
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
  const [filter, setFilter] = useState<"all" | "overdue" | "expiring">("all");
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [newDate, setNewDate] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);

  useEffect(() => {
    document.title = "Alertas de Monitoramento | AR Bio";
  }, []);

  const { data: alertas = [], isLoading } = useQuery({
    queryKey: ["alertas-monitoramento-gestor"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
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
      const { error: alertError } = await (supabase as any)
        .from("alertas_agronomicos")
        .update({ 
          data_vencimento: date,
          nivel_risco: "medio", // Reset risk when rescheduled
          updated_at: new Date().toISOString()
        } as any)
        .eq("id", id);

      if (alertError) throw alertError;

      if (registroId) {
        const { error: regError } = await (supabase as any)
          .from("registros_consultor")
          .update({ data_proxima_visita: date } as any)
          .eq("id", registroId);
        if (regError) throw regError;
      }
    },
    onSuccess: () => {
      toast.success("Monitoramento reprogramado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["alertas-monitoramento-gestor"] });
      setSelectedAlert(null);
      setIsRescheduling(false);
    },
    onError: (err: any) => {
      toast.error("Erro ao reprogramar: " + err.message);
    }
  });

  const filteredAlertas = alertas.filter((a) => {
    const clienteNome = (a as any).talhoes?.fazendas?.clientes?.nome || "";
    const fazendaNome = (a as any).fazendas?.nome || "";
    const talhaoNome = (a as any).talhoes?.nome || "";
    
    const matchesSearch = 
      clienteNome.toLowerCase().includes(search.toLowerCase()) ||
      fazendaNome.toLowerCase().includes(search.toLowerCase()) ||
      talhaoNome.toLowerCase().includes(search.toLowerCase()) ||
      (a as any).descricao?.toLowerCase().includes(search.toLowerCase());

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = (a as any).data_vencimento ? parseISO((a as any).data_vencimento) : null;

    let matchesFilter = true;
    if (filter === "overdue") {
      matchesFilter = dueDate ? isBefore(dueDate, today) : false;
    } else if (filter === "expiring") {
      const tomorrow = addDays(today, 1);
      matchesFilter = dueDate ? (isToday(dueDate) || isToday(isBefore(dueDate, tomorrow) ? dueDate : today)) : false;
      // Simplified "vencendo" (today or tomorrow)
      if (dueDate) {
        const d = new Date(dueDate);
        d.setHours(0,0,0,0);
        const t = new Date(today);
        const tom = new Date(today);
        tom.setDate(tom.getDate() + 2);
        matchesFilter = d >= t && d < tom;
      }
    }

    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (date: string) => {
    if (!date) return <Badge variant="outline">Sem data</Badge>;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = parseISO(date);
    
    if (isBefore(d, today)) {
      return <Badge variant="destructive" className="animate-pulse">Vencido</Badge>;
    }
    if (isToday(d)) {
      return <Badge variant="default" className="bg-amber-500">Vence hoje</Badge>;
    }
    const tomorrow = addDays(today, 1);
    if (d.toDateString() === tomorrow.toDateString()) {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-700">Vence amanhã</Badge>;
    }
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200">Em dia</Badge>;
  };

  const handleReschedule = () => {
    if (!newDate) {
      toast.error("Selecione uma nova data");
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
            <div className="text-2xl font-bold text-destructive">
              {alertas.filter(a => a.data_vencimento && isBefore(parseISO(a.data_vencimento), new Date().setHours(0,0,0,0))).length}
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
            <div className="text-2xl font-bold text-amber-700">
              {alertas.filter(a => {
                if (!a.data_vencimento) return false;
                const d = parseISO(a.data_vencimento);
                const t = new Date(); t.setHours(0,0,0,0);
                const tom = new Date(); tom.setDate(tom.getDate() + 2); tom.setHours(0,0,0,0);
                return d >= t && d < tom;
              }).length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Total em monitoramento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{alertas.length}</div>
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
                key={(a as any).id}
                title={(a as any).talhoes?.fazendas?.clientes?.nome || "Cliente"}
                subtitle={`${(a as any).fazendas?.nome} • ${(a as any).talhoes?.nome}`}
                status={getStatusBadge((a as any).data_vencimento)}
                content={[
                  { label: "Vencimento", value: (a as any).data_vencimento ? formatDateDisplay((a as any).data_vencimento) : "—" },
                  { label: "Tipo", value: (a as any).tipo_alerta?.toUpperCase() },
                  { label: "Descrição", value: (a as any).descricao },
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
                      <tr key={(a as any).id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {(a as any).talhoes?.fazendas?.clientes?.nome || "Cliente"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {(a as any).fazendas?.nome} • {(a as any).talhoes?.nome}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(a as any).data_vencimento ? formatDateDisplay((a as any).data_vencimento) : "—"}
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
