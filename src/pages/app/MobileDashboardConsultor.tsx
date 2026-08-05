import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  AlertTriangle,
  ClipboardList,
  ChevronRight,
  Inbox,
  PlayCircle,
  Clock,
  Repeat,
  CheckCircle2,
} from "lucide-react";
import { LogoDisplay } from "@/components/LogoDisplay";
import { getPortalGreetingLabel } from "@/lib/portalDisplayLabel";
import { getActivePortalContext } from "@/lib/activePortalContext";
import { useAtendimentosResumo } from "@/hooks/useAtendimentosTecnicos";

/**
 * Painel do portal técnico (consultor técnico / técnico agrônomo).
 *
 * Todos os contadores vêm de `rpc_resumo_atendimentos_tecnicos_v1`, a mesma
 * fonte da listagem de atendimentos — nenhuma contagem é derivada no cliente
 * nem consulta tabelas diretamente. Todas as rotas apontam para o workspace
 * técnico (`/app/atendimentos`), nunca para telas exclusivas do produtor.
 */
export default function MobileDashboardConsultor() {
  const { profile, primaryRole, roles } = useAuth();
  const navigate = useNavigate();
  const { data: resumo, isLoading } = useAtendimentosResumo();

  const v = (n?: number) => (isLoading || n == null ? "—" : n);

  const stats = [
    { label: "Demandas", value: v(resumo?.demandas), icon: Inbox, color: "text-amber-600 bg-amber-50", path: "/app/atendimentos?aba=demandas" },
    { label: "Em andamento", value: v(resumo?.em_andamento), icon: PlayCircle, color: "text-blue-600 bg-blue-50", path: "/app/atendimentos?aba=andamento" },
    { label: "Aguardando", value: v(resumo?.aguardando), icon: Clock, color: "text-orange-600 bg-orange-50", path: "/app/atendimentos?aba=aguardando" },
    { label: "Monitoramento", value: v(resumo?.monitoramento), icon: Repeat, color: "text-purple-600 bg-purple-50", path: "/app/atendimentos?aba=monitoramento" },
    { label: "Ocorrências", value: v(resumo?.ocorrencias), icon: AlertTriangle, color: "text-rose-600 bg-rose-50", path: "/app/atendimentos?aba=ocorrencias" },
    { label: "Concluídos", value: v(resumo?.concluidos), icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50", path: "/app/atendimentos?aba=concluidos" },
    { label: "OS Ativas", value: v(resumo?.os_ativas), icon: ClipboardList, color: "text-sky-600 bg-sky-50", path: "/app/ordens" },
    { label: "Fazendas", value: v(resumo?.fazendas), icon: MapPin, color: "text-emerald-600 bg-emerald-50", path: "/app/fazendas" },
  ];

  const quickActions = [
    { label: "Registrar Ocorrência", path: "/app/registrar", icon: AlertTriangle },
    { label: "Meus Atendimentos", path: "/app/atendimentos", icon: Inbox },
    { label: "Ver Fazendas", path: "/app/fazendas", icon: MapPin },
    { label: "Ordens de Serviço", path: "/app/ordens", icon: ClipboardList },
  ];


  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <LogoDisplay size="md" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            Olá, {getPortalGreetingLabel({ activeCtx: getActivePortalContext(), primaryRole, roles })}
          </p>
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
