import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Users, MapPin, AlertTriangle, Truck, FileWarning, Receipt, Eye, EyeOff, AlertCircle, Sparkles } from "lucide-react";
import type { ClientesResumo } from "@/hooks/useExecutivoClientesResumo";

interface Props {
  data?: ClientesResumo;
  isLoading?: boolean;
}

function Cell({ label, value, hint, tone, onClick, icon: Icon, unavailable }: {
  label: string; value?: number; hint?: string; tone?: "default" | "warn" | "danger" | "ok";
  onClick?: () => void; icon: any; unavailable?: boolean;
}) {
  const toneCls =
    tone === "danger" ? "text-destructive" :
    tone === "warn" ? "text-amber-600" :
    tone === "ok" ? "text-emerald-600" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-3 rounded-md border bg-card hover:bg-accent transition-colors w-full"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-xl font-semibold ${toneCls}`}>
        {unavailable ? "—" : (value ?? 0).toLocaleString("pt-BR")}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </button>
  );
}

export function ExecutivoClientesCards({ data, isLoading }: Props) {
  const nav = useNavigate();
  const r = data?.resumo;
  const indisp = new Set(data?.dados_indisponiveis ?? []);

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Cell label="Clientes ativos" value={r?.total_clientes_ativos} icon={Users} onClick={() => nav("/clientes")} unavailable={indisp.has("clientes_ativos")} />
        <Cell label="Fazendas ativas" value={r?.total_fazendas_ativas} icon={MapPin} onClick={() => nav("/fazendas")} unavailable={indisp.has("fazendas_ativas")} />
        <Cell label="Pend. operacional" value={r?.clientes_com_pendencia_operacional} icon={AlertTriangle} tone="warn" onClick={() => nav("/clientes")} unavailable={indisp.has("pendencia_operacional")} hint="clientes" />
        <Cell label="Pend. financeira" value={r?.clientes_com_pendencia_financeira} icon={Receipt} tone="danger" onClick={() => nav("/financeiro/receber")} unavailable={indisp.has("pendencia_financeira")} hint="clientes" />
        <Cell label="Entregas pendentes" value={r?.clientes_com_entrega_pendente} icon={Truck} tone="warn" onClick={() => nav("/entregas")} unavailable={indisp.has("entregas_pendentes")} hint="clientes" />
        <Cell label="Sem comprovante" value={r?.clientes_com_entrega_sem_comprovante} icon={FileWarning} tone="warn" onClick={() => nav("/entregas")} unavailable={indisp.has("entregas_sem_comprovante")} hint="clientes" />
        <Cell label="Não faturadas" value={r?.clientes_com_entrega_nao_faturada} icon={Receipt} tone="warn" onClick={() => nav("/entregas")} unavailable={indisp.has("entregas_nao_faturadas")} hint="clientes" />
        <Cell label="Alertas críticos" value={r?.clientes_com_alerta_critico} icon={AlertCircle} tone="danger" onClick={() => nav("/alertas-operacionais")} unavailable={indisp.has("alertas_criticos_clientes")} hint="clientes" />
        <Cell label="Faz. com visita" value={r?.fazendas_com_visita_recente} icon={Eye} tone="ok" onClick={() => nav("/fazendas")} unavailable={indisp.has("fazendas_com_visita")} />
        <Cell label="Faz. sem visita" value={r?.fazendas_sem_visita_no_periodo} icon={EyeOff} tone="warn" onClick={() => nav("/fazendas")} unavailable={indisp.has("fazendas_sem_visita")} />
        <Cell label="Oportunidades" value={r?.oportunidades_identificadas} icon={Sparkles} tone="ok" onClick={() => nav("/visita-tecnica")} unavailable={indisp.has("oportunidades")} hint="visitas sem OS" />
      </div>
    </Card>
  );
}
