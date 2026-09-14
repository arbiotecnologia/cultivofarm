import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/financial/format";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Alert {
  alert_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  amount: number;
  count: number;
  action_key: string;
}

const SEV_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const SEV_TONE: Record<string, string> = {
  CRITICAL: "border-destructive bg-destructive/5",
  HIGH: "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
  MEDIUM: "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20",
  LOW: "border-muted bg-muted/30",
};
const SEV_BADGE: Record<string, "destructive" | "secondary" | "outline" | "default"> = {
  CRITICAL: "destructive", HIGH: "secondary", MEDIUM: "outline", LOW: "outline",
};

const ACTION_URL: Record<string, string> = {
  "entregas-nao-faturadas": "/financeiro/entregas-nao-faturadas",
  "receber-vencidos": "/financeiro/receber",
  "pagar-vencidos": "/financeiro/pagar",
  "nfe-pendente": "/financeiro/notas-fiscais",
  "categorias-dre": "/financeiro/categorias",
  "recorrencias": "/financeiro/recorrencias",
  "centros-custo": "/financeiro/centros-custo",
};

export const MSG_ERRO_ALERTAS = "Não foi possível carregar os alertas financeiros.";

export function AlertasGestor() {
  const navigate = useNavigate();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["fin-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_alerts" as any, {});
      if (error) throw error;
      return ((data || []) as Alert[]).slice().sort(
        (a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
      );
    },
  });

  const alertas = isError ? [] : data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Atenção do Gestor
          {isFetching && !isLoading && (
            <span className="text-xs font-normal text-muted-foreground">Atualizando…</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="text-sm text-muted-foreground" role="status">Carregando alertas…</div>
        )}

        {!isLoading && isError && (
          <div className="space-y-2" role="alert">
            <p className="text-sm text-destructive">{MSG_ERRO_ALERTAS}</p>
            <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
            </Button>
          </div>
        )}

        {!isLoading && !isError && alertas.length === 0 && (
          <div className="text-sm text-muted-foreground">Nenhum alerta no momento. Tudo em dia.</div>
        )}

        <div className={isFetching && !isLoading ? "opacity-60" : undefined}>
          {!isError && alertas.map((a) => (
            <div key={a.alert_type} className={`flex flex-col sm:flex-row sm:items-center gap-2 p-3 mb-2 rounded-md border ${SEV_TONE[a.severity] ?? SEV_TONE.LOW}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={SEV_BADGE[a.severity] ?? "outline"}>{a.severity}</Badge>
                  <span className="font-medium text-sm">{a.title}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                <p className="text-xs mt-1">
                  {a.count > 0 && <span className="font-medium">{a.count} item(ns)</span>}
                  {Number(a.amount) > 0 && <span className="ml-2">{brl(Number(a.amount))}</span>}
                </p>
              </div>
              {ACTION_URL[a.action_key] && (
                <Button size="sm" variant="outline" onClick={() => navigate(ACTION_URL[a.action_key])}>
                  Resolver <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
