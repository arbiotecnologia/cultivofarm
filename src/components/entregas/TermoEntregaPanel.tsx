import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { ClipboardCheck, Download, FileSignature, Loader2, Ban } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { parseQuantidadeConferencia } from "@/lib/entregas/quantidadeConferencia";

type ConfStatus = "aceito" | "recusado" | "pendente";

interface Props {
  entregaId: string;
}

const STATUS_LABEL: Record<ConfStatus, string> = {
  aceito: "Aceito",
  recusado: "Recusado",
  pendente: "Pendente",
};

const ERRO_LABEL: Record<string, string> = {
  sem_permissao: "Você não tem permissão para esta ação.",
  termo_ja_assinado: "Já existe termo assinado para esta entrega.",
  cq_nao_liberado: "Item sem liberação de CQ não pode ser aceito.",
  etiqueta_invalida_ou_vencida: "Etiqueta cancelada, substituída ou vencida.",
  etiqueta_nao_vinculada_a_entrega: "Etiqueta não pertence a esta entrega.",
  cobertura_pendente: "Confira todos os itens antes de assinar.",
  idempotency_payload_mismatch: "Conflito: os dados enviados divergem do registro original.",
  termo_cancelado: "Termo cancelado — documento não vigente.",
  termo_substituido: "Termo substituído por uma versão mais recente.",
  pdf_nao_gerado: "PDF ainda não foi gerado para este termo.",
  termo_nao_assinado: "O termo precisa estar assinado.",
  termo_desatualizado: "Os dados mudaram. Gere novamente o rascunho e confira antes de assinar.",
  termo_integridade_invalida:
    "A integridade do termo não pôde ser confirmada. Gere novamente o rascunho antes de assinar.",
};


const MSG_ERRO_GENERICA = "Não foi possível concluir a operação. Tente novamente.";
const MSG_ERRO_CARREGAR = "Não foi possível carregar a conferência e o termo desta entrega.";
const MSG_PDF_SEM_LINK = "Não foi possível obter o link do documento. Tente novamente.";

/** Erros conhecidos viram texto amigável; desconhecidos nunca expõem detalhe interno. */
function traduzirErro(msg: string | undefined): string {
  if (!msg) return MSG_ERRO_GENERICA;
  const chave = Object.keys(ERRO_LABEL).find((k) => msg.includes(k));
  return chave ? ERRO_LABEL[chave] : MSG_ERRO_GENERICA;
}

/** Erros de validação local podem (e devem) ser exibidos ao usuário. */
class ErroValidacao extends Error {}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function TermoEntregaPanel({ entregaId }: Props) {
  const qc = useQueryClient();
  const [rascunho, setRascunho] = useState<Record<string, { status: ConfStatus; quantidade: string; motivo: string }>>({});
  const [recebedor, setRecebedor] = useState({ nome: "", documento: "", cargo: "", telefone: "" });
  const [motivoCancel, setMotivoCancel] = useState("");
  const [busy, setBusy] = useState(false);
  // Token monotônico por entrega: invalida respostas antigas (inclusive A→B→A).
  const tokenRef = useRef(0);
  // Trava síncrona contra duplo envio (o estado `busy` só atualiza no próximo render).
  const emAndamentoRef = useRef(false);

  useEffect(() => {
    tokenRef.current += 1;
    emAndamentoRef.current = false;
    setRascunho({});
    setRecebedor({ nome: "", documento: "", cargo: "", telefone: "" });
    setMotivoCancel("");
    setBusy(false);
    return () => {
      tokenRef.current += 1;
      emAndamentoRef.current = false;
    };
  }, [entregaId]);


  const itensQuery = useQuery({
    queryKey: ["entrega-conferencia", entregaId],
    enabled: !!entregaId,
    queryFn: async () => {
      const { data: vinculos, error: e1 } = await supabase
        .from("entrega_etiquetas")
        .select("etiqueta_id, produto_etiquetas:etiqueta_id(id, codigo_etiqueta, status, cq_liberado, embalagem_id)")
        .eq("entrega_id", entregaId)
        .eq("ativo", true);
      if (e1) throw e1;
      const { data: conf, error: e2 } = await supabase
        .from("entrega_conferencia_itens")
        .select("etiqueta_id, status, quantidade, motivo")
        .eq("entrega_id", entregaId);
      if (e2) throw e2;
      const confMap = new Map((conf ?? []).map((c: any) => [c.etiqueta_id, c]));
      return (vinculos ?? []).map((v: any) => ({
        etiqueta_id: v.etiqueta_id,
        codigo: v.produto_etiquetas?.codigo_etiqueta ?? v.etiqueta_id?.slice(0, 8),
        cq_liberado: !!v.produto_etiquetas?.cq_liberado,
        etiqueta_status: v.produto_etiquetas?.status,
        conferencia: confMap.get(v.etiqueta_id) ?? null,
      }));
    },
  });

