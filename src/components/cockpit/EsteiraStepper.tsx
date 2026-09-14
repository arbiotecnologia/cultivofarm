import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  UserCog,
  FlaskRound,
  Beaker,
  ClipboardCheck,
  CheckCircle2,
  Package,
  Warehouse,
  Truck,
  ArrowUpRight,
  Check,
  Loader2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EsteiraStage =
  | "aguardando"
  | "em_producao"
  | "aguardando_cq"
  | "aprovado_cq"
  | "envase"
  | "estoque_reserva"
  | "entrega"
  | "aplicacao";

const STAGE_ORDER: Record<EsteiraStage, number> = {
  aguardando: 0,
  em_producao: 1,
  aguardando_cq: 2,
  aprovado_cq: 3,
  envase: 4,
  estoque_reserva: 5,
  entrega: 6,
  aplicacao: 7,
};

export interface StepperItem {
  id: string; // programacao_id
  os_id: string;
  numero_os?: string;
  origem: "manual" | "onfarm" | string;
  stage: EsteiraStage;
  os_status?: string;
  lote_id?: string | null;
  codigo_lote?: string | null;
  cq_resultado?: string | null;
  entrega_status?: string | null;
  aplicacao_status?: string | null;
}

export interface EsteiraStepperHandlers {
  onAssumirProducao: () => void;
  onGerarLote?: () => void;
  onEnviarParaCQ: () => void;
  onRegistrarCQ?: () => void;
  onEnviarParaEnvase: () => void;
  onConcluirEnvase: () => void;
  onReservarEstoque?: () => void;
}

type StepState = "done" | "current" | "pending" | "blocked";

interface StepDef {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  state: StepState;
  cta?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "secondary";
  };
  hint?: string;
}

