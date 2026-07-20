import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Layers,
  AlertTriangle,
  FileText,
  ClipboardList,
  Truck,
  PackageCheck,
  ChevronRight,
  Droplets,
} from "lucide-react";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { LogoDisplay } from "@/components/LogoDisplay";

export default function MobileDashboardConsultor() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { config, defaults } = useSystemConfig();
  const nomeEmpresa = config?.nome_empresa || defaults.nome_empresa;
  const logoUrl = config?.logo_url || null;

  const { data: fazendas } = useQuery({
    queryKey: ["mobile-fazendas-count"],
    queryFn: async () => {
      const { count } = await supabase.from("fazendas").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: talhoes } = useQuery({
    queryKey: ["mobile-talhoes-count"],
    queryFn: async () => {
      const { count } = await supabase.from("talhoes").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: registrosAbertos } = useQuery({
    queryKey: ["mobile-registros-abertos"],
    queryFn: async () => {
      const { count } = await supabase
        .from("registros_consultor")
        .select("*", { count: "exact", head: true })
        .in("status", ["rascunho", "finalizado"]);
      return count || 0;
    },
  });

  const { data: osAndamento } = useQuery({
    queryKey: ["mobile-os-andamento"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ordens_servico")
        .select("*", { count: "exact", head: true })
        .not("status", "in", '("finalizada","entregue")');
      return count || 0;
    },
  });

  const { data: recomendacoes } = useQuery({
    queryKey: ["mobile-recomendacoes-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: entregas } = useQuery({
    queryKey: ["mobile-entregas-pendentes"],
    queryFn: async () => {
      const { count } = await supabase
        .from("entregas")
        .select("*", { count: "exact", head: true })
        .neq("status", "entregue");
      return count || 0;
    },
  });

  const { data: entregasRealizadas } = useQuery({
    queryKey: ["mobile-entregas-realizadas"],
    queryFn: async () => {
      const { count } = await supabase
        .from("entregas")
        .select("*", { count: "exact", head: true })
        .eq("status", "entregue");
      return count || 0;
    },
  });

  const stats = [
    { label: "Fazendas", value: fazendas ?? "—", icon: MapPin, color: "text-emerald-600 bg-emerald-50", path: "/app/fazendas" },
    { label: "Talhões", value: talhoes ?? "—", icon: Layers, color: "text-blue-600 bg-blue-50", path: "/app/fazendas" },
    { label: "Ocorrências", value: registrosAbertos ?? "—", icon: AlertTriangle, color: "text-amber-600 bg-amber-50", path: "/app/registros" },
    { label: "Recomendações", value: recomendacoes ?? "—", icon: FileText, color: "text-purple-600 bg-purple-50", path: "/app/recomendacoes" },
    { label: "OS Ativas", value: osAndamento ?? "—", icon: ClipboardList, color: "text-sky-600 bg-sky-50", path: "/app/ordens" },
    { label: "Entregas Pendentes", value: entregas ?? "—", icon: Truck, color: "text-orange-600 bg-orange-50", path: "/app/entregas" },
    { label: "Produtos Entregues", value: entregasRealizadas ?? "—", icon: PackageCheck, color: "text-emerald-600 bg-emerald-50", path: "/app/entregas" },
  ];

  const quickActions = [
    { label: "Registrar Ocorrência", path: "/app/registrar", icon: AlertTriangle },
    { label: "Ver Fazendas", path: "/app/fazendas", icon: MapPin },
    { label: "Ordens de Serviço", path: "/app/ordens", icon: ClipboardList },
    { label: "Histórico de Aplicações", path: "/app/aplicacoes/lista", icon: Droplets },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <LogoDisplay size="md" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Olá, consultor</p>
          <h1 className="text-lg font-bold text-foreground truncate">
            {profile?.nome || "Bem-vindo"}
          </h1>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="p-3 cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => navigate(stat.path)}
          >
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

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Ações Rápidas
        </h2>
        <div className="space-y-2">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border active:bg-muted transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <action.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="flex-1 text-left font-medium text-foreground">{action.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
