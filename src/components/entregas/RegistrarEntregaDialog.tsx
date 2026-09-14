import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Truck, Package, AlertTriangle, ListChecks, MapPin, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SeletorLoteEnvasado } from "./SeletorLoteEnvasado";
import { formatOS, formatOsOuOp } from "@/lib/osLabel";
import { useNavigate } from "react-router-dom";
import { getOSPartyLabel } from "@/lib/clienteLabel";
import { formatDateDisplay } from "@/lib/date-utils";
import { formatProdutoOuMicro, formatLoteCodigo, formatEmbalagem } from "@/lib/entregaLoteLabel";
import { supabase } from "@/integrations/supabase/client";
import { resolveDestinatarioFromOS, emptyDestinatario, type DestinatarioSnapshot } from "@/lib/entregaDestinatario";
import { calcularVolumePreviewMl } from "@/lib/entregas/volumeEstoque";
import { labelResponsavel } from "@/lib/entregas/modalidade";

export type LinhaEntrega = {
  estoque_produto_id: string;
  quantidade: string;
};

export type RegistrarEntregaSubmit = {
  grupoId: string;
  itens: { item: any; quantidade: number }[];
  osId: string;
  osTipo: string;
  tipo_entrega: "motorista" | "retirada";
  motorista: string;
  veiculo: string;
  data_saida: string;
  motorista_telefone: string;
  motorista_documento: string;
  veiculo_placa: string;
  veiculo_tipo: string;
  hora_saida_prevista: string;
  data_chegada_prevista: string;
  hora_chegada_prevista: string;
  destinatario_nome: string;
  destinatario_telefone: string;
  destinatario_whatsapp: string;
  endereco_origem: "cadastro" | "personalizado";
  endereco_logradouro: string;
  endereco_numero: string;
  endereco_complemento: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf: string;
  endereco_cep: string;
  endereco_referencia: string;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itensSelecionaveis: any[];
  todasOS: any[];
  osInicial?: string;
  onSubmit: (payload: RegistrarEntregaSubmit) => Promise<void> | void;
  submitting?: boolean;
}


