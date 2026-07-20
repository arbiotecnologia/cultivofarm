import { useMemo, useState } from "react";
import { useOutletContext, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateDisplay } from "@/lib/date-utils";
import { usePartnerSimulationItems, type PartnerSimulationStatus } from "@/hooks/usePartnerSimulations";
import { FlaskConical, Filter, Download } from "lucide-react";
import { generateSimulacaoPdf } from "@/lib/pdf/simulacaoPdf";
import { useAuth } from "@/hooks/useAuth";
import { DetalheSimulacaoDrawer } from "@/components/pedidos-b2b/DetalheSimulacaoDrawer";

const STATUS_LABEL: Record<PartnerSimulationStatus, string> = {
  rascunho: "Rascunho",
  enviada_gestor: "Enviada ao gestor",
  convertida_pedido: "Convertida em pedido",
  arquivada: "Arquivada",
};

const STATUS_VARIANT: Record<PartnerSimulationStatus, "outline" | "secondary" | "default"> = {
  rascunho: "outline",
  enviada_gestor: "default",
  convertida_pedido: "secondary",
  arquivada: "outline",
};

export default function SimulacoesEquipe() {
  const { partner } = useOutletContext<{ partner: any }>();
  const [statusFilter, setStatusFilter] = useState<string>("todas");
  const [tecnicoFilter, setTecnicoFilter] = useState<string>("todos");
  const [buscaData, setBuscaData] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const convertMutation = useMutation({
    mutationFn: async (simId: string) => {
      const { data, error } = await supabase.rpc(
        "convert_partner_simulation_to_order_secure" as any,
        { p_simulation_id: simId },
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: (orderId) => {
      toast.success("Simulação convertida em pedido");
      qc.invalidateQueries({ queryKey: ["partner-simulations-equipe"] });
      navigate(`/portal-parceiro/pedidos?highlight=${orderId}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao converter"),
  });

  const archiveMutation = useMutation({
    mutationFn: async (simId: string) => {
      const { error } = await supabase.rpc(
        "archive_partner_simulation_secure" as any,
        { p_simulation_id: simId, p_reason: null },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Simulação arquivada");
      qc.invalidateQueries({ queryKey: ["partner-simulations-equipe"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao arquivar"),
  });

  const { data: sims = [], isLoading } = useQuery({
    queryKey: ["partner-simulations-equipe", partner?.id],
    enabled: !!partner?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_simulations" as any)
        .select("*, partner_simulation_items(count)")
        .eq("partner_id", partner!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        items_count: r.partner_simulation_items?.[0]?.count ?? 0,
      }));
    },
  });

  const creatorIds = useMemo(
    () => Array.from(new Set(sims.map((s: any) => s.created_by).filter(Boolean))),
    [sims],
  );

  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-by-user-id", creatorIds],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome, email")
        .in("user_id", creatorIds as string[]);
      if (error) throw error;
      const map: Record<string, { nome: string | null; email: string | null }> = {};
      (data ?? []).forEach((p: any) => {
        map[p.user_id] = { nome: p.nome, email: p.email };
      });
      return map;
    },
  });

  const tecnicoLabel = (uid: string) =>
    profilesMap[uid]?.nome || profilesMap[uid]?.email || `Técnico ${String(uid).slice(0, 8)}`;

  const tecnicos = useMemo(() => {
    const map = new Map<string, string>();
    sims.forEach((s: any) => map.set(s.created_by, tecnicoLabel(s.created_by)));
    return Array.from(map.entries());
  }, [sims, profilesMap]);


  const filtered = useMemo(() => {
    return sims.filter((s: any) => {
      if (statusFilter !== "todas" && s.status !== statusFilter) return false;
      if (tecnicoFilter !== "todos" && s.created_by !== tecnicoFilter) return false;
      if (buscaData && !String(s.created_at).startsWith(buscaData)) return false;
      return true;
    });
  }, [sims, statusFilter, tecnicoFilter, buscaData]);

  const metrics = useMemo(() => {
    const total = sims.length;
    const rascunho = sims.filter((s: any) => s.status === "rascunho").length;
    const enviadas = sims.filter((s: any) => s.status === "enviada_gestor").length;
    const convertidas = sims.filter((s: any) => s.status === "convertida_pedido").length;
    const taxa = total ? Math.round((convertidas / total) * 100) : 0;
    return { total, rascunho, enviadas, convertidas, taxa };
  }, [sims]);


  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" /> Simulações da Equipe
        </h1>
        <p className="text-sm text-muted-foreground">
          Simulações técnicas dos parceiros. Converta em pedido para aplicar a condição comercial do parceiro.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <MetricCard label="Total" value={metrics.total} />
        <MetricCard label="Rascunho" value={metrics.rascunho} />
        <MetricCard label="Enviadas" value={metrics.enviadas} tone="primary" />
        <MetricCard label="Convertidas" value={metrics.convertidas} tone="success" />
        <MetricCard label="Taxa conv." value={`${metrics.taxa}%`} tone="success" />
      </div>


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviada_gestor">Enviada ao gestor</SelectItem>
              <SelectItem value="convertida_pedido">Convertida em pedido</SelectItem>
              <SelectItem value="arquivada">Arquivada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tecnicoFilter} onValueChange={setTecnicoFilter}>
            <SelectTrigger><SelectValue placeholder="Técnico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos técnicos</SelectItem>
              {tecnicos.map(([id, label]) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={buscaData}
            onChange={(e) => setBuscaData(e.target.value)}
            placeholder="Data"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{filtered.length} simulaç{filtered.length === 1 ? "ão" : "ões"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground py-6 text-center">Carregando...</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma simulação encontrada.</div>
          )}
          {filtered.map((s: any) => (
            <div key={s.id} className="border rounded-md p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate flex items-center gap-2">
                  {s.titulo ?? "Simulação sem título"}
                  <Badge variant={STATUS_VARIANT[s.status as PartnerSimulationStatus]}>
                    {STATUS_LABEL[s.status as PartnerSimulationStatus] ?? s.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  <span>{formatDateDisplay(s.created_at)}</span>
                  <span>{s.items_count} itens</span>
                  {s.cliente_nome_snapshot && <span>Produtor: <strong>{s.cliente_nome_snapshot}</strong></span>}
                  {s.cultura && <span>Cultura: {s.cultura}</span>}
                  {s.area_total_ha != null && <span>{Number(s.area_total_ha).toFixed(2)} ha</span>}
                  <span>Total tabela: R$ {Number(s.total_cheio ?? 0).toFixed(2)}</span>
                </div>
                {s.objetivo_tecnico && (
                  <div className="text-xs mt-1 line-clamp-2"><strong>Objetivo:</strong> {s.objetivo_tecnico}</div>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDetalheId(s.id)}>Ver detalhes</Button>
                {s.status === "convertida_pedido" && s.converted_order_id ? (
                  <Button size="sm" asChild>
                    <Link to={`/portal-parceiro/pedidos?highlight=${s.converted_order_id}`}>Ver pedido</Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={convertMutation.isPending}
                    onClick={() => convertMutation.mutate(s.id)}
                  >
                    {convertMutation.isPending ? "Convertendo..." : "Converter em pedido"}
                  </Button>
                )}
                {s.status !== "convertida_pedido" && s.status !== "arquivada" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={archiveMutation.isPending}
                    onClick={() => {
                      if (confirm("Arquivar esta simulação?")) archiveMutation.mutate(s.id);
                    }}
                  >
                    Arquivar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <SimulacaoDrawerComPdf
        detalheId={detalheId}
        onOpenChange={(v) => !v && setDetalheId(null)}
        sims={sims}
      />
    </div>
  );
}

function SimulacaoDrawerComPdf({
  detalheId,
  onOpenChange,
  sims,
}: {
  detalheId: string | null;
  onOpenChange: (open: boolean) => void;
  sims: any[];
}) {
  const sim = detalheId ? sims.find((s) => s.id === detalheId) : null;
  const { partner } = useOutletContext<{ partner: any }>();
  const { profile, role } = useAuth();
  const { data: items = [] } = usePartnerSimulationItems(detalheId);
  const { data: tecnicoProfile } = useQuery({
    queryKey: ["profile-by-user-id", sim?.created_by],
    enabled: !!sim?.created_by,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome, email")
        .eq("user_id", sim.created_by)
        .maybeSingle();
      return data as { nome: string | null; email: string | null } | null;
    },
  });

  const tecnicoNome = sim
    ? tecnicoProfile?.nome || tecnicoProfile?.email || String(sim.created_by).slice(0, 8)
    : "";

  const handleDownloadPdf = async () => {
    if (!sim) return;
    const { blobUrl, filename } = await generateSimulacaoPdf({
      simulacao: sim,
      parceiro_nome: partner?.nome_fantasia ?? partner?.razao_social ?? null,
      tecnico_nome: tecnicoNome,
      baixado_por: { nome: profile?.nome, email: profile?.email, perfil: role },
      itens: items as any[],
    });
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  };

  return (
    <DetalheSimulacaoDrawer
      simulationId={detalheId}
      open={!!detalheId}
      onOpenChange={onOpenChange}
      viewerScope="parceiro_gestor"
      extraHeaderActions={
        <Button size="sm" variant="outline" onClick={handleDownloadPdf} disabled={!sim}>
          <Download className="h-4 w-4 mr-1" /> Baixar PDF
        </Button>
      }
    />
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number | string; tone?: "primary" | "success" }) {
  const toneClass =
    tone === "primary" ? "text-primary" : tone === "success" ? "text-emerald-600" : "text-foreground";
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
