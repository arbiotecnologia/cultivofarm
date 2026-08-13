import { useEffect, useMemo, useState } from "react";
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
import { useState as useStateInline } from "react";

function CriarEmbalagensInline({ envaseId, loteId, produtoId, volumeSugerido, quantidadeSugerida }: {
  envaseId: string; loteId: string; produtoId: string | null; volumeSugerido: number; quantidadeSugerida: number;
}) {
  const [open, setOpen] = useStateInline(false);
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

interface LoteAprovado {
  id: string; codigo_lote: string; status: string;
  volume_produzido: number | null;
  programacao_id: string | null;
  produto_id: string | null;
  microrganismo_id: string | null;
  produtos?: { nome: string } | null;
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
  etiqueta_gerada?: boolean | null;
  lotes?: { codigo_lote: string; produtos?: { nome: string } | null } | null;
  produto_etiquetas?: { id: string; status: string; trace_token: string; codigo_etiqueta: string } | null;
}

export default function Envase() {
  const [searchParams] = useSearchParams();
  const [envases, setEnvases] = useState<Envase[]>([]);
  const [lotes, setLotes] = useState<LoteAprovado[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("os") || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [produtoFilter, setProdutoFilter] = useState("all");
  const { registrarEnvaseEEstoque } = useEsteiraLaboratorio();
  const [form, setForm] = useState({
    lote_id: "", tipo_embalagem: "frasco_1L", quantidade: "", operador: "", validade: defaultValidade(),
  });

  const fetchAll = async () => {
    // Filtro padrão: últimos 90 dias (envases e lotes antigos permanecem via detalhe)
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: e }, { data: l }] = await Promise.all([
      (supabase as any).from("envase").select("*, lotes(codigo_lote, produto_id, produtos(nome)), produto_etiquetas:etiqueta_id(id, status, trace_token, codigo_etiqueta)").gte("created_at", since90).order("created_at", { ascending: false }).limit(200),
      (supabase as any).from("lotes").select("id, codigo_lote, status, volume_produzido, programacao_id, produto_id, microrganismo_id, produtos(nome), controle_qualidade(resultado)").gte("created_at", since90).order("created_at", { ascending: false }).limit(200),
    ]);
    if (e) setEnvases(e as any[]);
    if (l) setLotes(l as any[]);
  };


  useEffect(() => {
    fetchAll();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { fetchAll(); }, 1200);
    };
    const channel = supabase
      .channel("envase-lotes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "envase" }, debouncedFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "lotes" }, debouncedFetch)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);


  const lotesAprovados = lotes.filter((l: any) =>
    l.status === "aprovado" ||
    (l.controle_qualidade && l.controle_qualidade.some((cq: any) => cq.resultado === "aprovado"))
  );

  const saldoPorLote = new Map<string, { produzido: number; envasado: number; saldo: number }>();
  for (const l of lotesAprovados) {
    const produzido = Number(l.volume_produzido || 0);
    const envasado = envases
      .filter((ev) => ev.lote_id === l.id)
      .reduce((s, ev) => s + (Number(ev.volume_por_unidade || 0) * Number(ev.quantidade || 0)), 0);
    saldoPorLote.set(l.id, { produzido, envasado, saldo: produzido - envasado });
  }

  const lotesComplementares = lotesAprovados.filter((l) => {
    const s = saldoPorLote.get(l.id);
    const jaIniciado = envases.some((ev) => ev.lote_id === l.id);
    return jaIniciado && s && s.saldo > 0;
  });

  const saldoSel = form.lote_id ? saldoPorLote.get(form.lote_id) : undefined;
  const volUnit = embalagemVolumes[form.tipo_embalagem] || 0;
  const qtdNum = Number(form.quantidade || 0);
  const volSolicitado = volUnit * qtdNum;
  const excedeSaldo = !!saldoSel && volSolicitado > saldoSel.saldo;
  const qtdMaxima = saldoSel && volUnit > 0 ? Math.max(0, Math.floor(saldoSel.saldo / volUnit)) : 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (excedeSaldo) {
      toast.error(`Volume (${fmtL(volSolicitado)}) excede o saldo (${fmtL(saldoSel!.saldo)}).`);
      return;
    }

    const selectedLote = lotes.find((l) => l.id === form.lote_id);
    if (!selectedLote?.programacao_id) {
      toast.error("Programação vinculada ao lote não encontrada.");
      return;
    }

    const { data: prog } = await supabase
      .from("programacao_producao")
      .select("ordem_servico_id, ordem_servico_onfarm_id, produto_id, microrganismo_id")
      .eq("id", selectedLote.programacao_id)
      .single();

    if (!prog) {
      toast.error("Programação não encontrada.");
      return;
    }

    const osId = (prog as any).ordem_servico_onfarm_id || (prog as any).ordem_servico_id;
    const origem = (prog as any).ordem_servico_onfarm_id ? "onfarm" : "manual";
    const volumeUnitValue = embalagemVolumes[form.tipo_embalagem] || 0;

    const success = await registrarEnvaseEEstoque({
      envaseData: {
        lote_id: form.lote_id,
        tipo_embalagem: form.tipo_embalagem as any,
        volume_por_unidade: volumeUnitValue,
        quantidade: form.quantidade ? Number(form.quantidade) : null,
        operador: form.operador || null,
      },
      estoqueData: {
        lote_id: form.lote_id,
        produto_id: (prog as any).produto_id,
        microrganismo_id: (prog as any).microrganismo_id || null,
        quantidade: Number(form.quantidade),
        volume_total: volSolicitado / 1000,
        validade: form.validade || null,
        status: "disponivel",
      },
      osId,
      origem,
      programacaoId: selectedLote.programacao_id
    });

    if (success) {
      const s = saldoPorLote.get(form.lote_id);
      const novoSaldo = s ? s.saldo - volSolicitado : 0;
      if (novoSaldo <= 0) {
        toast.success("Lote totalmente envasado. Saldo zerado.");
      } else {
        toast.success(`Envase complementar registrado. Saldo restante: ${fmtL(novoSaldo)}.`);
      }
      setOpen(false);
      setForm({ lote_id: "", tipo_embalagem: "frasco_1L", quantidade: "", operador: "", validade: defaultValidade() });
      fetchAll();
    }
  };

  const produtosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    envases.forEach((e) => {
      const nome = (e.lotes as any)?.produtos?.nome;
      if (nome) set.add(nome);
    });
    return Array.from(set).sort();
  }, [envases]);

  const filtered = envases.filter((e) => {
    const txt = search.toLowerCase();
    if (txt &&
      !((e.lotes as any)?.codigo_lote?.toLowerCase().includes(txt) ||
        e.operador?.toLowerCase().includes(txt))) return false;
    if (produtoFilter !== "all" && (e.lotes as any)?.produtos?.nome !== produtoFilter) return false;
    if (dateFrom && new Date(e.data_envase) < new Date(dateFrom)) return false;
    if (dateTo && new Date(e.data_envase) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

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
                  <Label>Lote com saldo *</Label>
                  <Select value={form.lote_id} onValueChange={(v) => setForm({ ...form, lote_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {lotesComplementares.map((l) => {
                        const s = saldoPorLote.get(l.id);
                        return (
                          <SelectItem key={l.id} value={l.id}>
                            {l.codigo_lote} — {(l.produtos as any)?.nome || ""}
                            {s ? ` · saldo ${fmtL(s.saldo)} de ${fmtL(s.produzido)}` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {saldoSel && (
                  <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Produzido</p>
                      <p className="text-sm font-mono-data font-semibold">{fmtL(saldoSel.produzido)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Já envasado</p>
                      <p className="text-sm font-mono-data font-semibold">{fmtL(saldoSel.envasado)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Disponível</p>
                      <p className={`text-sm font-mono-data font-semibold ${saldoSel.saldo <= 0 ? "text-destructive" : "text-primary"}`}>
                        {fmtL(saldoSel.saldo)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Embalagem *</Label>
                    <Select value={form.tipo_embalagem} onValueChange={(v) => setForm({ ...form, tipo_embalagem: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(embalagemLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade *</Label>
                    <Input type="number" min={1} value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} required />
                    {saldoSel && volUnit > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Máx.: <span className="font-mono-data font-semibold">{qtdMaxima}</span> un.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Operador</Label>
                    <Input value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Validade *</Label>
                    <Input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} required />
                  </div>
                </div>
                {form.quantidade && (
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
                  disabled={!form.lote_id || !form.quantidade || !form.validade || excedeSaldo}
                >
                  Registrar envase complementar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input placeholder="Buscar por lote ou operador..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:max-w-sm" />
            </div>
            <Select value={produtoFilter} onValueChange={setProdutoFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Produto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os produtos</SelectItem>
                {produtosDisponiveis.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" placeholder="De" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" placeholder="Até" />
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
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
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum envase registrado</TableCell></TableRow>
              ) : filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono-data font-medium">{(e.lotes as any)?.codigo_lote || "—"}</TableCell>
                  <TableCell>{(e.lotes as any)?.produtos?.nome || "—"}</TableCell>
                  <TableCell>{embalagemLabels[e.tipo_embalagem] || e.tipo_embalagem}</TableCell>
                  <TableCell className="font-mono-data">{e.quantidade || "—"}</TableCell>
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
                        onChanged={fetchAll}
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
        </CardContent>
      </Card>
    </div>
  );
}