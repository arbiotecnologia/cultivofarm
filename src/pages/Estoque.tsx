import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Warehouse, History, XCircle, ArrowUpDown } from "lucide-react";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { ReservaDialog } from "@/components/estoque/ReservaDialog";

import { HistoricoSheet } from "@/components/estoque/HistoricoSheet";
import { EstoqueBI } from "@/components/estoque/EstoqueBI";
import { formatDateDisplay } from "@/lib/date-utils";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  disponivel: { label: "Disponível", variant: "default" },
  reservado: { label: "Reservado", variant: "secondary" },
  expedido: { label: "Expedido", variant: "outline" },
};

const itemNome = (e: any) => {
  if (e?.produtos?.nome) return e.produtos.nome;
  const m = e?.microrganismos;
  if (m) {
    const sp = m.nome_cientifico || "";
    return sp ? `${sp}${m.nome ? ` — ${m.nome}` : ""}` : m.nome;
  }
  return "—";
};

export default function Estoque() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ lote_id: "", produto_id: "", quantidade: "", volume_total: "", validade: "" });
  const { gerarEstoque, cancelarReservaEstoque } = useEsteiraLaboratorio();


  const [reservaItem, setReservaItem] = useState<any | null>(null);
  const [cancelarItem, setCancelarItem] = useState<any | null>(null);
  
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("recentes");

  const { data: estoques = [] } = useQuery({
    queryKey: ["estoque_produto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estoque_produto")
        .select("id, status, created_at, quantidade, validade, lote_id, produto_id, microrganismo_id, volume_total, reservado_para_cliente_id, reservado_para_os_id, reservado_para_os_tipo, lotes(codigo_lote, programacao_id), produtos(nome), microrganismos(nome, nome_cientifico)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const ids = Array.from(new Set((data || []).map((e: any) => e.reservado_para_cliente_id).filter(Boolean)));
      let map: Record<string, string> = {};
      if (ids.length) {
        const { data: cs } = await supabase.from("clientes").select("id, nome").in("id", ids);
        map = Object.fromEntries((cs || []).map((c: any) => [c.id, c.nome]));
      }

      // Enriquece com info amigável da OS (fazenda/talhão/data)
      const osPadraoIds = Array.from(new Set((data || []).filter((e: any) => e.reservado_para_os_id && e.reservado_para_os_tipo === "padrao").map((e: any) => e.reservado_para_os_id)));
      const osOnfarmIds = Array.from(new Set((data || []).filter((e: any) => e.reservado_para_os_id && e.reservado_para_os_tipo === "onfarm").map((e: any) => e.reservado_para_os_id)));
      const osMap: Record<string, { tipoLabel: string; fazenda?: string; talhao?: string; data?: string | null; titular?: string }> = {};
      if (osPadraoIds.length) {
        const { data: os } = await supabase
          .from("ordens_servico")
          .select("id, data_programada, fazendas(nome), talhoes(nome), clientes(nome), partner_orders(numero, partner_accounts(razao_social, nome_fantasia))")
          .in("id", osPadraoIds);
        (os || []).forEach((o: any) => {
          const pa = o.partner_orders?.partner_accounts;
          const partnerNome = pa?.nome_fantasia || pa?.razao_social;
          const titular = partnerNome
            ? `B2B · ${partnerNome}`
            : o.clientes?.nome;
          osMap[o.id] = { tipoLabel: partnerNome ? "B2B" : "Padrão", fazenda: o.fazendas?.nome, talhao: o.talhoes?.nome, data: o.data_programada, titular };
        });
      }
      if (osOnfarmIds.length) {
        const { data: os } = await supabase
          .from("ordens_servico_onfarm")
          .select("id, data_recomendada, fazendas(nome), talhoes(nome)")
          .in("id", osOnfarmIds);
        (os || []).forEach((o: any) => {
          osMap[o.id] = { tipoLabel: "Produção", fazenda: o.fazendas?.nome, talhao: o.talhoes?.nome, data: o.data_recomendada };
        });
      }

      // Busca data_envase mais recente por lote
      const loteIds = Array.from(new Set((data || []).map((e: any) => e.lote_id).filter(Boolean)));
      const envaseMap: Record<string, string> = {};
      if (loteIds.length) {
        const { data: envs } = await supabase
          .from("envase")
          .select("lote_id, data_envase")
          .in("lote_id", loteIds)
          .order("data_envase", { ascending: false });
        (envs || []).forEach((ev: any) => {
          if (!envaseMap[ev.lote_id]) envaseMap[ev.lote_id] = ev.data_envase;
        });
      }

      return (data || []).map((e: any) => ({
        ...e,
        cliente: e.reservado_para_cliente_id ? { nome: map[e.reservado_para_cliente_id] } : null,
        osInfo: e.reservado_para_os_id ? osMap[e.reservado_para_os_id] : null,
        data_envase: envaseMap[e.lote_id] || null,
      }));
    },
    staleTime: 30_000,
  });

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes-aprovados-envasados"],
    queryFn: async () => {
      const { data: lts } = await supabase
        .from("lotes")
        .select("id, codigo_lote, produto_id, microrganismo_id, programacao_id")
        .eq("status", "aprovado");
      const ids = (lts || []).map(l => l.id);
      if (!ids.length) return [];
      const [{ data: envases }, { data: estoquesExist }] = await Promise.all([
        supabase.from("envase").select("lote_id").in("lote_id", ids),
        supabase.from("estoque_produto").select("lote_id").in("lote_id", ids),
      ]);
      const comEnvase = new Set((envases || []).map((e: any) => e.lote_id));
      const jaNoEstoque = new Set((estoquesExist || []).map((e: any) => e.lote_id));
      return (lts || []).filter(l => comEnvase.has(l.id) && !jaNoEstoque.has(l.id));
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const lote: any = lotes.find(l => l.id === form.lote_id);
      const produtoId = lote?.produto_id || null;
      const microrganismoId = lote?.microrganismo_id || null;
      if (!produtoId && !microrganismoId) throw new Error("Lote selecionado não possui produto nem microrganismo vinculado.");
      
      const { data: jaExiste } = await supabase
        .from("estoque_produto")
        .select("id")
        .eq("lote_id", form.lote_id)
        .limit(1);
      if (jaExiste && jaExiste.length > 0) {
        throw new Error("Este lote já possui entrada no estoque.");
      }

      const { data: prog } = await supabase
        .from("programacao_producao")
        .select("ordem_servico_id, ordem_servico_onfarm_id")
        .eq("id", lote.programacao_id)
        .single();
      
      const osId = prog?.ordem_servico_onfarm_id || prog?.ordem_servico_id;
      const origem = prog?.ordem_servico_onfarm_id ? "onfarm" : "manual";

      const estoqueData = {
        lote_id: form.lote_id,
        produto_id: produtoId,
        microrganismo_id: microrganismoId,
        quantidade: form.quantidade ? Number(form.quantidade) : null,
        volume_total: form.volume_total ? Number(form.volume_total) : null,
        validade: form.validade || null,
      };

      await gerarEstoque(estoqueData, osId, origem);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estoque_produto"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-bi-stats"] });
      queryClient.invalidateQueries({ queryKey: ["lotes-aprovados-envasados"] });
      setOpen(false);
      setForm({ lote_id: "", produto_id: "", quantidade: "", volume_total: "", validade: "" });
      toast.success("Estoque registrado com sucesso");
    },
    onError: (e: Error) => toast.error(e.message),

  });


  const handleCancelarReserva = async (item: any) => {
    const osId = item.reservado_para_os_id;
    const origem = item.reservado_para_os_tipo === "onfarm" ? "onfarm" : "manual";
    
    if (!osId) {
      toast.error("OS não vinculada à reserva");
      return;
    }

    const success = await cancelarReservaEstoque(
      item,
      osId,
      origem,
      "Cancelamento manual da reserva pelo módulo de Estoque",
    );

    if (success) {
      setCancelarItem(null);
    }
  };


  const renderActions = (e: any, mobile = false) => (
    <>
      {e.status === "disponivel" && (
        <Button size="sm" variant="outline" className={mobile ? "flex-1" : ""} onClick={() => setReservaItem(e)}>Reservar</Button>
      )}
      {e.status === "reservado" && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setCancelarItem(e)} title="Cancelar reserva" className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <XCircle className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={() => setHistoricoId(e.id)} title="Histórico">
        <History className="h-4 w-4" />
      </Button>
    </>
  );

  const renderReservadoPara = (e: any) => {
    if (e.status !== "reservado") return "—";
    const local = e.osInfo?.fazenda && e.osInfo?.talhao
      ? `${e.osInfo.fazenda} / ${e.osInfo.talhao}`
      : e.osInfo?.fazenda;
    const titular = e.osInfo?.titular || e.cliente?.nome || "Cliente";
    const partes = [
      titular,
      e.osInfo?.tipoLabel && `OS ${e.osInfo.tipoLabel}`,
      local,
      e.osInfo?.data && formatDateDisplay(e.osInfo.data),
    ].filter(Boolean);
    return partes.join(" · ");
  };

  const estoquesOrdenados = useMemo(() => {
    const arr = [...estoques];
    const statusWeight: Record<string, number> = { disponivel: 0, reservado: 1, expedido: 2 };
    const cmpDate = (a: any, b: any, asc: boolean) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return asc ? new Date(a).getTime() - new Date(b).getTime() : new Date(b).getTime() - new Date(a).getTime();
    };
    const cmpStr = (a?: string, b?: string) => (a || "").localeCompare(b || "", "pt-BR");
    switch (sortBy) {
      case "antigos": arr.sort((a, b) => cmpDate(a.created_at, b.created_at, true)); break;
      case "validade_asc": arr.sort((a, b) => cmpDate(a.validade, b.validade, true)); break;
      case "validade_desc": arr.sort((a, b) => cmpDate(a.validade, b.validade, false)); break;
      case "envase_desc": arr.sort((a, b) => cmpDate(a.data_envase, b.data_envase, false)); break;
      case "envase_asc": arr.sort((a, b) => cmpDate(a.data_envase, b.data_envase, true)); break;
      case "produto_asc": arr.sort((a, b) => cmpStr(itemNome(a), itemNome(b))); break;
      case "lote_asc": arr.sort((a, b) => cmpStr(a.lotes?.codigo_lote, b.lotes?.codigo_lote)); break;
      case "status": arr.sort((a, b) => (statusWeight[a.status] ?? 99) - (statusWeight[b.status] ?? 99)); break;
      case "recentes":
      default: arr.sort((a, b) => cmpDate(a.created_at, b.created_at, false)); break;
    }
    return arr;
  }, [estoques, sortBy]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Estoque"
        description="Controle de produtos acabados"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm font-bold sm:font-medium shadow-md">
                <Plus className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />Entrada no Estoque
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto">
              <DialogHeader><DialogTitle>Nova Entrada</DialogTitle></DialogHeader>
              <div className="form-spacing-mobile pt-2">
                <div className="space-y-1.5 sm:space-y-1">
                  <Label>Lote (aprovado)</Label>
                  <Select value={form.lote_id} onValueChange={v => { setForm(f => ({ ...f, lote_id: v })); }}>
                    <SelectTrigger><SelectValue placeholder={lotes.length ? "Selecione o lote" : "Nenhum lote envasado disponível"} /></SelectTrigger>
                    <SelectContent>
                      {lotes.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum lote envasado e disponível para entrada.</div>}
                      {lotes.map(l => <SelectItem key={l.id} value={l.id}>{l.codigo_lote}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:space-y-1"><Label>Quantidade (un)</Label><Input type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} /></div>
                  <div className="space-y-1.5 sm:space-y-1"><Label>Volume Total (L)</Label><Input type="number" value={form.volume_total} onChange={e => setForm(f => ({ ...f, volume_total: e.target.value }))} /></div>
                </div>
                <div className="space-y-1.5 sm:space-y-1"><Label>Validade</Label><Input type="date" value={form.validade} onChange={e => setForm(f => ({ ...f, validade: e.target.value }))} /></div>
                <Button className="w-full h-12 sm:h-10 font-bold" onClick={() => createMutation.mutate()} disabled={!form.lote_id}>Registrar Entrada</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <EstoqueBI />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Warehouse className="h-5 w-5" />Produtos em Estoque</CardTitle>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[220px] h-9"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recentes">Mais recentes</SelectItem>
                <SelectItem value="antigos">Mais antigos</SelectItem>
                <SelectItem value="validade_asc">Validade mais próxima</SelectItem>
                <SelectItem value="validade_desc">Validade mais distante</SelectItem>
                <SelectItem value="envase_desc">Envasado mais recente</SelectItem>
                <SelectItem value="envase_asc">Envasado mais antigo</SelectItem>
                <SelectItem value="produto_asc">Produto (A–Z)</SelectItem>
                <SelectItem value="lote_asc">Lote (A–Z)</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "p-3" : "p-0 sm:p-6 sm:pt-0"}>
          <ResponsiveTable
            mobileCards={
              estoquesOrdenados.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">Nenhum item em estoque</div>
              ) : (
                estoquesOrdenados.map((e: any) => (
                  <MobileCard
                    key={e.id}
                    title={itemNome(e)}
                    subtitle={e.lotes?.codigo_lote || "—"}
                    status={<Badge variant={STATUS_LABELS[e.status]?.variant || "outline"}>{STATUS_LABELS[e.status]?.label || e.status}</Badge>}
                    content={[
                      { label: "Qtd", value: e.quantidade },
                      { label: "Volume", value: e.volume_total ? `${e.volume_total} L` : "—" },
                      { label: "Envasado em", value: e.data_envase ? formatDateDisplay(e.data_envase) : "—" },
                      { label: "Validade", value: e.validade ? formatDateDisplay(e.validade) : "—" },
                      { label: "Reservado para", value: renderReservadoPara(e) },
                    ]}
                    actions={renderActions(e, true)}
                  />
                ))
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Envasado em</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Reservado para</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estoquesOrdenados.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhum item em estoque</TableCell></TableRow>
                ) : estoquesOrdenados.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{itemNome(e)}</TableCell>
                    <TableCell className="font-mono-data text-xs">{e.lotes?.codigo_lote}</TableCell>
                    <TableCell>{e.data_envase ? formatDateDisplay(e.data_envase) : "—"}</TableCell>
                    <TableCell>{e.quantidade}</TableCell>
                    <TableCell>{e.volume_total ? `${e.volume_total} L` : "—"}</TableCell>
                    <TableCell>{e.validade ? formatDateDisplay(e.validade) : "—"}</TableCell>
                    <TableCell className="text-xs">{renderReservadoPara(e)}</TableCell>
                    <TableCell><Badge variant={STATUS_LABELS[e.status]?.variant || "outline"}>{STATUS_LABELS[e.status]?.label || e.status}</Badge></TableCell>
                    <TableCell className="space-x-1">{renderActions(e)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ResponsiveTable>
        </CardContent>
      </Card>

      {reservaItem && (
        <ReservaDialog
          open={!!reservaItem}
          onOpenChange={(v) => !v && setReservaItem(null)}
          item={reservaItem}
          onReserved={() => {
            const osParam = searchParams.get("os");
            const next = searchParams.get("next");
            if (osParam && next === "entrega") {
              setReservaItem(null);
              navigate(`/entregas?os=${osParam}`);
            }
          }}
        />
      )}

      <Dialog open={!!cancelarItem} onOpenChange={(v) => !v && setCancelarItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar Cancelamento de Reserva</DialogTitle>
            <DialogDescription>
              Você está prestes a cancelar a reserva do lote <span className="font-bold text-foreground">{cancelarItem?.lotes?.codigo_lote}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Quantidade a devolver:</span>
              <span className="font-bold">{cancelarItem?.quantidade} unidades</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Volume a devolver:</span>
              <span className="font-bold">{cancelarItem?.volume_total} L</span>
            </div>
            <p className="text-sm text-muted-foreground italic">
              Este saldo será reintegrado ao registro disponível do mesmo lote.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelarItem(null)}>Voltar</Button>
            <Button 
              variant="destructive" 
              onClick={() => handleCancelarReserva(cancelarItem)}
            >
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HistoricoSheet open={!!historicoId} onOpenChange={(v) => !v && setHistoricoId(null)} itemId={historicoId} />
    </div>
  );
}
