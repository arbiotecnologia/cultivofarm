import { BICardKPI } from "../BICardKPI";
import { Timer, Clock, Truck, Beaker, FlaskConical, ClipboardList } from "lucide-react";

interface BITemposEsteiraProps {
  tempos: {
    osAteProg: number | null;
    progAteLote: number | null;
    loteAteCQ: number | null;
    cqAteEnvase: number | null;
    envaseAteEntrega: number | null;
    osAteEntrega: number | null;
  };
  loading?: boolean;
}

export function BITemposEsteira({ tempos, loading }: BITemposEsteiraProps) {
  const formatTime = (val: number | null) => {
    if (val === null || val === undefined) return "Sem dados suficientes";
    if (val < 1) return `${(val * 60).toFixed(0)} min`;
    if (val < 24) return `${val.toFixed(1)}h`;
    return `${(val / 24).toFixed(1)} dias`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <BICardKPI 
        titulo="OS → Programação" 
        valor={formatTime(tempos.osAteProg)} 
        loading={loading}
        icone={ClipboardList}
        descricao="Tempo de espera no PCP"
      />
      <BICardKPI 
        titulo="Programação → Lote" 
        valor={formatTime(tempos.progAteLote)} 
        loading={loading}
        icone={FlaskConical}
        descricao="Início da produção efetiva"
      />
      <BICardKPI 
        titulo="Lote → Resultado CQ" 
        valor={formatTime(tempos.loteAteCQ)} 
        loading={loading}
        icone={Beaker}
        descricao="Agilidade laboratorial"
      />
      <BICardKPI 
        titulo="CQ → Envase" 
        valor={formatTime(tempos.cqAteEnvase)} 
        loading={loading}
        icone={Clock}
        descricao="Liberação pós-aprovação"
      />
      <BICardKPI 
        titulo="Envase → Entrega" 
        valor={formatTime(tempos.envaseAteEntrega)} 
        loading={loading}
        icone={Truck}
        descricao="Agilidade na logística"
      />
      <BICardKPI 
        titulo="Lead Time Total (OS → Ent)" 
        valor={formatTime(tempos.osAteEntrega)} 
        loading={loading}
        icone={Timer}
        variant="success"
        descricao="Ciclo total do pedido"
      />
    </div>
  );
}
