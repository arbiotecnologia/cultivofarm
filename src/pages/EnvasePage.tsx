import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { AuxiliaryScreenBanner } from "@/components/AuxiliaryScreenBanner";
import { embalagemLabels } from "@/lib/envaseFormat";
import { formatDateDisplay } from "@/lib/date-utils";
import { useSearchParams } from "react-router-dom";
import { EtiquetaProdutoActions } from "@/components/etiquetas/EtiquetaProdutoActions";
import {
  PAGINA_ENVASE,
  faixaDaPagina,
  totalDePaginas,
  validarPeriodo,
  carregarTudo,
} from "@/lib/envase/consulta";
import { useDebounce } from "@/hooks/useDebounce";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

interface Envase {
  id: string;
  lote_id?: string;
  tipo_embalagem: string;
  volume_por_unidade: number | null;
  quantidade: number | null;
  data_envase: string;
  operador: string | null;
  etiqueta_id?: string | null;
  lotes?: { codigo_lote: string; produto_id?: string | null; produtos?: { nome: string } | null } | null;
  produto_etiquetas?: { id: string; status: string; trace_token: string; codigo_etiqueta: string } | null;
}

const SELECT_ENVASE =
  "id, lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase, operador, etiqueta_id, created_at, lotes!inner(codigo_lote, produto_id, produtos(nome)), produto_etiquetas:etiqueta_id(id, status, trace_token, codigo_etiqueta)";

export default function EnvasePage() {
  const session = useStorageAccessScope("envase-consulta");
  // Remount clears rows, products, filters and pending debounce on every identity generation.
  return session.ready ? <EnvaseConsulta key={session.scope} /> : <p role="status">Consulta indisponível nesta sessão.</p>;
}

