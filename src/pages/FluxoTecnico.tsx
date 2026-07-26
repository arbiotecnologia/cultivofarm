import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import {
  CheckCircle, XCircle, MessageSquare, Eye, ArrowRightCircle,
  Clock, AlertTriangle, Factory, Truck, ClipboardCheck, Search,
  FileText, Package, Sprout, RotateCcw, Activity, History, Lock
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusStepper } from "@/components/visita/StatusStepper";
import { rowClickProps, stopRowClick } from "@/lib/rowClick";
import { OSFlowTimeline } from "@/components/visita/OSFlowTimeline";
import {
  canTransition,
  getBlockReason,
  showTransitionErrorToast,
  STATUS_LABEL_REGISTRO,
  type RegistroStatus,
} from "@/lib/registroTransitions";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { parseConduta } from "@/lib/condutaSerializer";
import { parseNotes } from "@/components/visita/NotasRapidas";
import { getClienteLabel } from "@/lib/clienteLabel";
import { formatDateDisplay } from "@/lib/date-utils";
import { RecomendacaoChat } from "@/components/shared/RecomendacaoChat";

const STATUS_APROVACAO: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  aprovado: { label: "Aprovado", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  reprovado: { label: "Reprovado", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  solicitar_ajuste: { label: "Ajuste Solicitado", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
};

const STATUS_OS_ONFARM: Record<string, { label: string; color: string; icon: any }> = {
  aberta: { label: "Aberta", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: FileText },
  aprovada: { label: "Aprovada", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle },
  programada: { label: "Programada", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: Clock },
  em_producao: { label: "Em Produção", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400", icon: Factory },
  em_cq: { label: "Controle Qualidade", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400", icon: ClipboardCheck },
  envase: { label: "Envase", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400", icon: Package },
  pronto_entrega: { label: "Pronto Entrega", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: Truck },
  entregue: { label: "Entregue", color: "bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300", icon: CheckCircle },
  finalizada: { label: "Finalizada", color: "bg-muted text-muted-foreground", icon: CheckCircle },
  cancelada: { label: "Cancelada", color: "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300", icon: XCircle },
};

const PRESSAO_MAP: Record<string, { label: string; color: string }> = {
  baixo: { label: "Baixo", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  medio: { label: "Médio", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  alto: { label: "Alto", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  severo: { label: "Severo", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const URGENCIA_MAP: Record<string, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica",
};

const OS_TIMELINE_STEPS = ["aberta", "aprovada", "programada", "em_producao", "em_cq", "envase", "pronto_entrega", "entregue", "finalizada"];
const pieColors = [
  "hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#f97316", "#14b8a6",
];
const chartConfig = { value: { label: "Quantidade", color: "hsl(var(--primary))" } };

export default function FluxoTecnico() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedRegistro, setSelectedRegistro] = useState<any>(null);
  const [showReview, setShowReview] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; type: string }>({ open: false, type: "" });
  const [comentario, setComentario] = useState("");
  const [selectedOSId, setSelectedOSId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const isAdmin = role === "administrador";
  const isGestor = role === "gestor";
  
  const { data: pendentes = [], refetch: refetchPendentes } = useQuery({
    queryKey: ["fluxo-pendentes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("registros_consultor")
        .select("*, clientes(nome, codigo_cliente), fazendas(nome), talhoes(nome), culturas(nome)")
        .eq("status", "enviado_aprovacao")
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 300000,
  });

  const { data: aprovacoes = [], refetch: refetchAprovacoes } = useQuery({
    queryKey: ["aprovacoes-todas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("aprovacoes_tecnicas")
        .select("*, aprovado_por_perfil:aprovado_por(nome), registros_consultor(*, clientes(nome, codigo_cliente), fazendas(nome), talhoes(nome), culturas(nome))")
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 300000,
  });

  const { data: ordensOnFarm = [], refetch: refetchOS } = useQuery({
    queryKey: ["os-onfarm"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_servico_onfarm")
        .select("*, clientes(nome, codigo_cliente), fazendas(nome), talhoes(nome), produtos(nome), programacao_producao!ordem_servico_onfarm_id(lotes(id, status, controle_qualidade(resultado)))")
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 300000,
  });

  const { data: allRegistros = [] } = useQuery({
    queryKey: ["all-registros-dashboard"],
    queryFn: async () => {
      const { data } = await supabase
        .from("registros_consultor")
        .select("*, clientes(nome, codigo_cliente), fazendas(nome), culturas(nome)")
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const refetchAll = () => {
    refetchPendentes();
    refetchAprovacoes();
    refetchOS();
    queryClient.invalidateQueries({ queryKey: ["all-registros-dashboard"] });
  };

  const openReview = (registro: any) => {
    setSelectedRegistro(registro);
    setShowReview(true);
  };

  const openAction = (type: string, registro: any) => {
    setSelectedRegistro(registro);
    setComentario("");
    setActionDialog({ open: true, type });
  };

  const approvalMutation = useMutation({
    mutationFn: async ({ registro, type, newStatus, comentario, isReopen }: {
      registro: any; type: string; newStatus: RegistroStatus; comentario: string; isReopen?: boolean;
    }) => {
      const { error: aprError } = await supabase.from("aprovacoes_tecnicas").insert({
        registro_consultor_id: registro.id,
        status_aprovacao: type,
        aprovado_por: user?.id,
        aprovado_por_role: role,
        comentario_gestor: comentario || null,
        data_aprovacao: new Date().toISOString(),
        override: isReopen || false,
      } as any);
      if (aprError) throw aprError;

      const { error: updErr } = await supabase
        .from("registros_consultor")
        .update({ status: newStatus as any })
        .eq("id", registro.id);
      if (updErr) throw updErr;

      await supabase.from("registros_consultor_status_log").insert({
        registro_consultor_id: registro.id,
        status_anterior: registro.status,
        status_novo: newStatus,
        changed_by: user?.id,
        motivo: comentario || null,
      } as any);
      return { type, newStatus };
    },
    onSuccess: (data, variables) => {
      toast.success(`Recomendação ${STATUS_APROVACAO[variables.type]?.label || variables.type}!`);
      setActionDialog({ open: false, type: "" });
      setShowReview(false);
      setSelectedRegistro(null);
      refetchAll();

      if (variables.newStatus === "aprovado") {
        if (variables.registro.proxima_acao_recomendada === "gerar_os") {
          toast.info("Gerando Ordens de Serviço solicitadas...");
          gerarOSMutation.mutate(variables.registro);
        } else if (variables.registro.proxima_acao_recomendada === "emitir_recomendação") {
          (supabase.rpc as any)("rpc_create_portal_notification_secure", {
            _cliente_id: variables.registro.cliente_id,
            _tipo: "informativo",
            _titulo: "Recomendação Técnica Aprovada",
            _mensagem: `Uma nova recomendação técnica para o talhão ${variables.registro.talhoes?.nome || ""} está aguardando sua decisão no Portal.`,
            _link: null,
          }).then();

          if (variables.registro.solicitacao_id) {
            supabase.from("portal_solicitacoes").update({
              status: "aguardando_decisao"
            }).eq("id", variables.registro.solicitacao_id).then();
          }
        }
      }
    },
  });

  const gerarOSMutation = useMutation({
    mutationFn: async (registro: any) => {
      const { data: recs } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("*, produtos(nome, dose_ml_ha)")
        .eq("registro_consultor_id", registro.id);

      if (!recs || recs.length === 0) throw new Error("Nenhuma recomendação encontrada.");

      const urgencia = registro.urgencia;
      const prioridade = urgencia === "critica" ? "alta" : urgencia === "alta" ? "alta" : "media";

      for (const rec of recs) {
        const dose = rec.dose_recomendada_valor || 0;
        const area = registro.area_hectares || 0;
        const volumeTotal = dose * area;

        await supabase.from("ordens_servico_onfarm").insert({
          registro_consultor_id: registro.id,
          cliente_id: registro.cliente_id,
          fazenda_id: registro.fazenda_id,
          talhao_id: registro.talhao_id,
          produto_id: rec.produto_biologico_sugerido_id || null,
          dose_ml_ha: dose,
          area_hectares: area,
          volume_total_ml: volumeTotal,
          modo_aplicacao: rec.modo_aplicacao || null,
          data_recomendada: new Date().toISOString().split("T")[0],
          prioridade: prioridade as any,
          status: "aberta" as any,
        } as any);
      }

      await supabase.from("registros_consultor").update({ status: "convertido_os" as any }).eq("id", registro.id);
    },
    onSuccess: () => { toast.success("OS gerada!"); refetchAll(); }
  });

  const handleApproval = () => {
    if (!selectedRegistro) return;
    const type = actionDialog.type;
    let newStatus: RegistroStatus = "enviado_aprovacao";
    if (type === "aprovado") newStatus = "aprovado";
    if (type === "reprovado") newStatus = "reprovado";
    if (type === "solicitar_ajuste") newStatus = "rascunho";
    
    approvalMutation.mutate({ registro: selectedRegistro, type, newStatus, comentario });
  };

  const handleOSStatusChange = async (osId: string, newStatus: string) => {
      await supabase.from("ordens_servico_onfarm").update({ status: newStatus as any }).eq("id", osId);
      refetchOS();
  };

  const filteredPendentes = pendentes.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.clientes?.nome?.toLowerCase().includes(s) || r.fazendas?.nome?.toLowerCase().includes(s);
  });

  const filteredOS = ordensOnFarm.filter(o => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return o.numero_os?.toLowerCase().includes(s) || o.clientes?.nome?.toLowerCase().includes(s);
  });

  const pendentesCount = pendentes.length;
  const aprovadosCount = aprovacoes.filter((a: any) => a.status_aprovacao === "aprovado").length;
  const osAbertasCount = ordensOnFarm.filter((o: any) => ["aberta", "aprovada", "programada"].includes(o.status)).length;
  const emProducaoCount = ordensOnFarm.filter((o: any) => o.status === "em_producao").length;
  const prontasEntregaCount = ordensOnFarm.filter((o: any) => o.status === "pronto_entrega").length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Fluxo Técnico e Aprovação</h1>
        <p className="text-sm text-muted-foreground">Aprovação de recomendações e acompanhamento de ordens de serviço.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Pendentes" value={pendentesCount} icon={Clock} color="text-yellow-500" />
        <KpiCard label="Aprovadas" value={aprovadosCount} icon={CheckCircle} color="text-green-500" />
        <KpiCard label="OS Abertas" value={osAbertasCount} icon={FileText} color="text-blue-500" />
        <KpiCard label="Em Produção" value={emProducaoCount} icon={Factory} color="text-purple-500" />
        <KpiCard label="Prontas" value={prontasEntregaCount} icon={Truck} color="text-emerald-500" />
      </div>

      <Tabs defaultValue="aprovacoes" className="w-full">
        <TabsList>
          <TabsTrigger value="aprovacoes">Aprovações</TabsTrigger>
          <TabsTrigger value="os-onfarm">OS On-Farm</TabsTrigger>
        </TabsList>
        <TabsContent value="aprovacoes" className="space-y-4 pt-4">
           <div className="flex items-center gap-2">
             <Search className="h-4 w-4 text-muted-foreground" />
             <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
           </div>
           <Card>
             <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fazenda</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                 {filteredPendentes.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma recomendação pendente.</TableCell></TableRow>
                 ) : filteredPendentes.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDateDisplay(r.data_vistoria)}</TableCell>
                      <TableCell>
                        <Badge variant={r.solicitacao_id ? "secondary" : "outline"} className="text-[10px]">
                          {r.solicitacao_id ? "Demanda" : "Rotina"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{r.clientes?.nome}</TableCell>
                      <TableCell>{r.fazendas?.nome}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openReview(r)}><Eye className="h-4 w-4 mr-1" /> Revisar</Button>
                      </TableCell>
                    </TableRow>
                 ))}
              </TableBody>
             </Table>
           </Card>
        </TabsContent>
        <TabsContent value="os-onfarm" className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
               <Input placeholder="Buscar OS..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
               <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Status</SelectItem>
                    {Object.entries(STATUS_OS_ONFARM).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
               </Select>
            </div>
            <Card>
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Nº OS</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                     {filteredOS.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma OS encontrada.</TableCell></TableRow>
                     ) : filteredOS.map((o) => (
                          <TableRow key={o.id}>
                              <TableCell className="font-mono font-bold">{o.numero_os}</TableCell>
                              <TableCell>
                                <Badge variant={o.origem === "recomendacao_tecnica" ? "secondary" : "outline"} className="text-[10px]">
                                  {o.origem === "recomendacao_tecnica" ? "Rec. Técnica" : "Direta"}
                                </Badge>
                              </TableCell>
                              <TableCell>{o.clientes?.nome}</TableCell>
                              <TableCell>
                                <Badge className={STATUS_OS_ONFARM[o.status]?.color}>{STATUS_OS_ONFARM[o.status]?.label || o.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => { setSelectedOSId(o.id); setShowHistory(true); }}><History className="h-4 w-4" /></Button>
                              </TableCell>
                          </TableRow>
                     ))}
                  </TableBody>
              </Table>
            </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={showReview} onOpenChange={setShowReview}>
         <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader><SheetTitle>Revisão Técnica</SheetTitle></SheetHeader>
            {selectedRegistro && (
              <div className="space-y-6 mt-6">
                <div className="space-y-2">
                  <h3 className="font-bold flex items-center gap-2"><Sprout className="h-4 w-4" /> Diagnóstico</h3>
                  <div className="text-sm grid grid-cols-2 gap-2">
                    <div className="col-span-2 font-medium text-lg">{selectedRegistro.clientes?.nome}</div>
                    <div className="text-muted-foreground">Fazenda:</div><div>{selectedRegistro.fazendas?.nome}</div>
                    <div className="text-muted-foreground">Talhão:</div><div>{selectedRegistro.talhoes?.nome}</div>
                  </div>
                </div>
                <Separator />
                <ChatRecomendacoesRegistro registroId={selectedRegistro.id} />
                <Separator />
                <div className="flex flex-col gap-2">
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => openAction("aprovado", selectedRegistro)}><CheckCircle className="mr-2 h-4 w-4" /> Aprovar Recomendação</Button>
                  <Button variant="outline" className="text-orange-600 border-orange-300" onClick={() => openAction("solicitar_ajuste", selectedRegistro)}><MessageSquare className="mr-2 h-4 w-4" /> Solicitar Ajuste</Button>
                  <Button variant="outline" className="text-red-600 border-red-300" onClick={() => openAction("reprovado", selectedRegistro)}><XCircle className="mr-2 h-4 w-4" /> Reprovar</Button>
                </div>
              </div>
            )}
         </SheetContent>
      </Sheet>

      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
          <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="capitalize">{actionDialog.type.replace('_', ' ')}</DialogTitle>
                <DialogDescription>Confirma a ação para esta recomendação técnica?</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label>Observações (obrigatório se não for aprovação)</Label>
                <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Descreva o motivo..." className="mt-1" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionDialog({ open: false, type: "" })}>Cancelar</Button>
                <Button onClick={handleApproval} disabled={approvalMutation.isPending}>
                  {approvalMutation.isPending ? "Processando..." : "Confirmar"}
                </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }: any) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <h3 className="text-2xl font-bold mt-1">{value}</h3>
        </div>
        <Icon className={`h-8 w-8 ${color} opacity-20`} />
      </CardContent>
    </Card>
  );
}

function ChatRecomendacoesRegistro({ registroId }: { registroId: string }) {
  const { data: recs = [] } = useQuery({
    queryKey: ["recs_chat_registro", registroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("id")
        .eq("registro_consultor_id", registroId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  if (recs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        A conversa com o produtor será habilitada após salvar a recomendação.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-bold flex items-center gap-2 text-sm">
        <MessageSquare className="h-4 w-4" /> Conversa com o produtor
      </h3>
      <RecomendacaoChat recomendacaoId={recs[0].id} defaultOpen compact />
    </div>
  );
}
