import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { AuxiliaryScreenBanner } from "@/components/AuxiliaryScreenBanner";
import { toast } from "sonner";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { embalagemLabels, embalagemVolumes, fmtL, defaultValidade } from "@/lib/envaseFormat";
import { formatDateDisplay } from "@/lib/date-utils";
import { useSearchParams } from "react-router-dom";
import { EtiquetaProdutoActions } from "@/components/etiquetas/EtiquetaProdutoActions";
import { CriarEmbalagensPosEnvaseDialog } from "@/components/estoque/CriarEmbalagensPosEnvaseDialog";
import {
  PAGINA_ENVASE,
  faixaDaPagina,
  totalDePaginas,
  validarPeriodo,
  podeComplementar,
  saldoMl as calcSaldoMl,
  volumeEnvasadoMl,
  quantidadeInteiraPositiva,
  validadeFutura,
  hojeLocalISO,
  carregarTudo,
  PAGINA_TECNICA,
} from "@/lib/envase/consulta";
import { useDebounce } from "@/hooks/useDebounce";

function CriarEmbalagensInline({ envaseId, loteId, produtoId, volumeSugerido, quantidadeSugerida }: {
  envaseId: string; loteId: string; produtoId: string | null; volumeSugerido: number; quantidadeSugerida: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-xs underline text-primary" onClick={() => setOpen(true)}>
        Criar embalagens
      </button>
      {open && (
        <CriarEmbalagensPosEnvaseDialog
          open={open}
          onOpenChange={setOpen}
          envaseId={envaseId}
          loteId={loteId}
          produtoId={produtoId}
          volumeSugerido={volumeSugerido}
          quantidadeSugerida={quantidadeSugerida}
        />
      )}
    </>
  );
}

