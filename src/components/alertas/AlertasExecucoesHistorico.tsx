import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, History } from "lucide-react";
import { useAlertasExecucoes } from "@/hooks/useAlertasExecucoes";
import { formatDateTimeDisplay } from "@/lib/date-utils";

export function AlertasExecucoesHistorico() {
  const { historicoExecucoes, podeVer, loading } = useAlertasExecucoes(20);
  const [open, setOpen] = useState(false);

  if (!podeVer) return null;

  return (
    <Card>
      <CardContent className="p-3">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between" size="sm">
              <span className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4" />
                Histórico de execuções ({historicoExecucoes.length})
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            {loading && historicoExecucoes.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Carregando...</p>
            ) : historicoExecucoes.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Nenhuma execução registrada.</p>
            ) : (
              <>
                {/* Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground border-b">
                      <tr>
                        <th className="text-left py-2 px-2">Data/hora</th>
                        <th className="text-left py-2 px-2">Tipo</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-right py-2 px-2">Duração</th>
                        <th className="text-right py-2 px-2">Criados</th>
                        <th className="text-right py-2 px-2">Atualizados</th>
                        <th className="text-right py-2 px-2">Resolvidos</th>
                        <th className="text-left py-2 px-2">Erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicoExecucoes.map((h) => (
                        <tr key={h.id} className="border-b last:border-0">
                          <td className="py-2 px-2">{formatDateTimeDisplay(h.iniciado_em)}</td>
                          <td className="py-2 px-2">{h.tipo_execucao}</td>
                          <td className="py-2 px-2">
                            <Badge
                              variant="outline"
                              className={
                                h.status === "concluida"
                                  ? "border-emerald-500/40 text-emerald-600"
                                  : h.status === "falhou"
                                    ? "border-destructive/40 text-destructive"
                                    : ""
                              }
                            >
                              {h.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-right">
                            {h.duracao_ms != null ? `${(h.duracao_ms / 1000).toFixed(1)}s` : "—"}
                          </td>
                          <td className="py-2 px-2 text-right">{h.total_criados}</td>
                          <td className="py-2 px-2 text-right">{h.total_atualizados}</td>
                          <td className="py-2 px-2 text-right">{h.total_resolvidos_automaticamente}</td>
                          <td className="py-2 px-2 max-w-[260px] truncate" title={h.erro ?? ""}>
                            {h.erro ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile */}
                <div className="md:hidden space-y-2">
                  {historicoExecucoes.map((h) => (
                    <div key={h.id} className="rounded-md border p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{formatDateTimeDisplay(h.iniciado_em)}</span>
                        <Badge
                          variant="outline"
                          className={
                            h.status === "concluida"
                              ? "border-emerald-500/40 text-emerald-600"
                              : h.status === "falhou"
                                ? "border-destructive/40 text-destructive"
                                : ""
                          }
                        >
                          {h.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">{h.tipo_execucao} • {h.origem}</p>
                      <p>
                        Criados {h.total_criados} • Atualizados {h.total_atualizados} • Resolvidos {h.total_resolvidos_automaticamente}
                      </p>
                      {h.erro && <p className="text-destructive">Erro: {h.erro}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