  const termoQuery = useQuery({
    queryKey: ["entrega-termo", entregaId],
    enabled: !!entregaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entrega_termos")
        .select("id, versao, status, cobertura, snapshot_hash, assinado_em, recebedor_nome, pdf_path, pdf_hash, pdf_gerado_em, motivo_cancelamento")
        .eq("entrega_id", entregaId)
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const termo = termoQuery.data as any;
  const assinado = termo?.status === "assinado";

  const itens = itensQuery.data ?? [];
  const valorDe = (id: string, campo: "status" | "quantidade" | "motivo") => {
    const local = rascunho[id];
    if (local) return local[campo];
    const item = itens.find((i) => i.etiqueta_id === id);
    if (campo === "status") return (item?.conferencia?.status as ConfStatus) ?? "pendente";
    if (campo === "quantidade") return String(item?.conferencia?.quantidade ?? 1);
    return item?.conferencia?.motivo ?? "";
  };

  const setCampo = (id: string, campo: "status" | "quantidade" | "motivo", valor: string) => {
    setRascunho((prev) => ({
      ...prev,
      [id]: {
        status: (campo === "status" ? valor : valorDe(id, "status")) as ConfStatus,
        quantidade: campo === "quantidade" ? valor : (valorDe(id, "quantidade") as string),
        motivo: campo === "motivo" ? valor : (valorDe(id, "motivo") as string),
      },
    }));
  };

  const resumo = useMemo(() => {
    const acc = { aceito: 0, recusado: 0, pendente: 0 };
    itens.forEach((i) => acc[valorDe(i.etiqueta_id, "status") as ConfStatus]++);
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, rascunho]);

  /** Sempre invalida a entrega capturada na operação, nunca a atual por engano. */
  const invalidar = (id: string) => {
    qc.invalidateQueries({ queryKey: ["entrega-conferencia", id] });
    qc.invalidateQueries({ queryKey: ["entrega-termo", id] });
  };

  type Ctx = { vivo: () => boolean; entregaDaOperacao: string };

  const run = async (fn: (ctx: Ctx) => Promise<void>) => {
    if (emAndamentoRef.current) return; // trava síncrona contra duplo clique
    emAndamentoRef.current = true;
    const token = ++tokenRef.current;
    const entregaDaOperacao = entregaId;
    const vivo = () => token === tokenRef.current;
    setBusy(true);
    try {
      await fn({ vivo, entregaDaOperacao });
    } catch (e: any) {
      if (!vivo()) return;
      toast({
        title: "Não foi possível concluir",
        description: e instanceof ErroValidacao ? e.message : traduzirErro(e?.message),
        variant: "destructive",
      });
    } finally {
      if (vivo()) {
        setBusy(false);
        emAndamentoRef.current = false;
      }
    }
  };

  const salvarConferencia = () =>
    run(async ({ vivo, entregaDaOperacao }) => {
      const payload = itens.map((i) => {
        const q = parseQuantidadeConferencia(valorDe(i.etiqueta_id, "quantidade"));
        if (!q.ok) throw new ErroValidacao(`${i.codigo}: ${q.motivo}`);
        return {
          etiqueta_id: i.etiqueta_id,
          status: valorDe(i.etiqueta_id, "status"),
          quantidade: q.valor,
          motivo: valorDe(i.etiqueta_id, "motivo") || null,
        };
      });
      const { error } = await supabase.rpc("rpc_entrega_registrar_conferencia_v1" as any, {
        p_entrega_id: entregaDaOperacao,
        p_itens: payload,
      });
      if (error) throw error;
      invalidar(entregaDaOperacao);
      if (!vivo()) return;
      setRascunho({});
      toast({ title: "Conferência registrada" });
    });

  const gerarTermo = () =>
    run(async ({ vivo, entregaDaOperacao }) => {
      const { error } = await supabase.rpc("rpc_entrega_gerar_termo_v1" as any, {
        p_entrega_id: entregaDaOperacao,
        p_template_versao: "termo-entrega-v1",
      });
      if (error) throw error;
      invalidar(entregaDaOperacao);
      if (!vivo()) return;
      toast({ title: "Termo gerado (rascunho)" });
    });

  const assinar = () =>
    run(async ({ vivo, entregaDaOperacao }) => {
      if (!termo?.id) throw new ErroValidacao("Gere o termo antes de assinar.");
      if (!recebedor.nome.trim()) throw new ErroValidacao("Informe o nome do recebedor.");
      const assinaturaHash = await sha256Hex(
        `${termo.snapshot_hash}|${recebedor.nome.trim()}|${recebedor.documento.trim()}`,
      );
      // Trocou de entrega durante o cálculo: nada com efeito pode ser enviado.
      if (!vivo()) return;
      const idem = await sha256Hex(`${termo.id}|${termo.versao}|${assinaturaHash}`);
      if (!vivo()) return;
      const { error } = await supabase.rpc("rpc_entrega_assinar_termo_v1" as any, {
        p_termo_id: termo.id,
        p_payload: {
          recebedor_nome: recebedor.nome.trim(),
          recebedor_documento: recebedor.documento.trim() || null,
          recebedor_cargo: recebedor.cargo.trim() || null,
          recebedor_telefone: recebedor.telefone.trim() || null,
          assinatura_hash: assinaturaHash,
          assinatura_tipo: "digital_tela",
          origem: "web",
        },
        p_idempotency_key: idem,
      });
      if (error) throw error;
      invalidar(entregaDaOperacao);
      if (!vivo()) return;
      toast({ title: "Termo assinado" });
    });

  const pdfMutation = useMutation({
    mutationFn: async ({ action, termoId }: { action: "generate" | "signed_url"; termoId: string }) => {
      const { data, error } = await supabase.functions.invoke("entrega-termo-pdf", {
        body: { termo_id: termoId, action },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
  });

  const gerarPdf = () =>
    run(async ({ vivo, entregaDaOperacao }) => {
      if (!termo?.id) throw new ErroValidacao("Gere o termo antes de emitir o PDF.");
      await pdfMutation.mutateAsync({ action: "generate", termoId: termo.id });
      invalidar(entregaDaOperacao);
      if (!vivo()) return;
      toast({ title: "PDF do termo disponível" });
    });

  const baixarPdf = () =>
    run(async ({ vivo }) => {
      if (!termo?.id) throw new ErroValidacao("Gere o termo antes de baixar o PDF.");
      const res = await pdfMutation.mutateAsync({ action: "signed_url", termoId: termo.id });
      if (!vivo()) return;
      // Ausência de link é falha explícita: nunca silêncio.
      if (!res?.signed_url) throw new ErroValidacao(MSG_PDF_SEM_LINK);
      window.open(res.signed_url, "_blank", "noopener,noreferrer");
    });

  const cancelarTermo = () =>
    run(async ({ vivo, entregaDaOperacao }) => {
      if (!termo?.id) throw new ErroValidacao("Não há termo para cancelar.");
      if (motivoCancel.trim().length < 5)
        throw new ErroValidacao("Informe um motivo com pelo menos 5 caracteres.");
      const { error } = await supabase.rpc("rpc_entrega_cancelar_termo_v1" as any, {
        p_termo_id: termo.id,
        p_motivo: motivoCancel.trim(),
      });
      if (error) throw error;
      invalidar(entregaDaOperacao);
      if (!vivo()) return;
      setMotivoCancel("");
      toast({ title: "Termo cancelado" });
    });

  if (itensQuery.isLoading || termoQuery.isLoading) {
    return <Skeleton className="h-48 w-full" data-testid="termo-carregando" />;
  }

  // Falha de leitura nunca vira "vazio": erro explícito e ações bloqueadas.
  if (itensQuery.isError || termoQuery.isError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Conferência e termo de entrega
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm" data-testid="termo-erro">
          <p className="text-destructive">{MSG_ERRO_CARREGAR}</p>
          <Button
            variant="outline"
            onClick={() => {
              void itensQuery.refetch();
              void termoQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          Conferência e termo de entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="flex flex-wrap gap-2" role="status" aria-live="polite">
          <Badge variant="outline">Aceitos: {resumo.aceito}</Badge>
          <Badge variant="outline">Recusados: {resumo.recusado}</Badge>
          <Badge variant="outline">Pendentes: {resumo.pendente}</Badge>
          {termo && <Badge variant="secondary">Termo v{termo.versao} — {termo.status}</Badge>}
        </div>

        {itens.length === 0 ? (
          <p className="text-muted-foreground" data-testid="termo-vazio">
            Nenhuma etiqueta vinculada a esta entrega.
          </p>
        ) : (
          <ul className="space-y-3">
            {itens.map((i) => {
              const st = valorDe(i.etiqueta_id, "status") as ConfStatus;
              return (
                <li key={i.etiqueta_id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{i.codigo}</span>
                    {!i.cq_liberado && <Badge variant="destructive">CQ não liberado</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["aceito", "recusado", "pendente"] as ConfStatus[]).map((op) => (
                      <Button
                        key={op}
                        type="button"
                        size="sm"
                        variant={st === op ? "default" : "outline"}
                        disabled={assinado || busy}
                        aria-pressed={st === op}
                        onClick={() => setCampo(i.etiqueta_id, "status", op)}
                        className="min-h-9 flex-1 sm:flex-none"
                      >
                        {STATUS_LABEL[op]}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor={`qtd-${i.etiqueta_id}`} className="text-xs">Quantidade</Label>
                      <Input
                        id={`qtd-${i.etiqueta_id}`}
                        inputMode="decimal"
                        disabled={assinado || busy}
                        value={valorDe(i.etiqueta_id, "quantidade") as string}
                        onChange={(e) => setCampo(i.etiqueta_id, "quantidade", e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor={`mot-${i.etiqueta_id}`} className="text-xs">Motivo (recusa/ressalva)</Label>
                      <Input
                        id={`mot-${i.etiqueta_id}`}
                        disabled={assinado || busy}
                        value={valorDe(i.etiqueta_id, "motivo") as string}
                        onChange={(e) => setCampo(i.etiqueta_id, "motivo", e.target.value)}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!assinado && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={salvarConferencia} disabled={busy || itens.length === 0} className="min-h-10">
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />}
              Salvar conferência
            </Button>
            <Button variant="outline" onClick={gerarTermo} disabled={busy} className="min-h-10">
              Gerar termo
            </Button>
          </div>
        )}

        {termo && termo.status === "rascunho" && (
          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Recebedor e assinatura</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label htmlFor="rec-nome" className="text-xs">Nome *</Label>
                <Input id="rec-nome" value={recebedor.nome} onChange={(e) => setRecebedor({ ...recebedor, nome: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="rec-doc" className="text-xs">Documento</Label>
                <Input id="rec-doc" value={recebedor.documento} onChange={(e) => setRecebedor({ ...recebedor, documento: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="rec-cargo" className="text-xs">Cargo</Label>
                <Input id="rec-cargo" value={recebedor.cargo} onChange={(e) => setRecebedor({ ...recebedor, cargo: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="rec-tel" className="text-xs">Telefone</Label>
                <Input id="rec-tel" value={recebedor.telefone} onChange={(e) => setRecebedor({ ...recebedor, telefone: e.target.value })} />
              </div>
            </div>
            <Button onClick={assinar} disabled={busy || !recebedor.nome.trim()} className="min-h-10 w-full sm:w-auto">
              <FileSignature className="h-4 w-4 mr-1" aria-hidden="true" /> Assinar termo
            </Button>
          </div>
        )}

        {assinado && (
          <div className="rounded-md border p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Assinado em:</span> {formatDateTimeDisplay(termo.assinado_em)}</div>
              <div><span className="text-muted-foreground">Recebedor:</span> {termo.recebedor_nome || "—"}</div>
              <div className="sm:col-span-2 font-mono break-all">
                <span className="text-muted-foreground">Hash:</span> {termo.snapshot_hash}
              </div>
              {termo.pdf_hash && (
                <div className="sm:col-span-2 font-mono break-all">
                  <span className="text-muted-foreground">PDF hash:</span> {termo.pdf_hash}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!termo.pdf_path ? (
                <Button onClick={gerarPdf} disabled={busy} className="min-h-10">
                  {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />}
                  Gerar PDF do termo
                </Button>
              ) : (
                <Button variant="outline" onClick={baixarPdf} disabled={busy} className="min-h-10">
                  <Download className="h-4 w-4 mr-1" aria-hidden="true" /> Baixar termo assinado
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motivo-cancel" className="text-xs">Cancelar/substituir termo (motivo obrigatório)</Label>
              <Textarea
                id="motivo-cancel"
                rows={2}
                value={motivoCancel}
                onChange={(e) => setMotivoCancel(e.target.value)}
                placeholder="Descreva o motivo do cancelamento"
              />
              <Button variant="destructive" onClick={cancelarTermo} disabled={busy || motivoCancel.trim().length < 5} className="min-h-10">
                <Ban className="h-4 w-4 mr-1" aria-hidden="true" /> Cancelar termo
              </Button>
            </div>
          </div>
        )}

        {termo?.status === "cancelado" && (
          <p className="text-xs text-destructive">
            Termo cancelado{termo.motivo_cancelamento ? `: ${termo.motivo_cancelamento}` : ""}. Gere uma nova versão.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
