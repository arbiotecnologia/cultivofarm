import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface Props {
  periodo: string;
  ultimaAtualizacao?: string;
  isFetching?: boolean;
  onRefresh: () => void;
}

const PERIODO_LABEL: Record<string, string> = {
  hoje: "Hoje",
  "7_dias": "Últimos 7 dias",
  "15_dias": "Últimos 15 dias",
  "30_dias": "Últimos 30 dias",
  safra_atual: "Safra atual",
  personalizado: "Período personalizado",
};

export function ExecutivoHeader({ periodo, ultimaAtualizacao, isFetching, onRefresh }: Props) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portal Executivo Cultivo Farm</h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada da operação, entregas, alertas e faturamento.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right text-xs text-muted-foreground hidden sm:block">
          <div>{PERIODO_LABEL[periodo] ?? periodo}</div>
          {ultimaAtualizacao && (
            <div>Atualizado às {new Date(ultimaAtualizacao).toLocaleTimeString("pt-BR")}</div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>
    </header>
  );
}
