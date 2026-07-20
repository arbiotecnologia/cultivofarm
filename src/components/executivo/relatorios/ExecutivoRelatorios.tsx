import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, Plus, RefreshCw, Eye, Archive, Loader2 } from "lucide-react";
import { formatDateTimeDisplay, formatDateDisplay } from "@/lib/date-utils";
import { useExecutivoRelatorios } from "@/hooks/useExecutivoRelatorios";
import { useExecutivoArquivarRelatorio } from "@/hooks/useExecutivoArquivarRelatorio";
import { ExecutivoRelatorioGerarDialog } from "./ExecutivoRelatorioGerarDialog";
import { ExecutivoRelatorioDetalheDrawer } from "./ExecutivoRelatorioDetalheDrawer";
import type { ExecutivoFiltros } from "@/hooks/useExecutivoResumo";

const TIPO_LABELS: Record<string, string> = {
  resumo_geral: "Resumo Geral",
  operacional: "Operacional",
  financeiro: "Financeiro",
  clientes_fazendas: "Clientes & Fazendas",
  alertas_acoes: "Alertas & Ações",
  completo: "Completo",
  diretoria: "Diretoria",
  reuniao_semanal: "Reunião Semanal",
  reuniao_mensal: "Reunião Mensal",
};

interface Props {
  filtrosBase: ExecutivoFiltros;
}

export function ExecutivoRelatorios({ filtrosBase }: Props) {
  const [tipo, setTipo] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [ativo, setAtivo] = useState<"true" | "false">("true");
  const [gerarOpen, setGerarOpen] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const filtrosLista = {
    tipo: tipo || undefined,
    status: status || undefined,
    texto: texto || undefined,
    ativo: ativo === "true",
  };

  const { data: relatorios, isLoading, isFetching, refetch } = useExecutivoRelatorios(filtrosLista);
  const arquivar = useExecutivoArquivarRelatorio();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Relatórios Executivos</h2>
          <p className="text-xs text-muted-foreground">
            Gere, visualize e exporte relatórios consolidados para reuniões gerenciais.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setGerarOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Gerar relatório
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo || "all"} onValueChange={(v) => setTipo(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(TIPO_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="gerado">Gerado</SelectItem>
                <SelectItem value="arquivado">Arquivado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Exibir</Label>
            <Select value={ativo} onValueChange={(v) => setAtivo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Apenas ativos</SelectItem>
                <SelectItem value="false">Apenas arquivados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input
              placeholder="Título..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !relatorios || relatorios.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
            Nenhum relatório encontrado. Clique em "Gerar relatório" para criar o primeiro.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: tabela */}
          <Card className="hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">Título</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Período</th>
                    <th className="text-left px-3 py-2">Gerado por</th>
                    <th className="text-left px-3 py-2">Data/Hora</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorios.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.titulo}</td>
                      <td className="px-3 py-2">{TIPO_LABELS[r.tipo] ?? r.tipo}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.periodo_inicio ? formatDateDisplay(r.periodo_inicio) : "—"} →{" "}
                        {r.periodo_fim ? formatDateDisplay(r.periodo_fim) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.gerado_por_nome ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{formatDateTimeDisplay(r.gerado_em)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.status === "gerado" ? "default" : "secondary"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setDetalheId(r.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {r.ativo && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={arquivar.isPending}
                              onClick={() => {
                                if (confirm(`Arquivar relatório "${r.titulo}"?`)) {
                                  arquivar.mutate({ id: r.id });
                                }
                              }}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {relatorios.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{r.titulo}</p>
                      <p className="text-xs text-muted-foreground">{TIPO_LABELS[r.tipo] ?? r.tipo}</p>
                    </div>
                    <Badge variant={r.status === "gerado" ? "default" : "secondary"}>
                      {r.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.gerado_por_nome ?? "—"} • {formatDateTimeDisplay(r.gerado_em)}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetalheId(r.id)}>
                      <Eye className="h-4 w-4 mr-1" /> Ver
                    </Button>
                    {r.ativo && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Arquivar?")) arquivar.mutate({ id: r.id });
                        }}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <ExecutivoRelatorioGerarDialog
        open={gerarOpen}
        onOpenChange={setGerarOpen}
        filtrosBase={filtrosBase}
        onCreated={(id) => {
          setGerarOpen(false);
          setDetalheId(id);
        }}
      />

      <ExecutivoRelatorioDetalheDrawer
        relatorioId={detalheId}
        onClose={() => setDetalheId(null)}
      />
    </div>
  );
}