function EnvaseConsulta() {
  const [searchParams] = useSearchParams();
  const [envases, setEnvases] = useState<Envase[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);
  const [erroAuxiliares, setErroAuxiliares] = useState<string | null>(null);
  const [carregandoAuxiliares, setCarregandoAuxiliares] = useState(true);

  const [search, setSearch] = useState(searchParams.get("os") || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [produtoFilter, setProdutoFilter] = useState("all");

  /** Uma consulta por pausa de digitação, não por tecla. */
  const buscaDebounced = useDebounce(search.trim(), 400);
  const periodo = validarPeriodo(dateFrom, dateTo);
  const fence = useStorageAccessScope(JSON.stringify([search, buscaDebounced, produtoFilter, dateFrom, dateTo, pagina]));
  const productsFence = useStorageAccessScope("envase-produtos");
  const historyGeneration = useRef(0);
  const productsGeneration = useRef(0);
  const [adoptedScope, setAdoptedScope] = useState("");
  const historyCurrent = adoptedScope === fence.scope;

  /** Histórico: paginação server-side com contagem exata e filtros no banco. */
  const carregarHistorico = useCallback(async () => {
    const generation = ++historyGeneration.current;
    const captured = fence.capture();
    const current = () => captured() && generation === historyGeneration.current;
    if (!current() || !periodo.valido || search.trim() !== buscaDebounced) return;
    setLoading(true);
    setErro(null);
    try {
      const termo = buscaDebounced;
      let loteIds: string[] = [];
      if (termo) {
        const encontrados = await carregarTudo<{ id: string }>(async (from, to) => {
          if (!current()) throw new Error("Consulta substituída");
          const { data, error } = await supabase
            .from("lotes")
            .select("id")
            .ilike("codigo_lote", `%${termo}%`)
            .order("id")
            .range(from, to);
          if (error) throw error;
          if (!current()) throw new Error("Consulta substituída");
          return (data ?? []) as { id: string }[];
        });
        loteIds = encontrados.map((l) => l.id);
      }
      if (!current()) return;

      let query = supabase
        .from("envase")
        .select(SELECT_ENVASE, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (produtoFilter !== "all") query = query.eq("lotes.produto_id", produtoFilter);
      if (dateFrom) query = query.gte("data_envase", dateFrom);
      if (dateTo) query = query.lte("data_envase", dateTo);
      if (termo) {
        const alvos = [`operador.ilike.%${termo}%`];
        if (loteIds.length) alvos.push(`lote_id.in.(${loteIds.join(",")})`);
        query = query.or(alvos.join(","));
      }

      const { from, to } = faixaDaPagina(pagina);
      const { data, count, error } = await query.range(from, to);
      if (!current()) return;
      if (error) throw error;
      setAdoptedScope(fence.scope);
      setEnvases((data ?? []) as unknown as Envase[]);
      setTotal(count ?? 0);
    } catch (e: any) {
      if (!current()) return;
      setAdoptedScope(fence.scope);
      setEnvases([]);
      setTotal(0);
      setErro(e?.message || "Não foi possível carregar o histórico de envases.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [fence.scope, buscaDebounced, search, produtoFilter, dateFrom, dateTo, pagina, periodo.valido]);

  const carregarProdutos = useCallback(async () => {
    const generation = ++productsGeneration.current;
    const captured = productsFence.capture();
    const current = () => captured() && generation === productsGeneration.current;
    if (!current()) return;
    setCarregandoAuxiliares(true);
    setErroAuxiliares(null);
    try {
      const rows = await carregarTudo<{ id: string; nome: string }>(async (from, to) => {
        if (!current()) throw new Error("Consulta substituída");
        const { data, error } = await supabase.from("produtos").select("id, nome").order("nome").order("id").range(from, to);
        if (!current()) throw new Error("Consulta substituída");
        if (error) throw error;
        return data ?? [];
      });
      if (current()) setProdutos(rows);
    } catch (e: unknown) {
      if (!current()) return;
      setProdutos([]);
      setErroAuxiliares(e instanceof Error ? e.message : "Não foi possível carregar produtos.");
    } finally { if (current()) setCarregandoAuxiliares(false); }
  }, [productsFence.scope]);

  useEffect(() => { void carregarHistorico(); return () => { ++historyGeneration.current; }; }, [carregarHistorico]);
  useEffect(() => { void carregarProdutos(); return () => { ++productsGeneration.current; }; }, [carregarProdutos]);

  useEffect(() => {
    const captured = fence.capture();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (!active || !captured()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (active && captured()) { void carregarHistorico(); void carregarProdutos(); } }, 1200);
    };
    const channel = supabase
      .channel("envase-lotes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "envase" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "lotes" }, debounced)
      .subscribe();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [carregarHistorico, carregarProdutos]);

  // Alterar filtros sempre volta à primeira página.
  const aoFiltrar = <T,>(set: (v: T) => void) => (v: T) => { setPagina(1); set(v); };
  /** Versão para <input>: extrai o valor do evento e volta à primeira página. */
  const aoFiltrarInput = (set: (v: string) => void) =>
    (e: ChangeEvent<HTMLInputElement>) => { setPagina(1); set(e.target.value); };

  const paginas = totalDePaginas(total);

  return (
    <div className="space-y-4 sm:space-y-6">
      <AuxiliaryScreenBanner
        title="Envase — consulta"
        description="Histórico de envases"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Envase</h1>
          <p className="text-sm text-muted-foreground">Histórico de envases</p>
        </div>
        {erroAuxiliares ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2" role="alert">
            <p className="text-sm text-destructive">
              Falha ao carregar produtos. {erroAuxiliares}
            </p>
            <Button variant="outline" size="sm" onClick={() => carregarProdutos()}>
              Tentar novamente
            </Button>
          </div>
        ) : carregandoAuxiliares ? (
          <p className="text-sm text-muted-foreground" role="status">Carregando produtos…</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="envase-busca">Buscar</Label>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  id="envase-busca"
                  placeholder="Lote ou operador"
                  value={search}
                  onChange={aoFiltrarInput(setSearch)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="envase-produto">Produto</Label>
              <Select value={produtoFilter} onValueChange={aoFiltrar(setProdutoFilter)}>
                <SelectTrigger id="envase-produto" aria-label="Filtrar por produto"><SelectValue placeholder="Produto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os produtos</SelectItem>
                  {produtos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="envase-de">Data inicial</Label>
              <Input id="envase-de" type="date" value={dateFrom} onChange={aoFiltrarInput(setDateFrom)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="envase-ate">Data final</Label>
              <Input id="envase-ate" type="date" value={dateTo} onChange={aoFiltrarInput(setDateTo)} />
            </div>
          </div>
          {!periodo.valido && (
            <p className="mt-2 text-sm text-destructive" role="alert">{periodo.mensagem}</p>
          )}
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {!periodo.valido ? (
            <div className="p-6 text-sm text-muted-foreground">
              Corrija o período para consultar o histórico.
            </div>
          ) : historyCurrent && erro ? (
            <div className="p-6 space-y-3" role="alert">
              <p className="text-sm text-destructive">Falha ao carregar o histórico de envases. {erro}</p>
              <Button variant="outline" onClick={() => carregarHistorico()}>Tentar novamente</Button>
            </div>
          ) : loading || !historyCurrent ? (
            <div className="p-6 text-sm text-muted-foreground" role="status">Carregando envases…</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[750px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lote</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Embalagem</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Volume Total</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Etiqueta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {envases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          Nenhum envase registrado para os filtros aplicados
                        </TableCell>
                      </TableRow>
                    ) : envases.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono-data font-medium">{(e.lotes as any)?.codigo_lote || "—"}</TableCell>
                        <TableCell>{(e.lotes as any)?.produtos?.nome || "—"}</TableCell>
                        <TableCell>{embalagemLabels[e.tipo_embalagem] || e.tipo_embalagem}</TableCell>
                        <TableCell className="font-mono-data">{e.quantidade ?? "—"}</TableCell>
                        <TableCell className="font-mono-data">{e.volume_por_unidade && e.quantidade ? `${((e.volume_por_unidade * e.quantidade) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L` : "—"}</TableCell>
                        <TableCell>{e.operador || "—"}</TableCell>
                        <TableCell className="text-sm">{formatDateDisplay(e.data_envase)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <EtiquetaProdutoActions
                              envaseId={e.id}
                              etiquetaId={(e.produto_etiquetas as any)?.id || e.etiqueta_id || null}
                              traceToken={(e.produto_etiquetas as any)?.trace_token || null}
                              status={(e.produto_etiquetas as any)?.status || null}
                              onChanged={carregarHistorico}
                            />

                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-4">
                <p className="text-xs text-muted-foreground" role="status">
                  {total} envase(s) · página {pagina} de {paginas} ({PAGINA_ENVASE} por página)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagina >= paginas}
                    onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
                    aria-label="Próxima página"
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
