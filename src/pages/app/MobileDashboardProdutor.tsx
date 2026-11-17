import { useAuth } from "@/hooks/useAuth";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  Layers,
  FileText,
  ClipboardList,
  Truck,
  PackageCheck,
  Droplets,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { LogoDisplay } from "@/components/LogoDisplay";
import { MinhasCampanhas } from "@/components/portal/MinhasCampanhas";

export default function MobileDashboardProdutor() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { config, defaults } = useSystemConfig();
  const { clienteId } = usePortalCliente();
  const nomeEmpresa = config?.nome_empresa || defaults.nome_empresa;
  const logoUrl = config?.logo_url || null;

  const { data: talhoes } = useScopedPortalQuery({
    queryKey: ["mobile-prod-talhoes", clienteId],
    queryFn: async (signal) => {
      if (!clienteId) return 0;
      const { count } = await supabase
        .from("talhoes")
        .select("*, fazendas!inner(cliente_id)", { count: "exact", head: true })
        .eq("fazendas.cliente_id", clienteId).abortSignal(signal);
      return count || 0;
    },
    enabled: !!clienteId,
  });

  const { data: recomendacoes } = useScopedPortalQuery({
    queryKey: ["mobile-prod-recom", clienteId],
    queryFn: async (signal) => {
      if (!clienteId) return 0;
      const { count } = await supabase
        .from("registros_consultor")
        .select("*", { count: "exact", head: true })
        .eq("cliente_id", clienteId)
        .in("status", ["aprovado", "convertido_os"]).abortSignal(signal);
      return count || 0;
    },
    enabled: !!clienteId,
  });

  const { data: osAtivas } = useScopedPortalQuery({
    queryKey: ["mobile-prod-os", clienteId],
    queryFn: async (signal) => {
      if (!clienteId) return 0;
      const { count } = await supabase
        .from("ordens_servico")
        .select("*", { count: "exact", head: true })
        .eq("cliente_id", clienteId)
        .not("status", "in", '("finalizada","entregue")').abortSignal(signal);
      return count || 0;
    },
    enabled: !!clienteId,
  });

  const { data: entregasPendentes } = useScopedPortalQuery({
    queryKey: ["mobile-prod-entregas", clienteId],
    queryFn: async (signal) => {
      if (!clienteId) return 0;
      const { count } = await supabase
        .from("entregas")
        .select("*", { count: "exact", head: true })
        .eq("cliente_id", clienteId)
        .neq("status", "entregue").abortSignal(signal);
      return count || 0;
    },
    enabled: !!clienteId,
  });

  const { data: entregasRealizadas } = useScopedPortalQuery({
    queryKey: ["mobile-prod-entregas-realizadas", clienteId],
    queryFn: async (signal) => {
      if (!clienteId) return 0;
      const { count } = await supabase
        .from("entregas")
        .select("*", { count: "exact", head: true })
        .eq("cliente_id", clienteId)
        .eq("status", "entregue").abortSignal(signal);
      return count || 0;
    },
    enabled: !!clienteId,
  });

  const { data: aplicacoes } = useScopedPortalQuery({
    queryKey: ["mobile-prod-aplicacoes", clienteId],
    queryFn: async (signal) => {
      if (!clienteId) return 0;
      const { count } = await supabase
        .from("aplicacoes")
        .select("*, ordens_servico!inner(cliente_id)", { count: "exact", head: true })
        .eq("ordens_servico.cliente_id", clienteId).abortSignal(signal);
      return count || 0;
    },
    enabled: !!clienteId,
  });

  const stats = [
    { label: "Talhões", value: talhoes ?? "—", icon: Layers, color: "text-emerald-600 bg-emerald-50" },
    { label: "Recomendações", value: recomendacoes ?? "—", icon: FileText, color: "text-purple-600 bg-purple-50" },
    { label: "OS Ativas", value: osAtivas ?? "—", icon: ClipboardList, color: "text-sky-600 bg-sky-50" },
    { label: "Entregas Pendentes", value: entregasPendentes ?? "—", icon: Truck, color: "text-orange-600 bg-orange-50" },
    { label: "Produtos Entregues", value: entregasRealizadas ?? "—", icon: PackageCheck, color: "text-emerald-600 bg-emerald-50" },
    { label: "Aplicações", value: aplicacoes ?? "—", icon: Droplets, color: "text-cyan-600 bg-cyan-50" },
  ];

  const menuItems = [
    { label: "Recomendações", path: "/app/recomendacoes", icon: FileText },
    { label: "Ordens de Serviço", path: "/app/ordens", icon: ClipboardList },
    { label: "Entregas", path: "/app/entregas", icon: Truck },
    { label: "Histórico de Aplicações", path: "/app/aplicacoes/lista", icon: Droplets },
    { label: "Solicitar Atendimento", path: "/app/solicitar", icon: HelpCircle },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <LogoDisplay size="md" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Olá, produtor</p>
          <h1 className="text-lg font-bold text-foreground truncate">
            {profile?.nome || "Bem-vindo"}
          </h1>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </Card>
        ))}
      </div>

      <MinhasCampanhas compact />

      {/* Menu */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Menu
        </h2>
        <div className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border active:bg-muted transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="flex-1 text-left font-medium text-foreground">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
