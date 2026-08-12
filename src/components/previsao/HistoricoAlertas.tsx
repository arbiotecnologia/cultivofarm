import { formatDateDisplay } from "@/lib/date-utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getNivelRiscoCor, getNivelRiscoLabel, getTipoAlertaLabel } from "@/lib/risco-agronomico";
import { Clock } from "lucide-react";

export function HistoricoAlertas() {
  const [fazendaId, setFazendaId] = useState("");
  const [talhaoId, setTalhaoId] = useState("");

  const { data: fazendas } = useQuery({
    queryKey: ["fazendas"],
    queryFn: async () => { const { data } = await (supabase as any).from("fazendas").select("id, nome").order("nome"); return data ?? []; },
  });

  const { data: talhoes } = useQuery({
    queryKey: ["talhoes_fazenda_hist", fazendaId],
    queryFn: async () => {
      if (!fazendaId) return [];
      const { data } = await (supabase as any).from("talhoes").select("id, nome").eq("fazenda_id", fazendaId);
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const { data: alertas } = useQuery({
    queryKey: ["alertas_historico", fazendaId, talhaoId],
    queryFn: async () => {
      if (!fazendaId) return [];
      let q = (supabase as any).from("alertas_agronomicos").select("*").eq("fazenda_id", fazendaId).order("data_alerta", { ascending: false });
      if (talhaoId) q = q.eq("talhao_id", talhaoId);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  return (
    <div className="space-y-6">
      <div className="flex gap-4 flex-wrap">
        <Select value={fazendaId} onValueChange={v => { setFazendaId(v); setTalhaoId(""); }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
          <SelectContent>{(fazendas ?? []).map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
        </Select>
        {fazendaId && (
          <Select value={talhaoId} onValueChange={setTalhaoId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Todos os talhões" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              {(talhoes ?? []).map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {!fazendaId ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione uma fazenda para ver o histórico.</CardContent></Card>
      ) : !(alertas ?? []).length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum alerta registrado.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(alertas ?? []).map((a: any) => (
            <Card key={a.id} className="border-l-4" style={{ borderLeftColor: a.nivel_risco === "critico" ? "hsl(0 84% 60%)" : a.nivel_risco === "alto" ? "hsl(25 95% 53%)" : a.nivel_risco === "medio" ? "hsl(45 93% 47%)" : "hsl(142 71% 45%)" }}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{getTipoAlertaLabel(a.tipo_alerta)}</span>
                        <Badge className={getNivelRiscoCor(a.nivel_risco)}>{getNivelRiscoLabel(a.nivel_risco)}</Badge>
                        <Badge variant={a.status === "ativo" ? "destructive" : a.status === "monitoramento" ? "secondary" : "outline"}>
                          {a.status === "ativo" ? "Ativo" : a.status === "monitoramento" ? "Monitoramento" : "Encerrado"}
                        </Badge>
                      </div>
                      {a.descricao && <p className="text-sm text-muted-foreground">{a.descricao}</p>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateDisplay(a.data_alerta)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
