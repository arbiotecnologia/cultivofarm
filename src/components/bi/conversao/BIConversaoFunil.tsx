import { cn } from "@/lib/utils";
import { FileText, Zap, Clock, TrendingUp, ChevronRight, ChevronDown } from "lucide-react";

interface BIConversaoFunilProps {
  indicadores: {
    emitidas: number;
    liberadas: number;
    aguardandoDecisao: number;
    convertidasOS: number;
  };
  loading?: boolean;
}

export function BIConversaoFunil({ indicadores, loading }: BIConversaoFunilProps) {
  if (loading) return <div className="h-48 w-full bg-muted animate-pulse rounded-xl" />;

  const steps = [
    { label: "Emitidas", value: indicadores.emitidas, icon: FileText, color: "bg-blue-500" },
    { label: "Liberadas", value: indicadores.liberadas, icon: Zap, color: "bg-purple-500" },
    { label: "Em Decisão", value: indicadores.aguardandoDecisao, icon: Clock, color: "bg-orange-500" },
    { label: "Em OS de Produção", value: indicadores.convertidasOS, icon: TrendingUp, color: "bg-emerald-500" },
  ];

  return (
    <div className="bg-white p-6 rounded-xl border shadow-sm">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">
        {steps.map((step, i) => (
          <div key={step.label} className="flex flex-col md:flex-row items-center flex-1 w-full">
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className={cn("p-3 rounded-full text-white shadow-lg", step.color)}>
                <step.icon className="h-6 w-6" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-foreground tracking-tight">{step.value}</div>
                <div className="text-[10px] font-bold uppercase text-muted-foreground">{step.label}</div>
              </div>
              {i < steps.length - 1 && indicadores.emitidas > 0 && (
                <div className="mt-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {(step.value / steps[0].value * 100).toFixed(0)}% Retenção
                </div>
              )}
            </div>
            
            {i < steps.length - 1 && (
              <div className="flex items-center justify-center py-4 md:py-0 md:px-4">
                <ChevronRight className="hidden md:block h-6 w-6 text-muted-foreground/30" />
                <ChevronDown className="block md:hidden h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
