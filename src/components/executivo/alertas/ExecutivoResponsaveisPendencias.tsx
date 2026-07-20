import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, UserX } from "lucide-react";

interface Resp {
  responsavel_id?: string | null;
  responsavel: string;
  alertas_abertos: number;
  sla_vencidos: number;
  alertas_criticos: number;
  alertas_altos: number;
  ultima_acao?: string;
}

interface Props {
  responsaveis: Resp[];
  isLoading?: boolean;
  onFiltrar?: (responsavelId: string | null) => void;
  observacao?: string;
}

export function ExecutivoResponsaveisPendencias({ responsaveis, isLoading, onFiltrar, observacao }: Props) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
        </div>
      </Card>
    );
  }

  if (!responsaveis.length) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">Sem pendências por responsável.</Card>;
  }

  return (
    <Card className="p-3 md:p-4">
      <h3 className="text-sm font-semibold mb-1">Pendências por responsável</h3>
      {observacao && (
        <p className="text-[11px] text-muted-foreground mb-2">{observacao}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-1">Responsável</th>
              <th className="py-1 text-right">Abertos</th>
              <th className="py-1 text-right">SLA</th>
              <th className="py-1 text-right">Crít.</th>
              <th className="py-1 text-right">Altos</th>
              <th className="py-1 text-right">Última ação</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {responsaveis.map((r, i) => {
              const semResp = !r.responsavel_id;
              return (
                <tr key={i} className="border-t hover:bg-muted/30">
                  <td className="py-1.5">
                    {semResp ? (
                      <span className="flex items-center gap-1 text-amber-600 font-medium">
                        <UserX className="h-3 w-3" /> {r.responsavel}
                      </span>
                    ) : (
                      <span className="font-medium">{r.responsavel}</span>
                    )}
                  </td>
                  <td className="text-right">{r.alertas_abertos}</td>
                  <td className="text-right">
                    {r.sla_vencidos > 0 ? <Badge variant="destructive" className="text-[10px]">{r.sla_vencidos}</Badge> : r.sla_vencidos}
                  </td>
                  <td className="text-right text-destructive">{r.alertas_criticos}</td>
                  <td className="text-right text-amber-600">{r.alertas_altos}</td>
                  <td className="text-right text-muted-foreground">
                    {r.ultima_acao ? new Date(r.ultima_acao).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="text-right">
                    {onFiltrar && (
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => onFiltrar(r.responsavel_id ?? null)}>
                        <Filter className="h-3 w-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
