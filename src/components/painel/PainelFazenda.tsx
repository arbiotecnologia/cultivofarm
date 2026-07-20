import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { differenceInDays, isThisMonth } from "date-fns";

const URG_RANK: Record<string, number> = { baixa: 1, media: 2, alta: 3, critica: 4 };
const URG_VARIANT: Record<number, "outline" | "secondary" | "default" | "destructive"> = {
  0: "outline",
  1: "outline",
  2: "secondary",
  3: "default",
  4: "destructive",
};
const URG_LABEL: Record<number, string> = { 0: "ok", 1: "baixa", 2: "média", 3: "alta", 4: "crítica" };

interface Props {
  solicitacoes: any[];
  registros: any[];
}

export function PainelFazenda({ solicitacoes, registros }: Props) {
  const navigate = useNavigate();

  const rows = useMemo(() => {
    const map = new Map<
      string,
      { id: string; nome: string; ocorrencias: number; visitas: number; piorUrg: number }
    >();

    (solicitacoes || []).forEach((s: any) => {
      if (!s.fazenda_id || !s.created_at) return;
      const createdAt = new Date(s.created_at);
      if (isNaN(createdAt.getTime())) return;
      
      if (differenceInDays(new Date(), createdAt) > 30) return;
      
      const cur = map.get(s.fazenda_id) || {
        id: s.fazenda_id,
        nome: s.fazendas?.nome || "Fazenda",
        ocorrencias: 0,
        visitas: 0,
        piorUrg: 0,
      };
      cur.ocorrencias++;
      if (!["concluida", "cancelada"].includes(s.status)) {
        const r = URG_RANK[s.urgencia] || 0;
        if (r > cur.piorUrg) cur.piorUrg = r;
      }
      map.set(s.fazenda_id, cur);
    });

    (registros || []).forEach((r: any) => {
      if (!r.fazenda_id || !r.hora_inicio) return;
      const horaInicio = new Date(r.hora_inicio);
      if (isNaN(horaInicio.getTime())) return;
      
      if (!isThisMonth(horaInicio)) return;
      const cur = map.get(r.fazenda_id);
      if (cur) cur.visitas++;
    });

    return Array.from(map.values())
      .sort((a, b) => b.ocorrencias - a.ocorrencias)
      .slice(0, 10);
  }, [solicitacoes, registros]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Painel por fazenda (últimos 30 dias)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sem ocorrências no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-2 font-medium">Fazenda</th>
                  <th className="text-right py-2 font-medium">Ocorrências</th>
                  <th className="text-right py-2 font-medium">Visitas/mês</th>
                  <th className="text-right py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/solicitacoes?fazenda=${r.id}`)}
                    className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                  >
                    <td className="py-2 font-medium text-foreground">{r.nome}</td>
                    <td className="py-2 text-right">{r.ocorrencias}</td>
                    <td className="py-2 text-right">{r.visitas}</td>
                    <td className="py-2 text-right">
                      <Badge variant={URG_VARIANT[r.piorUrg]} className="capitalize">
                        {URG_LABEL[r.piorUrg]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