export function EsteiraStepper({
  item,
  handlers,
  disabled = false,
}: {
  disabled?: boolean;
  item: StepperItem;
  handlers: EsteiraStepperHandlers;
}) {
  const navigate = useNavigate();

  const steps = useMemo<StepDef[]>(() => {
    const ord = STAGE_ORDER[item.stage] ?? 0;
    const hasLote = !!item.lote_id;
    const cqAprovado = item.cq_resultado === "aprovado";
    const cqReprovado = item.cq_resultado === "reprovado";
    const osFinalizada = item.os_status === "finalizada";
    const entregaConfirmada = item.entrega_status === "entregue" || item.entrega_status === "confirmada" || item.entrega_status === "concluida";
    const aplicacaoConcluida =
      item.aplicacao_status === "concluida" ||
      item.aplicacao_status === "finalizada";

    // O status oficial da esteira agora manda no fluxo
    const osQS = `?os=${item.os_id}`;

    const before = (n: number): StepState =>
      ord > n ? "done" : ord === n ? "current" : "pending";


    return [
      {
        key: "os",
        title: "OS recebida",
        icon: ClipboardList,
        state: "done",
        hint: item.numero_os ? `Nº ${item.numero_os}` : undefined,
      },
      {
        key: "pcp",
        title: "PCP / Programação",
        icon: UserCog,
        state: before(0),
        cta:
          ord === 0
            ? {
                label: "Assumir produção",
                onClick: handlers.onAssumirProducao,
              }
            : undefined,
      },
      {
        key: "producao",
        title: "Em produção",
        icon: FlaskRound,
        state: ord > 1 ? "done" : ord === 1 ? "current" : "pending",
        hint: ord === 1 && !hasLote ? "Gere o lote para avançar." : undefined,
      },
      {
        key: "lote",
        title: "Geração do lote",
        icon: Beaker,
        state: hasLote ? "done" : ord === 1 ? "current" : "pending",
        cta:
          !hasLote && ord === 1
            ? {
                label: "Gerar lote",
                onClick: handlers.onGerarLote ?? (() => navigate(`/lotes${osQS}`)),
                variant: "outline",
              }
            : undefined,
        hint: item.codigo_lote ? `Lote ${item.codigo_lote}` : undefined,
      },

      {
        key: "enviar_cq",
        title: "Enviar para CQ",
        icon: ArrowUpRight,
        state:
          ord >= 2
            ? "done"
            : hasLote && ord === 1
            ? "current"
            : !hasLote
            ? "blocked"
            : "pending",
        cta:
          hasLote && ord === 1
            ? { label: "Enviar para CQ", onClick: handlers.onEnviarParaCQ }
            : undefined,
        hint: !hasLote && ord === 1 ? "Pré-requisito: lote gerado." : undefined,
      },
      {
        key: "cq",
        title: "Controle de Qualidade",
        icon: ClipboardCheck,
        state: !hasLote && ord <= 2
          ? "blocked"
          : cqAprovado
          ? "done"
          : cqReprovado
          ? "blocked"
          : ord === 2
          ? "current"
          : ord > 2
          ? "done"
          : "pending",
        cta:
          hasLote && (ord === 2 || cqReprovado)
            ? {
                label: cqReprovado ? "Revisar CQ reprovado" : "Registrar resultado CQ",
                onClick: handlers.onRegistrarCQ ?? (() => navigate(`/controle-qualidade${osQS}`)),
                variant: "outline",
              }
            : undefined,
        hint: !hasLote
          ? "Pré-requisito: gere o lote antes de registrar o CQ."
          : cqReprovado
          ? "CQ reprovado — revisar lote antes de avançar."
          : undefined,
      },
      {
        key: "liberar_envase",
        title: "Liberar envase",
        icon: CheckCircle2,
        state:
          ord >= 4
            ? "done"
            : ord === 3 && cqAprovado
            ? "current"
            : "pending",
        cta:
          ord === 3 && cqAprovado
            ? {
                label: "Liberar envase",
                onClick: handlers.onEnviarParaEnvase,
              }
            : undefined,
      },

      {
        key: "envase",
        title: "Envase",
        icon: Package,
        state: ord > 4 ? "done" : ord === 4 ? "current" : "pending",
        cta:
          ord === 4
            ? { label: "Registrar envase", onClick: handlers.onConcluirEnvase, variant: "outline" }
            : undefined,
      },
      {
        key: "estoque",
        title: "Estoque / Reserva",
        icon: Warehouse,
        state: ord > 5 ? "done" : ord === 5 ? "current" : "pending",
        cta:
          ord === 5
            ? {
                label: "Reservar estoque",
                onClick: handlers.onReservarEstoque ?? (() => navigate(`/estoque${osQS}`)),
                variant: "outline",
              }
            : undefined,
      },
      {
        key: "entrega",
        title: "Entrega / Finalização da OS",
        icon: Truck,
        state:
          osFinalizada || entregaConfirmada || ord > 6
            ? "done"
            : ord === 6
            ? "current"
            : "pending",
        cta:
          ord === 6 && !entregaConfirmada && !osFinalizada
            ? {
                label: "Criar / confirmar entrega",
                onClick: () => navigate(`/entregas${osQS}`),
                variant: "outline",
              }
            : ord === 5 && !entregaConfirmada && !osFinalizada
            ? {
                label: "Reservar e entregar",
                onClick: () => navigate(`/estoque${osQS}&next=entrega`),
                variant: "outline",
              }
            : undefined,
        hint: osFinalizada
          ? "OS finalizada automaticamente após confirmação da entrega."
          : entregaConfirmada
          ? "Entrega confirmada."
          : ord === 5
          ? "Reserve o estoque antes de criar a entrega."
          : undefined,
      },
    ];
  }, [item, handlers, navigate]);

  return (
    <div className="relative">
      <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-slate-200" />
      <ol className="space-y-3">
        {steps.map((s) => {
          const Icon = s.icon;
          const stateClasses = {
            done: "bg-emerald-500 text-white border-emerald-500",
            current: "bg-primary text-primary-foreground border-primary ring-4 ring-primary/15",
            pending: "bg-white text-slate-400 border-slate-200",
            blocked: "bg-red-50 text-red-500 border-red-200",
          }[s.state];

          const StatusIcon =
            s.state === "done"
              ? Check
              : s.state === "current"
              ? Loader2
              : s.state === "blocked"
              ? AlertTriangle
              : Lock;

          return (
            <li key={s.key} className="relative pl-12">
              <div
                className={cn(
                  "absolute left-0 top-0 h-9 w-9 rounded-full border-2 flex items-center justify-center shadow-sm",
                  stateClasses
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div
                className={cn(
                  "rounded-lg border bg-white p-3 transition-shadow",
                  s.state === "current" && "shadow-sm border-primary/30",
                  s.state === "blocked" && "border-red-200 bg-red-50/40"
                )}
              >
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold leading-tight">{s.title}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] uppercase tracking-wider px-1.5 h-4 gap-1 shrink-0",
                          s.state === "done" && "border-emerald-200 text-emerald-700 bg-emerald-50",
                          s.state === "current" && "border-primary/30 text-primary bg-primary/5",
                          s.state === "pending" && "border-slate-200 text-slate-400",
                          s.state === "blocked" && "border-red-200 text-red-600 bg-red-50"
                        )}
                      >
                        <StatusIcon
                          className={cn(
                            "h-2.5 w-2.5",
                            s.state === "current" && "animate-spin"
                          )}
                        />
                        {s.state === "done"
                          ? "concluído"
                          : s.state === "current"
                          ? "atual"
                          : s.state === "blocked"
                          ? "bloqueado"
                          : "pendente"}
                      </Badge>
                    </div>
                    {s.hint && (
                      <p className="text-[11px] text-muted-foreground mt-1">{s.hint}</p>
                    )}
                  </div>
                  {s.cta && (
                    <Button
                      disabled={disabled}
                      size="sm"
                      variant={s.cta.variant ?? "default"}
                      className="h-auto min-h-9 w-full whitespace-normal text-[11px] sm:h-7 sm:min-h-0 sm:w-auto sm:shrink-0"
                      onClick={s.cta.onClick}
                    >
                      {s.cta.label}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
