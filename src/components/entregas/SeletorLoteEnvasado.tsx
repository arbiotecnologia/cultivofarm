import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Package, Beaker, Calendar, ShieldAlert, Boxes } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";
import {
  formatProdutoOuMicro,
  formatLoteCodigo,
  formatEmbalagem,
  formatClienteOuStatus,
  groupLotesPorOS,
  searchMatch,
} from "@/lib/entregaLoteLabel";
import { cn } from "@/lib/utils";

interface Props {
  itens: any[];
  value: string | string[];
  onChange: (id: string) => void;
  multi?: boolean;
  /** Se informado, itens cujo _os_origem_id difere serão marcados como "Outra OS". */
  highlightForaEscopoOsId?: string;
}

export function SeletorLoteEnvasado({ itens, value, onChange, multi = false, highlightForaEscopoOsId }: Props) {
  const selectedSet = new Set<string>(Array.isArray(value) ? value : value ? [value] : []);
  const [busca, setBusca] = useState("");

  const grupos = useMemo(() => {
    const filtrados = itens.filter((it) => searchMatch(it, busca));
    return groupLotesPorOS(filtrados);
  }, [itens, busca]);

  const total = itens.length;
  const visiveis = grupos.reduce((acc, g) => acc + g.itens.length, 0);

  if (total === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Nenhum item envasado disponível. Conclua o envase em Produção.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por lote, produto, microrganismo, cliente ou OS…"
          className="pl-9 h-9"
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>{visiveis} de {total} lote(s) envasado(s)</span>
        {busca && visiveis === 0 && <span className="text-amber-600">Nenhum lote para essa busca</span>}
      </div>

      <ScrollArea className="h-[340px] rounded-md border bg-background">
        <div className="p-2 space-y-3">
          {grupos.map((grupo) => (
            <div key={grupo.key} className="space-y-1.5">
              <div className="flex items-center gap-2 px-1 py-1 sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b">
                {grupo.tipo === "os" && <Package className="h-3.5 w-3.5 text-primary" />}
                {grupo.tipo === "cliente" && <Boxes className="h-3.5 w-3.5 text-amber-600" />}
                {grupo.tipo === "livre" && <Beaker className="h-3.5 w-3.5 text-muted-foreground" />}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-foreground break-words">
                    {grupo.titulo}
                  </div>
                  {grupo.subtitulo && (
                    <div className="text-[10px] text-muted-foreground break-words">{grupo.subtitulo}</div>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {grupo.itens.length}
                </Badge>
              </div>

              <div className="space-y-1.5">
                {grupo.itens.map((it) => {
                  const selected = selectedSet.has(it.id);
                  const produto = formatProdutoOuMicro(it);
                  const lote = formatLoteCodigo(it);
                  const embalagem = formatEmbalagem(it);
                  const cliente = formatClienteOuStatus(it);
                  const envaseData = it._envase?.data_envase;
                  const validade = it.validade;
                  const isReservadoComLimite =
                    it.status === "reservado" && it._saldo_reserva < it._saldo;

                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => onChange(it.id)}
                      className={cn(
                        "w-full text-left rounded-md border p-2.5 transition-all hover:border-primary/50 hover:bg-muted/40",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-sm"
                          : "border-border bg-background",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {multi && (
                          <div className={cn(
                            "mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0",
                            selected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40 bg-background",
                          )}>
                            {selected && <span className="text-[10px] leading-none">✓</span>}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono-data text-xs font-bold text-foreground">{lote}</span>
                            <Badge
                              variant={it.status === "reservado" ? "secondary" : "outline"}
                              className="text-[9px] h-4 px-1.5 uppercase font-bold"
                            >
                              {it.status === "reservado" ? "Reservado" : "Disponível"}
                            </Badge>
                            {highlightForaEscopoOsId &&
                              it._os_origem_id &&
                              it._os_origem_id !== highlightForaEscopoOsId &&
                              it.reservado_para_os_id !== highlightForaEscopoOsId && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4 px-1.5 uppercase font-bold border-amber-400 text-amber-700 bg-amber-50"
                                >
                                  Outra OS
                                </Badge>
                              )}
                          </div>
                          <div className="text-sm font-medium text-foreground mt-0.5 break-words">{produto}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 break-words">
                            {cliente.label}
                          </div>

                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <div className="text-[9px] uppercase text-muted-foreground font-semibold">Saldo</div>
                          <div className="font-mono-data text-base font-bold text-primary leading-none">
                            {it._saldo}
                            <span className="text-[10px] font-normal text-muted-foreground ml-0.5">un</span>
                          </div>
                          {isReservadoComLimite && (
                            <div className="mt-1 flex items-center gap-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-500">
                              <ShieldAlert className="h-2.5 w-2.5" />
                              reserva {it._saldo_reserva}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-dashed flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                        {embalagem && (
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-2.5 w-2.5" /> {embalagem}
                          </span>
                        )}
                        {envaseData && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-2.5 w-2.5" /> Envase {formatDateDisplay(envaseData)}
                          </span>
                        )}
                        {validade && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-2.5 w-2.5" /> Val. {formatDateDisplay(validade)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
