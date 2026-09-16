import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { brl } from "@/lib/financial/format";
import { useExecutivoFazendaDetalhe } from "@/hooks/useExecutivoClienteDetalhe";
import type { ExecutivoFiltros } from "@/hooks/useExecutivoResumo";

interface Props {
  fazendaId: string | null;
  filtros: ExecutivoFiltros;
  onClose: () => void;
}

export function ExecutivoFazendaDetalheDrawer({ fazendaId, filtros, onClose }: Props) {
  const nav = useNavigate();
  const { data, isLoading } = useExecutivoFazendaDetalhe(fazendaId, filtros);

  const faz = data?.fazenda;
  const op = data?.operacional;
  const fin = data?.financeiro;
  const gargalos = data?.gargalos ?? [];
  const eventos = data?.ultimos_eventos ?? [];

  return (
    <Sheet open={!!fazendaId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{faz?.nome ?? "Fazenda"}</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {faz?.cliente_nome && <Badge variant="outline">{faz.cliente_nome}</Badge>}
              {faz?.municipio && <Badge variant="outline">{faz.municipio}/{faz.estado ?? faz.uf ?? ""}</Badge>}
              {faz?.area_total != null && <Badge variant="outline">{Number(faz.area_total).toLocaleString("pt-BR")} ha</Badge>}
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
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Financeiro (entregas)</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <Stat label="A receber" v={brl(Number(fin?.valor_a_receber || 0))} />
                <Stat label="Vencido" v={brl(Number(fin?.valor_vencido || 0))} tone="danger" />
                <Stat label="Faturado" v={brl(Number(fin?.valor_faturado || 0))} tone="ok" />
              </div>
            </section>

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
              {faz?.id && (
                <>
                  <Button size="sm" variant="outline" onClick={() => nav(`/fazendas/${faz.id}`)}>Ver fazenda</Button>
                  <Button size="sm" variant="outline" onClick={() => nav(`/ordens-servico?fazenda=${faz.id}`)}>OS de Produção</Button>
                  <Button size="sm" variant="outline" onClick={() => nav(`/entregas?fazenda=${faz.id}`)}>Entregas</Button>
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