export function RegistrarEntregaDialog({ open, onOpenChange, itensSelecionaveis, todasOS, osInicial, onSubmit, submitting }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"os" | "lotes">("os");
  const [osSelecionada, setOsSelecionada] = useState("");
  const [linhas, setLinhas] = useState<LinhaEntrega[]>([]);
  const [tipoEntrega, setTipoEntrega] = useState<"motorista" | "retirada">("motorista");
  const [motorista, setMotorista] = useState("");
  const [veiculo, setVeiculo] = useState("");
  const [dataSaida, setDataSaida] = useState("");
  const [motoristaTelefone, setMotoristaTelefone] = useState("");
  const [motoristaDocumento, setMotoristaDocumento] = useState("");
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [veiculoTipo, setVeiculoTipo] = useState("");
  const [horaSaidaPrevista, setHoraSaidaPrevista] = useState("");
  const [dataChegadaPrevista, setDataChegadaPrevista] = useState("");
  const [horaChegadaPrevista, setHoraChegadaPrevista] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [enderecoOrigem, setEnderecoOrigem] = useState<"cadastro" | "personalizado">("cadastro");
  const [destinatario, setDestinatario] = useState<DestinatarioSnapshot>(emptyDestinatario());
  const [loadingDest, setLoadingDest] = useState(false);
  const [osExtra, setOsExtra] = useState<any | null>(null); // OS buscada sob demanda quando não está em todasOS
  const [mostrarTodosLotes, setMostrarTodosLotes] = useState(false); // override para exibir lotes fora do escopo da OS
  const [overrideConfirmado, setOverrideConfirmado] = useState<Set<string>>(new Set()); // ids de estoque_produto liberados manualmente
  const [pendingOverrideId, setPendingOverrideId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setOsSelecionada("");
      setLinhas([]);
      setTipoEntrega("motorista");
      setMotorista("");
      setVeiculo("");
      setDataSaida("");
      setMotoristaTelefone("");
      setMotoristaDocumento("");
      setVeiculoPlaca("");
      setVeiculoTipo("");
      setHoraSaidaPrevista("");
      setDataChegadaPrevista("");
      setHoraChegadaPrevista("");
      setEnderecoOrigem("cadastro");
      setDestinatario(emptyDestinatario());
      setOsExtra(null);
      setMostrarTodosLotes(false);
      setOverrideConfirmado(new Set());
      setPendingOverrideId(null);
      setTab("os");
    }
  }, [open]);

  // Pré-seleciona a OS quando vinda do cockpit (via prop osInicial)
  useEffect(() => {
    if (!open || !osInicial) return;
    setTab("os");
    setOsSelecionada(osInicial);
  }, [open, osInicial]);

  // Itens reservados para a OS escolhida no modo "Por OS"
  useEffect(() => {
    if (tab !== "os" || !osSelecionada) return;
    const reservados = itensSelecionaveis.filter(
      (it) => it.reservado_para_os_id === osSelecionada && it.status === "reservado",
    );
    setLinhas(
      reservados.map((it) => ({
        estoque_produto_id: it.id,
        quantidade: String(Math.min(it._saldo, it._saldo_reserva || it._saldo)),
      })),
    );
  }, [osSelecionada, tab, itensSelecionaveis]);

  // OSs que possuem ao menos um lote reservado disponível.
  // Injeta também a OS pré-selecionada via cockpit (osInicial) mesmo sem reserva,
  // para que ela apareça no dropdown com um marcador "sem reserva".
  const osComLotes = useMemo(() => {
    const ids = new Set<string>();
    itensSelecionaveis.forEach((it) => {
      if (it.reservado_para_os_id && it.status === "reservado") ids.add(it.reservado_para_os_id);
    });
    const base = (todasOS as any[]).filter((o) => ids.has(o.id));
    // Adiciona osInicial se ainda não estiver na lista
    if (osInicial && !base.some((o) => o.id === osInicial)) {
      const fromTodas = (todasOS as any[]).find((o) => o.id === osInicial);
      const extra = fromTodas || (osExtra?.id === osInicial ? osExtra : null);
      if (extra) return [{ ...extra, __sem_reserva: true }, ...base];
    }
    return base;
  }, [itensSelecionaveis, todasOS, osInicial, osExtra]);

  // Toggle multi-seleção no modo "Por lotes". Se o lote está fora do escopo da
  // OS em contexto, dispara um AlertDialog de confirmação antes de aceitar.
  const toggleLote = (id: string) => {
    const item = itensSelecionaveis.find((i) => i.id === id);
    if (!item) return;
    const jaSelecionado = linhas.some((l) => l.estoque_produto_id === id);
    if (
      !jaSelecionado &&
      osContextoId &&
      item._os_origem_id &&
      item._os_origem_id !== osContextoId &&
      item.reservado_para_os_id !== osContextoId &&
      !overrideConfirmado.has(id)
    ) {
      setPendingOverrideId(id);
      return;
    }
    setLinhas((prev) => {
      const existe = prev.find((l) => l.estoque_produto_id === id);
      if (existe) return prev.filter((l) => l.estoque_produto_id !== id);
      const qtdDefault = item.status === "reservado"
        ? Math.min(item._saldo, item._saldo_reserva || item._saldo)
        : item._saldo;
      return [...prev, { estoque_produto_id: id, quantidade: String(qtdDefault) }];
    });
  };

  const itensSelecionados = useMemo(
    () =>
      linhas
        .map((l) => {
          const item = itensSelecionaveis.find((i) => i.id === l.estoque_produto_id);
          if (!item) return null;
          return { ...l, item };
        })
        .filter(Boolean) as (LinhaEntrega & { item: any })[],
    [linhas, itensSelecionaveis],
  );

  // OS implícita: todos os itens devem convergir para uma única OS.
  const osDosItens = useMemo(() => {
    const set = new Set<string>();
    itensSelecionados.forEach((l) => {
      if (l.item.reservado_para_os_id) set.add(l.item.reservado_para_os_id);
    });
    return Array.from(set);
  }, [itensSelecionados]);

  const [osLivreEscolhida, setOsLivreEscolhida] = useState("");
  useEffect(() => { setOsLivreEscolhida(""); }, [tab]);

  const todosLivres = itensSelecionados.length > 0 && osDosItens.length === 0;
  const conflitoMultiOS = osDosItens.length > 1;
  const osEfetivaId = osDosItens[0] || osLivreEscolhida || osSelecionada;
  const osEfetiva =
    (todasOS as any[]).find((o) => o.id === osEfetivaId) ||
    (osExtra?.id === osEfetivaId ? osExtra : null);

  // Se a OS (reservada ou vinda do cockpit) não estiver em todasOS, busca sob demanda.
  useEffect(() => {
    const alvo = osEfetivaId || osInicial;
    if (!open || !alvo) return;
    if ((todasOS as any[]).some((o) => o.id === alvo)) return;
    if (osExtra?.id === alvo) return;
    let cancelled = false;
    (async () => {
      const { data: p } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status, cliente_id, origem, partner_order_id, clientes(nome, codigo_cliente), produtos(nome), partner_orders:partner_order_id(numero, partner_id, partner_accounts:partner_id(codigo, nome_fantasia, razao_social))")
        .eq("id", alvo)
        .maybeSingle();
      if (cancelled) return;
      if (p) { setOsExtra({ ...p as any, type: "padrao" } as any); return; }
      const { data: f } = await supabase
        .from("ordens_servico_onfarm")
        .select("id, numero_os, status, cliente_id, clientes(nome, codigo_cliente), produtos(nome)")
        .eq("id", alvo)
        .maybeSingle();
      if (!cancelled && f) setOsExtra({ ...f as any, type: "onfarm" } as any);
    })();
    return () => { cancelled = true; };
  }, [open, osEfetivaId, osInicial, todasOS, osExtra]);

  // OS em contexto para filtragem de lotes: prioriza a OS vinda do cockpit,
  // depois a OS explicitamente escolhida no dropdown.
  const osContextoId = osInicial || osSelecionada || null;

  // Lotes que pertencem à OS em contexto (via lote.programacao.ordem_servico[_onfarm]_id)
  // ou já estão reservados manualmente para ela.
  const itensDoContexto = useMemo(() => {
    if (!osContextoId) return itensSelecionaveis;
    return itensSelecionaveis.filter(
      (it: any) =>
        it._os_origem_id === osContextoId ||
        it.reservado_para_os_id === osContextoId
    );
  }, [itensSelecionaveis, osContextoId]);

  // Itens exibidos no seletor de lotes: por padrão, apenas os do contexto.
  // O usuário pode optar por ver todos (com aviso), mas cada seleção fora do
  // escopo exige confirmação explícita.
  const itensParaSeletor = useMemo(() => {
    if (!osContextoId || mostrarTodosLotes) return itensSelecionaveis;
    return itensDoContexto;
  }, [osContextoId, mostrarTodosLotes, itensSelecionaveis, itensDoContexto]);

  const isForaDoContexto = useCallback(
    (item: any): boolean => {
      if (!osContextoId) return false;
      if (!item) return false;
      if (item._os_origem_id === osContextoId) return false;
      if (item.reservado_para_os_id === osContextoId) return false;
      return true;
    },
    [osContextoId]
  );

  const linhasForaDoContexto = useMemo(
    () =>
      itensSelecionados.filter(
        (l) => isForaDoContexto(l.item) && !overrideConfirmado.has(l.item.id)
      ),
    [itensSelecionados, isForaDoContexto, overrideConfirmado]
  );

  // Auto-preencher destinatário quando a OS mudar (modo "cadastro")
  useEffect(() => {
    if (!open || !osEfetiva || enderecoOrigem !== "cadastro") return;
    let cancelled = false;
    (async () => {
      setLoadingDest(true);
      const tipo = (osEfetiva as any).type || "padrao";
      const snap = await resolveDestinatarioFromOS(osEfetiva.id, tipo);
      if (!cancelled) { setDestinatario(snap); setLoadingDest(false); }
    })();
    return () => { cancelled = true; };
  }, [open, osEfetiva?.id, enderecoOrigem]);

  const totalUnidades = itensSelecionados.reduce(
    (acc, l) => acc + (Number(l.quantidade) || 0),
    0,
  );
  // Preview do volume a partir do item de estoque (volume_total / quantidade).
  // Não usa o último envase do lote: um lote pode ter várias embalagens.
  const previewVolume = calcularVolumePreviewMl(
    itensSelecionados.map((l) => ({ item: l.item, quantidade: l.quantidade })),
  );

  const linhasComErro = itensSelecionados.filter((l) => {
    const q = Number(l.quantidade) || 0;
    if (q <= 0) return true;
    if (q > l.item._saldo) return true;
    if (l.item.status === "reservado" && q > l.item._saldo_reserva) return true;
    return false;
  });

  const canSubmit =
    itensSelecionados.length > 0 &&
    !conflitoMultiOS &&
    linhasComErro.length === 0 &&
    linhasForaDoContexto.length === 0 &&
    (osDosItens.length === 1 || !!osEfetiva);

  const updateQtd = (id: string, qtd: string) => {
    setLinhas((prev) => prev.map((l) => (l.estoque_produto_id === id ? { ...l, quantidade: qtd } : l)));
  };

  const setDestField = (k: keyof DestinatarioSnapshot, v: string) =>
    setDestinatario((d) => ({ ...d, [k]: v }));

  const preencherDoCadastro = async () => {
    if (!osEfetiva) return;
    setLoadingDest(true);
    const snap = await resolveDestinatarioFromOS(osEfetiva.id, (osEfetiva as any).type || "padrao");
    setDestinatario(snap);
    setLoadingDest(false);
    toast.success("Endereço preenchido com base no cadastro.");
  };

  const handleConfirmar = async () => {
    if (!osEfetiva) { toast.error("Selecione a OS de destino."); return; }
    if (linhasForaDoContexto.length > 0) {
      toast.error("Alguns lotes não pertencem à OS selecionada. Remova-os ou confirme o override.");
      return;
    }
    const osTipo = (osEfetiva as any).type || "padrao";
    await onSubmit({
      grupoId: crypto.randomUUID(),
      itens: itensSelecionados.map((l) => ({ item: l.item, quantidade: Number(l.quantidade) || 0 })),
      osId: osEfetiva.id,
      osTipo,
      tipo_entrega: tipoEntrega,
      motorista, veiculo, data_saida: dataSaida,
      motorista_telefone: motoristaTelefone,
      motorista_documento: motoristaDocumento,
      veiculo_placa: veiculoPlaca,
      veiculo_tipo: veiculoTipo,
      hora_saida_prevista: horaSaidaPrevista,
      data_chegada_prevista: dataChegadaPrevista,
      hora_chegada_prevista: horaChegadaPrevista,
      endereco_origem: enderecoOrigem,
      ...destinatario,
    });
  };


  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Registrar Entrega</DialogTitle>
          </DialogHeader>

          {/* Cabeçalho de contexto quando vindo do cockpit */}
          {osInicial && (() => {
            const osCtx =
              (todasOS as any[]).find((o) => o.id === osInicial) ||
              (osExtra?.id === osInicial ? osExtra : null);
            if (!osCtx) return null;
            const { osLabel, subtitulo, origem } = formatOsOuOp(osCtx);
            const semReserva = !itensSelecionaveis.some(
              (it) => it.reservado_para_os_id === osInicial && it.status === "reservado"
            );
            return (
              <div className="rounded-md border bg-primary/5 border-primary/20 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">{osLabel}</span>
                    <Badge variant={origem === "b2b" ? "default" : "secondary"} className="text-[10px]">
                      {origem === "b2b" ? "B2B" : "Padrão"}
                    </Badge>
                    {semReserva && (
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                        Sem reserva
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {subtitulo}{osCtx.produtos?.nome ? ` · ${osCtx.produtos.nome}` : ""}
                  </div>
                </div>
              </div>
            );
          })()}

          <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setLinhas([]); }} className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="os" className="gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> Por OS (todos os vasilhames)
              </TabsTrigger>
              <TabsTrigger value="lotes" className="gap-1.5">
                <Package className="h-3.5 w-3.5" /> Por lotes envasados
              </TabsTrigger>
            </TabsList>

            <TabsContent value="os" className="space-y-3 mt-3">
              <div>
                <Label>Ordem de Serviço / OP</Label>
                <Select value={osSelecionada} onValueChange={setOsSelecionada}>
                  <SelectTrigger>
                    <SelectValue placeholder={osComLotes.length === 0 ? "Nenhuma OS com lote reservado" : "Escolha a OS ou OP"} />
                  </SelectTrigger>
                  <SelectContent>
                    {osComLotes.map((o: any) => {
                      const { osLabel, subtitulo, origem } = formatOsOuOp(o);
                      return (
                        <SelectItem key={o.id} value={o.id}>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{osLabel}</span>
                              <span className={`text-[9px] uppercase tracking-wide px-1 rounded ${origem === "b2b" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                {origem === "b2b" ? "B2B" : "Padrão"}
                              </span>
                              {o.__sem_reserva && (
                                <span className="text-[9px] uppercase tracking-wide px-1 rounded bg-amber-50 text-amber-700">Sem reserva</span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {subtitulo}{o.produtos?.nome ? ` · ${o.produtos.nome}` : ""}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Ao escolher a OS, todos os vasilhames reservados a ela já vêm pré-carregados. OSs vinculadas a pedidos B2B mostram a OP e o parceiro.
                </p>

                {/* Empty state quando a OS selecionada não tem reserva */}
                {osSelecionada && linhas.length === 0 && (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" /> Esta OS ainda não tem estoque reservado
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300">
                      Reserve o estoque antes de registrar a entrega. Você pode fazê-lo agora escolhendo os lotes ou pela tela de Estoque.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setTab("lotes"); }}>
                        Reservar por lotes agora
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { onOpenChange(false); navigate(`/estoque?os=${osSelecionada}&next=entrega`); }}>
                        Abrir tela de Estoque
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="lotes" className="space-y-3 mt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label>Lotes envasados</Label>
                  {osContextoId && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {mostrarTodosLotes
                          ? "Exibindo todos os lotes (fora do escopo desta OS)"
                          : "Mostrando apenas lotes desta OS/OP"}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px]"
                        onClick={() => {
                          if (!mostrarTodosLotes) {
                            toast.warning("Você está saindo do escopo da OS. Lotes de outras produções podem gerar divergência de rastreabilidade.");
                          }
                          setMostrarTodosLotes((v) => !v);
                        }}
                      >
                        {mostrarTodosLotes ? "Mostrar só desta OS" : "Ver todos os lotes"}
                      </Button>
                    </div>
                  )}
                </div>

                {osContextoId && itensDoContexto.length === 0 && !mostrarTodosLotes ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground space-y-2">
                    <div>Nenhum lote desta OS está pronto para entrega ainda.</div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => { onOpenChange(false); navigate(`/lotes?os=${osContextoId}`); }}
                    >
                      Ver produção
                    </Button>
                  </div>
                ) : (
                  <SeletorLoteEnvasado
                    itens={itensParaSeletor}
                    value={linhas.map((l) => l.estoque_produto_id)}
                    onChange={toggleLote}
                    multi
                    highlightForaEscopoOsId={osContextoId ?? undefined}
                  />
                )}
              </div>

              {linhasForaDoContexto.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-medium">
                  {linhasForaDoContexto.length} lote(s) selecionado(s) não pertencem à OS em contexto. Remova-os ou confirme o override para prosseguir.
                </div>
              )}


              {todosLivres && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-2">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Lotes sem reserva — vincule a uma OS ou OP
                  </div>
                  <Select value={osLivreEscolhida} onValueChange={setOsLivreEscolhida}>
                    <SelectTrigger><SelectValue placeholder="Escolha a OS ou OP para reservar e entregar" /></SelectTrigger>
                    <SelectContent>
                      {(todasOS as any[]).map((o) => {
                        const { osLabel, subtitulo, origem } = formatOsOuOp(o);
                        return (
                          <SelectItem key={o.id} value={o.id}>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{osLabel}</span>
                                <span className={`text-[9px] uppercase tracking-wide px-1 rounded ${origem === "b2b" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                  {origem === "b2b" ? "B2B" : "Padrão"}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground">
                                {subtitulo}{o.produtos?.nome ? ` · ${o.produtos.nome}` : ""} {o.data ? `(${formatDateDisplay(o.data)})` : ""}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {conflitoMultiOS && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive font-medium">
                  Os lotes selecionados pertencem a OSs diferentes. Em uma mesma entrega, todos os lotes devem ser da MESMA OS.
                </div>
              )}
            </TabsContent>
          </Tabs>


          {/* Lista dos itens selecionados */}
          {itensSelecionados.length > 0 && (
            <div className="rounded-md border bg-muted/20 overflow-hidden mt-3">
              <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider font-bold">Itens da entrega ({itensSelecionados.length})</div>
                {osEfetiva && (
                  <Badge variant="outline" className="text-[10px]">
                    {formatOS(osEfetiva)} · {getOSPartyLabel(osEfetiva)}
                  </Badge>
                )}
              </div>
              <div className="divide-y">
                {itensSelecionados.map((l) => {
                  const item = l.item;
                  const qtd = Number(l.quantidade) || 0;
                  const isReservado = item.status === "reservado";
                  const maxQtd = isReservado ? Math.min(item._saldo, item._saldo_reserva) : item._saldo;
                  const excede = qtd <= 0 || qtd > maxQtd;
                  return (
                    <div key={l.estoque_produto_id} className="p-2.5 flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono-data text-xs font-bold">{formatLoteCodigo(item)}</span>
                          <Badge variant={isReservado ? "secondary" : "outline"} className="text-[9px] h-4 px-1.5 uppercase">
                            {isReservado ? "Reservado" : "Livre"}
                          </Badge>
                        </div>
                        <div className="text-sm font-medium text-foreground break-words">{formatProdutoOuMicro(item)}</div>
                        <div className="text-[11px] text-muted-foreground">{formatEmbalagem(item) || "—"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-[9px] uppercase text-muted-foreground">Saldo</div>
                          <div className="text-xs font-mono-data">{maxQtd} un</div>
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Qtd</Label>
                          <Input
                            type="number"
                            min={1}
                            max={maxQtd}
                            value={l.quantidade}
                            onChange={(e) => updateQtd(l.estoque_produto_id, e.target.value)}
                            className={`h-8 w-20 text-right font-mono-data ${excede ? "border-destructive" : ""}`}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleLote(l.estoque_produto_id)}
                          className="h-8 w-8 text-destructive"
                          title="Remover item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-3 py-2 border-t bg-muted/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-mono-data font-bold text-primary">{totalUnidades} un</span>
                  {volumeTotalMl > 0 && (
                    <span className="font-mono-data text-muted-foreground">≈ {(volumeTotalMl / 1000).toFixed(2)} L</span>
                  )}
                </div>
                {linhasComErro.length > 0 && (
                  <span className="text-destructive font-medium">
                    {linhasComErro.length} item(ns) com quantidade inválida
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Modalidade da entrega */}
          <div className="mt-3 rounded-md border p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Modalidade</div>
            <RadioGroup
              value={tipoEntrega}
              onValueChange={(v) => setTipoEntrega(v as "motorista" | "retirada")}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              <label className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer ${tipoEntrega === "motorista" ? "border-primary bg-primary/5" : "border-muted"}`}>
                <RadioGroupItem value="motorista" id="mod-motorista" />
                <Truck className="h-4 w-4" />
                <span className="text-sm">Entrega por motorista</span>
              </label>
              <label className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer ${tipoEntrega === "retirada" ? "border-primary bg-primary/5" : "border-muted"}`}>
                <RadioGroupItem value="retirada" id="mod-retirada" />
                <Package className="h-4 w-4" />
                <span className="text-sm">Retirada no local (cliente/parceiro)</span>
              </label>
            </RadioGroup>
          </div>

          {/* Motorista / Retirante */}
          <div className="mt-3 rounded-md border p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {tipoEntrega === "retirada" ? "Retirado por" : "Motorista"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <Label>Nome</Label>
                <Input value={motorista} onChange={(e) => setMotorista(e.target.value)} placeholder={tipoEntrega === "retirada" ? "Nome de quem retirou" : "Ex.: Lucas"} />
              </div>
              <div>
                <Label>Telefone</Label>
                <MaskedInput mask="(00) 00000-0000" value={motoristaTelefone} onChange={(e) => setMotoristaTelefone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="sm:col-span-2">
                <Label>{tipoEntrega === "retirada" ? "Documento (RG/CPF)" : "CNH / Documento"}</Label>
                <Input value={motoristaDocumento} onChange={(e) => setMotoristaDocumento(e.target.value)} placeholder={tipoEntrega === "retirada" ? "Nº do documento" : "Nº da CNH"} />
              </div>
            </div>
          </div>

          {/* Veículo (apenas para modalidade motorista) */}
          {tipoEntrega === "motorista" && (
            <div className="mt-3 rounded-md border p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Veículo</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <Label>Descrição / Modelo</Label>
                  <Input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} placeholder="Ex.: Strada Cabine Dupla" />
                </div>
                <div>
                  <Label>Placa</Label>
                  <Input
                    value={veiculoPlaca}
                    onChange={(e) => setVeiculoPlaca(e.target.value.toUpperCase())}
                    placeholder="ABC-1D23"
                    maxLength={8}
                    className="font-mono-data uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Tipo</Label>
                  <Select value={veiculoTipo} onValueChange={setVeiculoTipo}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="van">Van</SelectItem>
                      <SelectItem value="caminhao">Caminhão</SelectItem>
                      <SelectItem value="utilitario">Utilitário</SelectItem>
                      <SelectItem value="carro">Carro</SelectItem>
                      <SelectItem value="moto">Moto</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Previsões */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Previsão de saída</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={horaSaidaPrevista} onChange={(e) => setHoraSaidaPrevista(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Previsão de chegada</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={dataChegadaPrevista} onChange={(e) => setDataChegadaPrevista(e.target.value)} />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={horaChegadaPrevista} onChange={(e) => setHoraChegadaPrevista(e.target.value)} />
                </div>
              </div>
              {dataSaida && dataChegadaPrevista && horaSaidaPrevista && horaChegadaPrevista &&
                new Date(`${dataChegadaPrevista}T${horaChegadaPrevista}`) <
                  new Date(`${dataSaida}T${horaSaidaPrevista}`) && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">
                  Atenção: chegada anterior à saída.
                </p>
              )}
            </div>
          </div>

          {/* Destinatário e endereço */}
          <div className="mt-3 rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Destinatário e endereço de entrega
                </span>
              </div>
              {osEfetiva && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={preencherDoCadastro}
                  disabled={loadingDest}
                >
                  <RefreshCw className={`h-3 w-3 ${loadingDest ? "animate-spin" : ""}`} />
                  {enderecoOrigem === "personalizado" ? "Copiar do cadastro" : "Preencher do cadastro"}
                </Button>
              )}
            </div>

            <RadioGroup
              value={enderecoOrigem}
              onValueChange={(v) => setEnderecoOrigem(v as "cadastro" | "personalizado")}
              className="flex flex-wrap gap-4 text-xs"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="cadastro" id="end-cad" />
                Usar endereço cadastrado
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="personalizado" id="end-per" />
                Endereço diferente (só para esta entrega)
              </label>
            </RadioGroup>

            {enderecoOrigem === "personalizado" && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                O endereço abaixo será usado apenas nesta entrega e não alterará o cadastro do cliente/parceiro.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-3">
                <Label>Destinatário</Label>
                <Input value={destinatario.destinatario_nome} onChange={(e) => setDestField("destinatario_nome", e.target.value)} placeholder="Nome do cliente/parceiro" />
              </div>
              <div className="sm:col-span-3 grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefone</Label>
                  <MaskedInput mask="telefone" value={destinatario.destinatario_telefone} onChange={(e) => setDestField("destinatario_telefone", e.target.value)} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <MaskedInput mask="telefone" value={destinatario.destinatario_whatsapp} onChange={(e) => setDestField("destinatario_whatsapp", e.target.value)} placeholder="(00) 00000-0000" />
                </div>
              </div>

              <div className="sm:col-span-4">
                <Label>Logradouro</Label>
                <Input value={destinatario.endereco_logradouro} onChange={(e) => setDestField("endereco_logradouro", e.target.value)} placeholder="Rua/Av" />
              </div>
              <div className="sm:col-span-1">
                <Label>Número</Label>
                <Input value={destinatario.endereco_numero} onChange={(e) => setDestField("endereco_numero", e.target.value)} />
              </div>
              <div className="sm:col-span-1">
                <Label>Complemento</Label>
                <Input value={destinatario.endereco_complemento} onChange={(e) => setDestField("endereco_complemento", e.target.value)} />
              </div>

              <div className="sm:col-span-2">
                <Label>Bairro</Label>
                <Input value={destinatario.endereco_bairro} onChange={(e) => setDestField("endereco_bairro", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Cidade</Label>
                <Input value={destinatario.endereco_cidade} onChange={(e) => setDestField("endereco_cidade", e.target.value)} />
              </div>
              <div className="sm:col-span-1">
                <Label>UF</Label>
                <Input maxLength={2} value={destinatario.endereco_uf} onChange={(e) => setDestField("endereco_uf", e.target.value.toUpperCase())} className="uppercase font-mono-data" />
              </div>
              <div className="sm:col-span-1">
                <Label>CEP</Label>
                <Input value={destinatario.endereco_cep} onChange={(e) => setDestField("endereco_cep", e.target.value)} placeholder="00000-000" />
              </div>

              <div className="sm:col-span-6">
                <Label>Referência / observações ao motorista</Label>
                <Input value={destinatario.endereco_referencia} onChange={(e) => setDestField("endereco_referencia", e.target.value)} placeholder="Ex.: Portão azul, próximo ao posto." />
              </div>
            </div>
          </div>

          <Button
            className="w-full mt-3"
            disabled={!canSubmit || submitting}
            onClick={() => setConfirmOpen(true)}
          >
            {submitting ? "Registrando..." : `Registrar entrega (${itensSelecionados.length} item${itensSelecionados.length !== 1 ? "s" : ""})`}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar registro de entrega</AlertDialogTitle>
            <AlertDialogDescription>
              Revise os {itensSelecionados.length} item(ns) antes de gravar. Todas as entregas serão agrupadas em um único registro.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {osEfetiva && (
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">OS / Cliente</div>
              <div className="font-semibold">{formatOS(osEfetiva)} · {getOSPartyLabel(osEfetiva)}</div>
            </div>
          )}

          <div className="rounded-md border max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Lote</th>
                  <th className="text-left p-2">Produto/Micro</th>
                  <th className="text-right p-2">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {itensSelecionados.map((l) => (
                  <tr key={l.estoque_produto_id} className="border-t">
                    <td className="p-2 font-mono-data">{formatLoteCodigo(l.item)}</td>
                    <td className="p-2">{formatProdutoOuMicro(l.item)}</td>
                    <td className="p-2 text-right font-mono-data font-semibold">{l.quantidade} un</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total da entrega</div>
            <div className="text-3xl font-black text-primary font-mono-data">
              {totalUnidades} <span className="text-base font-normal text-muted-foreground">un</span>
            </div>
            {volumeTotalMl > 0 && (
              <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                <Truck className="h-3 w-3" /> ≈ {(volumeTotalMl / 1000).toFixed(2)} L
              </div>
            )}
          </div>

          {(motorista || veiculo || dataSaida || horaSaidaPrevista || dataChegadaPrevista || horaChegadaPrevista) && (
            <div className="rounded-md border p-3 text-xs space-y-1">
              {motorista && (
                <div>
                  <span className="text-muted-foreground">Motorista:</span> {motorista}
                  {motoristaTelefone && ` · ${motoristaTelefone}`}
                  {motoristaDocumento && ` · CNH ${motoristaDocumento}`}
                </div>
              )}
              {veiculo && (
                <div>
                  <span className="text-muted-foreground">Veículo:</span> {veiculo}
                  {veiculoPlaca && ` · ${veiculoPlaca}`}
                  {veiculoTipo && ` · ${veiculoTipo}`}
                </div>
              )}
              {(dataSaida || horaSaidaPrevista) && (
                <div>
                  <span className="text-muted-foreground">Saída:</span>{" "}
                  {dataSaida ? formatDateDisplay(dataSaida) : "—"}
                  {horaSaidaPrevista && ` às ${horaSaidaPrevista}`}
                </div>
              )}
              {(dataChegadaPrevista || horaChegadaPrevista) && (
                <div>
                  <span className="text-muted-foreground">Chegada (previsão):</span>{" "}
                  {dataChegadaPrevista ? formatDateDisplay(dataChegadaPrevista) : formatDateDisplay(dataSaida)}
                  {horaChegadaPrevista && ` às ${horaChegadaPrevista}`}
                </div>
              )}
            </div>
          )}

          {(destinatario.destinatario_nome || destinatario.endereco_logradouro || destinatario.endereco_cidade) && (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold uppercase text-[10px] tracking-wider text-muted-foreground">Destinatário</span>
                {enderecoOrigem === "personalizado" && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-400 text-amber-700 dark:text-amber-500">
                    Endereço específico desta entrega
                  </Badge>
                )}
              </div>
              {destinatario.destinatario_nome && (
                <div>
                  <span className="text-muted-foreground">Nome:</span> {destinatario.destinatario_nome}
                  {destinatario.destinatario_telefone && ` · ${destinatario.destinatario_telefone}`}
                  {destinatario.destinatario_whatsapp && ` · WhatsApp ${destinatario.destinatario_whatsapp}`}
                </div>
              )}
              {(destinatario.endereco_logradouro || destinatario.endereco_cidade) && (
                <div>
                  <span className="text-muted-foreground">Endereço:</span>{" "}
                  {[
                    [destinatario.endereco_logradouro, destinatario.endereco_numero].filter(Boolean).join(", "),
                    destinatario.endereco_complemento,
                    destinatario.endereco_bairro,
                    [destinatario.endereco_cidade, destinatario.endereco_uf].filter(Boolean).join("/"),
                    destinatario.endereco_cep,
                  ].filter(Boolean).join(" · ")}
                </div>
              )}
              {destinatario.endereco_referencia && (
                <div><span className="text-muted-foreground">Referência:</span> {destinatario.endereco_referencia}</div>
              )}
            </div>
          )}



          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmOpen(false);
                handleConfirmar();
              }}
            >
              Confirmar e gravar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingOverrideId} onOpenChange={(o) => !o && setPendingOverrideId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lote fora do escopo da OS</AlertDialogTitle>
            <AlertDialogDescription>
              Este lote não pertence à OS/OP em contexto. Selecioná-lo pode causar divergência de rastreabilidade entre a produção e a entrega. Deseja continuar assim mesmo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingOverrideId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = pendingOverrideId;
                if (!id) return;
                setOverrideConfirmado((prev) => {
                  const next = new Set(prev);
                  next.add(id);
                  return next;
                });
                const item = itensSelecionaveis.find((i: any) => i.id === id);
                if (item) {
                  setLinhas((prev) => {
                    if (prev.some((l) => l.estoque_produto_id === id)) return prev;
                    const qtdDefault = item.status === "reservado"
                      ? Math.min(item._saldo, item._saldo_reserva || item._saldo)
                      : item._saldo;
                    return [...prev, { estoque_produto_id: id, quantidade: String(qtdDefault) }];
                  });
                }
                setPendingOverrideId(null);
              }}
            >
              Confirmar override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
