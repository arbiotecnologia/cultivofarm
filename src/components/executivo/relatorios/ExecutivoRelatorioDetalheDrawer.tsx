import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, FileDown, Archive } from "lucide-react";
import { useExecutivoRelatorioDetalhe } from "@/hooks/useExecutivoRelatorioDetalhe";
import { useExecutivoRegistrarExportacao } from "@/hooks/useExecutivoRegistrarExportacao";
import { useExecutivoArquivarRelatorio } from "@/hooks/useExecutivoArquivarRelatorio";
import { formatDateTimeDisplay, formatDateDisplay } from "@/lib/date-utils";
import { arrayToCsv, downloadCsv, buildCsvFilename } from "@/lib/executivoCsv";

interface Props {
  relatorioId: string | null;
  onClose: () => void;
}

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

function SectionEmpty({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted-foreground italic">
      {label || "Sem dados suficientes para esta seção."}
    </p>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-dashed last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v === null || v === undefined ? "—" : String(v)}</span>
    </div>
  );
}

export function ExecutivoRelatorioDetalheDrawer({ relatorioId, onClose }: Props) {
  const { data: rel, isLoading } = useExecutivoRelatorioDetalhe(relatorioId);
  const registrar = useExecutivoRegistrarExportacao();
  const arquivar = useExecutivoArquivarRelatorio();

  // Normalização defensiva (compatibilidade com relatórios legados em formato objeto)
  const normalizeArray = (val: any, legacyKey?: string): any[] => {
    if (Array.isArray(val)) return val;
    if (val && typeof val === "object" && legacyKey && Array.isArray(val[legacyKey])) return val[legacyKey];
    return [];
  };
  const gargalos = normalizeArray(rel?.gargalos, "gargalos");
  const planoAcao = normalizeArray(rel?.plano_acao, "acoes");
  const rankClientes =
    normalizeArray(rel?.ranking_clientes, "ranking_clientes").length > 0
      ? normalizeArray(rel?.ranking_clientes, "ranking_clientes")
      : normalizeArray(rel?.ranking_clientes, "ranking");
  const rankFazendas = normalizeArray(rel?.ranking_fazendas, "ranking_fazendas");
  const alertas = normalizeArray(rel?.alertas, "prioridades");

  const handlePrint = async () => {
    if (!rel) return;
    try { await registrar.mutateAsync({ id: rel.id, tipo: "pdf" }); } catch {}
    window.print();
  };

  const exportCsv = async (
    kind: "gargalos" | "ranking_clientes" | "ranking_fazendas" | "plano_acao" | "alertas"
  ) => {
    if (!rel) return;
    const map: Record<string, any[]> = {
      gargalos, plano_acao: planoAcao, ranking_clientes: rankClientes,
      ranking_fazendas: rankFazendas, alertas,
    };
    const arr = map[kind];
    if (!arr || arr.length === 0) return;
    // headers derivadas das chaves do primeiro item (apenas tipos primitivos)
    const sample = arr[0] ?? {};
    const headers: Record<string, string> = {};
    Object.keys(sample).forEach((k) => {
      const val = sample[k];
      if (val === null || ["string", "number", "boolean"].includes(typeof val)) {
        headers[k] = k;
      }
    });
    const csv = arrayToCsv(headers, arr);
    downloadCsv(buildCsvFilename(`relatorio_${rel.tipo}_${kind}`), csv);
    try { await registrar.mutateAsync({ id: rel.id, tipo: "csv" }); } catch {}
  };

  const handleArquivar = async () => {
    if (!rel) return;
    if (!confirm(`Arquivar relatório "${rel.titulo}"?`)) return;
    await arquivar.mutateAsync({ id: rel.id });
    onClose();
  };

  return (
    <Sheet open={!!relatorioId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto print:max-w-full print:w-full print:shadow-none print:border-0">
        <SheetHeader className="print:hidden">
          <SheetTitle>Detalhe do relatório</SheetTitle>
          <SheetDescription>
            Visualização gerencial. Use os botões para imprimir/PDF, exportar CSV ou arquivar.
          </SheetDescription>
        </SheetHeader>

        {isLoading || !rel ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 mt-4 print:mt-0" id="executivo-relatorio-print">
            {/* Print header */}
            <div className="border-b pb-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Cultivo Farm — Portal Executivo
              </p>
              <h1 className="text-xl font-bold">{rel.titulo}</h1>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-1">
                <span>Tipo: <strong>{TIPO_LABELS[rel.tipo] ?? rel.tipo}</strong></span>
                <span>•</span>
                <span>
                  Período: {rel.periodo_inicio ? formatDateDisplay(rel.periodo_inicio) : "—"} →{" "}
                  {rel.periodo_fim ? formatDateDisplay(rel.periodo_fim) : "—"}
                </span>
                <span>•</span>
                <span>Gerado em: {formatDateTimeDisplay(rel.gerado_em)}</span>
              </div>
              <div className="mt-2">
                <Badge variant={rel.status === "gerado" ? "default" : "secondary"}>{rel.status}</Badge>
                <span className="ml-2 text-[11px] text-muted-foreground">v{rel.versao}</span>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir / Salvar PDF
              </Button>
              {gargalos.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => exportCsv("gargalos")}>
                  <FileDown className="h-4 w-4 mr-1" /> CSV Gargalos
                </Button>
              )}
              {planoAcao.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => exportCsv("plano_acao")}>
                  <FileDown className="h-4 w-4 mr-1" /> CSV Plano
                </Button>
              )}
              {alertas.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => exportCsv("alertas")}>
                  <FileDown className="h-4 w-4 mr-1" /> CSV Alertas
                </Button>
              )}
              {rankClientes.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => exportCsv("ranking_clientes")}>
                  <FileDown className="h-4 w-4 mr-1" /> CSV Clientes
                </Button>
              )}
              {rankFazendas.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => exportCsv("ranking_fazendas")}>
                  <FileDown className="h-4 w-4 mr-1" /> CSV Fazendas
                </Button>
              )}
              {rel.ativo && (
                <Button size="sm" variant="ghost" onClick={handleArquivar}>
                  <Archive className="h-4 w-4 mr-1" /> Arquivar
                </Button>
              )}
            </div>

            {/* Observações */}
            {rel.observacoes && (
              <Card>
                <CardContent className="pt-4 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p>{rel.observacoes}</p>
                </CardContent>
              </Card>
            )}

            {/* Indicadores / resumo */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-semibold text-sm mb-2">Indicadores principais</h3>
                {rel.resumo && typeof rel.resumo === "object" && Object.keys(rel.resumo).length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    {Object.entries((rel.resumo as any).resumo ?? rel.resumo).map(([k, v]) =>
                      typeof v === "object" ? null : <KV key={k} k={k} v={v as any} />
                    )}
                  </div>
                ) : (
                  <SectionEmpty label="Sem dados suficientes para esta seção." />
                )}
                {rel.indicadores && typeof rel.indicadores === "object" && Object.keys(rel.indicadores).length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Indicadores adicionais</p>
                    {Object.entries(rel.indicadores).map(([secao, val]: any) => (
                      <div key={secao} className="mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wide">{secao}</p>
                        {val && typeof val === "object" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                            {Object.entries(val).map(([k, v]) =>
                              typeof v === "object" ? null : <KV key={k} k={k} v={v as any} />
                            )}
                          </div>
                        ) : (
                          <span className="text-sm">{String(val)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gargalos */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-semibold text-sm mb-2">Gargalos</h3>
                {gargalos.length > 0 ? (
                  <ul className="space-y-2">
                    {gargalos.slice(0, 20).map((g: any, i: number) => (
                      <li key={i} className="text-sm border-l-2 border-orange-500 pl-2">
                        <strong>{g.titulo ?? g.descricao ?? g.origem ?? "Gargalo"}</strong>
                        {g.severidade && <Badge variant="outline" className="ml-2">{g.severidade}</Badge>}
                        {g.detalhes && <p className="text-xs text-muted-foreground">{g.detalhes}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <SectionEmpty label="Sem gargalos no período." />
                )}
              </CardContent>
            </Card>

            {/* Plano de ação */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-semibold text-sm mb-2">Plano de ação recomendado</h3>
                {planoAcao.length > 0 ? (
                  <ul className="space-y-2">
                    {planoAcao.slice(0, 20).map((p: any, i: number) => (
                      <li key={i} className="text-sm border-l-2 border-primary pl-2">
                        <strong>{p.acao ?? p.titulo ?? "Ação recomendada"}</strong>
                        {p.impacto && <Badge variant="outline" className="ml-2">{p.impacto}</Badge>}
                        {p.descricao && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <SectionEmpty label="Sem ações recomendadas." />
                )}
              </CardContent>
            </Card>

            {/* Alertas críticos */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-semibold text-sm mb-2">Alertas críticos</h3>
                {alertas.length > 0 ? (
                  <ul className="space-y-2">
                    {alertas.slice(0, 20).map((a: any, i: number) => (
                      <li key={i} className="text-sm border-l-2 border-red-500 pl-2">
                        <strong>{a.titulo ?? a.descricao ?? "Alerta"}</strong>
                        {a.severidade && <Badge variant="outline" className="ml-2">{a.severidade}</Badge>}
                        {a.responsavel_nome && (
                          <span className="text-xs text-muted-foreground ml-2">
                            — {a.responsavel_nome}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <SectionEmpty label="Sem alertas críticos." />
                )}
              </CardContent>
            </Card>

            {/* Rankings */}
            {rankClientes.length > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <h3 className="font-semibold text-sm mb-2">Ranking de clientes</h3>
                  <ul className="text-sm space-y-1">
                    {rankClientes.slice(0, 10).map((c: any, i: number) => (
                      <li key={i} className="flex justify-between">
                        <span>{i + 1}. {c.nome ?? c.razao_social ?? c.cliente_nome ?? "—"}</span>
                        <span className="font-medium">{c.valor ?? c.total ?? c.score ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {rankFazendas.length > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <h3 className="font-semibold text-sm mb-2">Ranking de fazendas</h3>
                  <ul className="text-sm space-y-1">
                    {rankFazendas.slice(0, 10).map((f: any, i: number) => (
                      <li key={i} className="flex justify-between">
                        <span>{i + 1}. {f.nome ?? f.fazenda_nome ?? "—"}</span>
                        <span className="font-medium">{f.valor ?? f.total ?? f.score ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="text-[10px] text-muted-foreground border-t pt-2 mt-6">
              Relatório gerencial gerado pelo Portal Executivo Cultivo Farm em {formatDateTimeDisplay(rel.gerado_em)}.
              Hash: <span className="font-mono">{rel.hash_conteudo}</span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