interface LoteComplementar {
  id: string;
  codigo_lote: string;
  programacao_id: string | null;
  produtoNome: string;
  produzido: number;
  envasado: number;
  saldo: number;
}

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
  const [searchParams] = useSearchParams();
  const [envases, setEnvases] = useState<Envase[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);
  const [erroAuxiliares, setErroAuxiliares] = useState<string | null>(null);
  const [carregandoAuxiliares, setCarregandoAuxiliares] = useState(true);

  const [lotesComplementares, setLotesComplementares] = useState<LoteComplementar[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("os") || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [produtoFilter, setProdutoFilter] = useState("all");
  const [salvando, setSalvando] = useState(false);
  const submitLock = useRef(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const { registrarEnvaseEEstoque } = useEsteiraLaboratorio();
  const [form, setForm] = useState({
    lote_id: "", tipo_embalagem: "frasco_1L", quantidade: "", operador: "", validade: defaultValidade(),
  });

  /** Uma consulta por pausa de digitação, não por tecla. */
  const buscaDebounced = useDebounce(search.trim(), 400);
  const periodo = validarPeriodo(dateFrom, dateTo);
  const hoje = hojeLocalISO();

  /** Histórico: paginação server-side com contagem exata e filtros no banco. */
  const carregarHistorico = useCallback(async () => {
    if (!periodo.valido) return;
    setLoading(true);
    setErro(null);
    try {
      const termo = buscaDebounced;
      let loteIds: string[] = [];
      if (termo) {
        const encontrados = await carregarTudo<{ id: string }>(async (from, to) => {
          const { data, error } = await supabase
            .from("lotes")
            .select("id")
            .ilike("codigo_lote", `%${termo}%`)
            .order("id")
            .range(from, to);
          if (error) throw error;
          return (data ?? []) as { id: string }[];
        });
        loteIds = encontrados.map((l) => l.id);
      }

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
      if (error) throw error;
      setEnvases((data ?? []) as unknown as Envase[]);
      setTotal(count ?? 0);
    } catch (e: any) {
      setEnvases([]);
      setTotal(0);
      setErro(e?.message || "Não foi possível carregar o histórico de envases.");
    } finally {
      setLoading(false);
    }
  }, [buscaDebounced, produtoFilter, dateFrom, dateTo, pagina, periodo.valido]);

  /** Lotes elegíveis a complemento: último CQ aprovado + lote aprovado + saldo. */
  const carregarComplementares = useCallback(async () => {
    setCarregandoAuxiliares(true);
    setErroAuxiliares(null);
    try {
      // Sem teto: percorre todas as páginas técnicas de lotes aprovados e produtos.
      const lotes = await carregarTudo<any>(async (from, to) => {
        const { data, error } = await supabase
          .from("lotes")
          .select(
            "id, codigo_lote, status, volume_produzido, programacao_id, produtos(nome), controle_qualidade(id, seq, created_at, data_analise, resultado)",
          )
          .eq("status", "aprovado")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as any[];
      });

      const listaProdutos = await carregarTudo<{ id: string; nome: string }>(async (from, to) => {
        const { data, error } = await supabase
          .from("produtos")
          .select("id, nome")
          .order("nome")
          .order("id")
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as { id: string; nome: string }[];
      });
      setProdutos(listaProdutos);

      const ids = lotes.map((l: any) => l.id);
      if (!ids.length) { setLotesComplementares([]); return; }

      const evs = await carregarTudo<any>(async (from, to) => {
        const { data, error } = await supabase
          .from("envase")
          .select("lote_id, volume_por_unidade, quantidade")
          .in("lote_id", ids)
          .order("id")
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as any[];
      }, PAGINA_TECNICA);

      const porLote = new Map<string, any[]>();
      evs.forEach((ev: any) => {
        if (!porLote.has(ev.lote_id)) porLote.set(ev.lote_id, []);
        porLote.get(ev.lote_id)!.push(ev);
      });

      const elegiveis: LoteComplementar[] = [];
      lotes.forEach((l: any) => {
        const doLote = porLote.get(l.id) ?? [];
        const saldo = calcSaldoMl(l.volume_produzido, doLote);
        const ok = podeComplementar({
          status: l.status,
          cqs: l.controle_qualidade ?? [],
          saldoMl: saldo,
          jaIniciado: doLote.length > 0,
        });
        if (!ok) return;
        elegiveis.push({
          id: l.id,
          codigo_lote: l.codigo_lote,
          programacao_id: l.programacao_id ?? null,
          produtoNome: l.produtos?.nome ?? "",
          produzido: Number(l.volume_produzido || 0),
          envasado: volumeEnvasadoMl(doLote),
          saldo,
        });
      });
      setLotesComplementares(elegiveis);
    } catch (e: any) {
      // Falha NUNCA pode virar "sem opções".
      setLotesComplementares([]);
      setProdutos([]);
      setErroAuxiliares(e?.message || "Não foi possível carregar lotes com saldo e produtos.");
    } finally {
      setCarregandoAuxiliares(false);
    }
  }, []);

  useEffect(() => { carregarHistorico(); }, [carregarHistorico]);
  useEffect(() => { carregarComplementares(); }, [carregarComplementares]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { carregarHistorico(); carregarComplementares(); }, 1200);
    };
    const channel = supabase
      .channel("envase-lotes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "envase" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "lotes" }, debounced)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [carregarHistorico, carregarComplementares]);

  // Alterar filtros sempre volta à primeira página.
  const aoFiltrar = <T,>(set: (v: T) => void) => (v: T) => { setPagina(1); set(v); };
  /** Versão para <input>: extrai o valor do evento e volta à primeira página. */
  const aoFiltrarInput = (set: (v: string) => void) =>
    (e: ChangeEvent<HTMLInputElement>) => { setPagina(1); set(e.target.value); };

  const loteSel = useMemo(
    () => lotesComplementares.find((l) => l.id === form.lote_id) ?? null,
    [lotesComplementares, form.lote_id],
  );
  const volUnit = embalagemVolumes[form.tipo_embalagem] || 0;
  const qtdValida = quantidadeInteiraPositiva(form.quantidade);
  const volSolicitado = volUnit * (qtdValida ?? 0);
  const excedeSaldo = !!loteSel && volSolicitado > loteSel.saldo;
  const qtdMaxima = loteSel && volUnit > 0 ? Math.max(0, Math.floor(loteSel.saldo / volUnit)) : 0;
  const validadeOk = validadeFutura(form.validade, hoje);

  useEffect(() => {
    if (open) idempotencyKey.current = crypto.randomUUID();
  }, [open]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    if (!loteSel) { toast.error("Selecione um lote com saldo."); return; }
    if (!qtdValida) { toast.error("Informe uma quantidade inteira maior que zero."); return; }
    if (!validadeOk) { toast.error("Informe uma validade futura."); return; }
    if (excedeSaldo) {
      toast.error(`Volume (${fmtL(volSolicitado)}) excede o saldo (${fmtL(loteSel.saldo)}).`);
      return;
    }
    if (!loteSel.programacao_id) {
      toast.error("Programação vinculada ao lote não encontrada.");
      return;
    }

    submitLock.current = true;
    setSalvando(true);
    try {
      const { data: prog } = await supabase
        .from("programacao_producao")
        .select("ordem_servico_id, ordem_servico_onfarm_id, produto_id, microrganismo_id")
        .eq("id", loteSel.programacao_id)
        .maybeSingle();

      if (!prog) { toast.error("Programação não encontrada."); return; }

      const osId = prog.ordem_servico_onfarm_id || prog.ordem_servico_id;
      const origem = prog.ordem_servico_onfarm_id ? "onfarm" : "manual";

      const success = await registrarEnvaseEEstoque({
        envaseData: {
          lote_id: loteSel.id,
          tipo_embalagem: form.tipo_embalagem as any,
          volume_por_unidade: volUnit,
          quantidade: qtdValida,
          operador: form.operador || null,
        },
        estoqueData: {
          lote_id: loteSel.id,
          produto_id: prog.produto_id,
          microrganismo_id: prog.microrganismo_id || null,
          quantidade: qtdValida,
          volume_total: volSolicitado / 1000,
          validade: form.validade,
          status: "disponivel",
        },
        osId,
        origem,
        programacaoId: loteSel.programacao_id,
        idempotencyKey: idempotencyKey.current,
      } as any);

      if (success) {
        const novoSaldo = loteSel.saldo - volSolicitado;
        toast.success(
          novoSaldo <= 0
            ? "Lote totalmente envasado. Saldo zerado."
            : `Envase complementar registrado. Saldo restante: ${fmtL(novoSaldo)}.`,
        );
        setOpen(false);
        setForm({ lote_id: "", tipo_embalagem: "frasco_1L", quantidade: "", operador: "", validade: defaultValidade() });
        await Promise.all([carregarHistorico(), carregarComplementares()]);
      }
      // Falha: a MESMA chave é preservada — retry da mesma tentativa é replay.
    } finally {
      setSalvando(false);
      submitLock.current = false;
    }
  };

  const paginas = totalDePaginas(total);

  return (
    <div className="space-y-4 sm:space-y-6">
      <AuxiliaryScreenBanner
        title="Envase — consulta e complemento"
        description="O envase é iniciado pelo Cockpit Laboratório. Esta tela permite consultar o histórico e complementar envases quando ainda há saldo restante no lote."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Envase</h1>
          <p className="text-sm text-muted-foreground">Histórico de envases e complementos de saldo</p>
        </div>
        {lotesComplementares.length > 0 && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Envase complementar</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto">
              <DialogHeader><DialogTitle>Envase complementar</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="envase-lote">Lote com saldo *</Label>
                  <Select value={form.lote_id} onValueChange={(v) => setForm({ ...form, lote_id: v })}>
                    <SelectTrigger id="envase-lote" aria-label="Lote com saldo"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {lotesComplementares.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.codigo_lote} — {l.produtoNome} · saldo {fmtL(l.saldo)} de {fmtL(l.produzido)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {loteSel && (
                  <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Produzido</p>
                      <p className="text-sm font-mono-data font-semibold">{fmtL(loteSel.produzido)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Já envasado</p>
                      <p className="text-sm font-mono-data font-semibold">{fmtL(loteSel.envasado)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Disponível</p>
                      <p className={`text-sm font-mono-data font-semibold ${loteSel.saldo <= 0 ? "text-destructive" : "text-primary"}`}>
                        {fmtL(loteSel.saldo)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="envase-embalagem">Embalagem *</Label>
                    <Select value={form.tipo_embalagem} onValueChange={(v) => setForm({ ...form, tipo_embalagem: v })}>
                      <SelectTrigger id="envase-embalagem" aria-label="Embalagem"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(embalagemLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="envase-quantidade">Quantidade *</Label>
                    <Input
                      id="envase-quantidade"
                      type="number"
                      min={1}
                      step={1}
                      value={form.quantidade}
                      onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                      required
                    />
                    {form.quantidade && !qtdValida && (
                      <p className="text-xs text-destructive" role="alert">Informe um número inteiro maior que zero.</p>
                    )}
                    {loteSel && volUnit > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Máx.: <span className="font-mono-data font-semibold">{qtdMaxima}</span> un.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="envase-operador">Operador</Label>
                    <Input id="envase-operador" value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="envase-validade">Validade *</Label>
                    <Input
                      id="envase-validade"
                      type="date"
                      min={hoje}
                      value={form.validade}
                      onChange={(e) => setForm({ ...form, validade: e.target.value })}
                      required
                    />
                    {form.validade && !validadeOk && (
                      <p className="text-xs text-destructive" role="alert">A validade precisa ser uma data futura.</p>
                    )}
                  </div>
                </div>
                {volSolicitado > 0 && (
                  <div className={`rounded-lg border p-3 ${excedeSaldo ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
                    <p className={`text-sm font-medium ${excedeSaldo ? "text-destructive" : "text-primary"}`}>Volume total</p>
                    <p className={`text-lg font-mono-data font-bold ${excedeSaldo ? "text-destructive" : "text-primary"}`}>
                      {fmtL(volSolicitado)}
                    </p>
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={salvando || !form.lote_id || !qtdValida || !validadeOk || excedeSaldo}
                >
                  {salvando ? "Registrando..." : "Registrar envase complementar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
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
          ) : erro ? (
            <div className="p-6 space-y-3" role="alert">
              <p className="text-sm text-destructive">Falha ao carregar o histórico de envases. {erro}</p>
              <Button variant="outline" onClick={() => carregarHistorico()}>Tentar novamente</Button>
            </div>
          ) : loading ? (
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
                              loteId={e.lote_id}
                              etiquetaId={(e.produto_etiquetas as any)?.id || e.etiqueta_id || null}
                              traceToken={(e.produto_etiquetas as any)?.trace_token || null}
                              status={(e.produto_etiquetas as any)?.status || null}
                              onChanged={carregarHistorico}
                            />
                            <CriarEmbalagensInline
                              envaseId={e.id}
                              loteId={e.lote_id}
                              produtoId={(e.lotes as any)?.produto_id ?? null}
                              volumeSugerido={(e.volume_por_unidade || 1000) / 1000}
                              quantidadeSugerida={e.quantidade || 1}
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
