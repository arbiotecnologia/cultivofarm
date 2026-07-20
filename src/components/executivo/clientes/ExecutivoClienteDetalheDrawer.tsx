import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { brl } from "@/lib/financial/format";
import { useExecutivoClienteDetalhe } from "@/hooks/useExecutivoClienteDetalhe";
import type { ExecutivoFiltros } from "@/hooks/useExecutivoResumo";

interface Props {
  clienteId: string | null;
  filtros: ExecutivoFiltros;
  onClose: () => void;
}

export function ExecutivoClienteDetalheDrawer({ clienteId, filtros, onClose }: Props) {
  const nav = useNavigate();
  const { data, isLoading } = useExecutivoClienteDetalhe(clienteId, filtros);

  const cli = data?.cliente;
  const op = data?.operacional;
  const fin = data?.financeiro;
  const fazendas = data?.fazendas ?? [];
  const gargalos = data?.gargalos ?? [];
  const eventos = data?.ultimos_eventos ?? [];

  return (
    <Sheet open={!!clienteId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{cli?.nome ?? "Cliente"}</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {cli?.tipo && <Badge variant="outline">{cli.tipo}</Badge>}
              {cli?.status_cliente && <Badge variant="outline">{cli.status_cliente}</Badge>}
              {cli?.documento && <Badge variant="outline">{cli.documento}</Badge>}
            </div>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Operacional</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Stat label="OS ativas" v={op?.os_ativas} />
                <Stat label="OS total" v={op?.os_total} />
                <Stat label="Visitas" v={op?.visitas} />
                <Stat label="Recom." v={op?.recomendacoes} />
                <Stat label="Entregas" v={op?.entregas_total} />
                <Stat label="Pendentes" v={op?.entregas_pendentes} tone="warn" />
                <Stat label="S/ compr." v={op?.entregas_sem_comprovante} tone="warn" />
                <Stat label="Não fat." v={op?.entregas_nao_faturadas} tone="warn" />
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Financeiro</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Stat label="A receber" v={brl(Number(fin?.valor_a_receber || 0))} />
                <Stat label="Vencido" v={brl(Number(fin?.valor_vencido || 0))} tone="danger" />
                <Stat label="Recebido" v={brl(Number(fin?.valor_recebido_periodo || 0))} tone="ok" />
                <Stat label="Fiscal pend." v={fin?.fiscal_pendente} tone="warn" />
              </div>
            </section>

            {fazendas.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Fazendas ({fazendas.length})</h4>
                <ul className="space-y-1 text-xs">
                  {fazendas.slice(0, 8).map((f: any) => (
                    <li key={f.id} className="flex justify-between border-b py-1">
                      <span className="truncate">{f.nome}</span>
                      <span className="text-muted-foreground shrink-0">{f.municipio ?? "—"}/{f.estado ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {gargalos.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Gargalos</h4>
                <ul className="space-y-1 text-xs">
                  {gargalos.slice(0, 6).map((g: any, i: number) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{g.descricao ?? g.tipo}</span>
                      <span className="text-destructive shrink-0">{g.valor ? brl(Number(g.valor)) : g.dias_atraso ? `${g.dias_atraso}d` : ""}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {eventos.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Últimos eventos</h4>
                <ul className="space-y-1 text-xs">
                  {eventos.slice(0, 10).map((e: any, i: number) => (
                    <li key={i} className="flex justify-between gap-2 border-b py-1">
                      <span className="truncate">{e.tipo}: {e.descricao ?? e.titulo}</span>
                      <span className="text-muted-foreground shrink-0">{e.data ? new Date(e.data).toLocaleDateString("pt-BR") : ""}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {cli?.id && (
                <>
                  <Button size="sm" variant="outline" onClick={() => nav(`/clientes`)}>Ver clientes</Button>
                  <Button size="sm" variant="outline" onClick={() => nav(`/financeiro/receber?cliente=${cli.id}`)}>Contas a receber</Button>
                  <Button size="sm" variant="outline" onClick={() => nav(`/entregas?cliente=${cli.id}`)}>Entregas</Button>
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, v, tone }: { label: string; v?: number | string; tone?: "warn" | "danger" | "ok" }) {
  const cls = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "";
  return (
    <div className="p-2 rounded border bg-card">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{v ?? 0}</div>
    </div>
  );
}
