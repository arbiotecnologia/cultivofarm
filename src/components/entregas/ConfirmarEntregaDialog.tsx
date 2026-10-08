import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { Paperclip, Trash2, Upload, DollarSign, Clock, Ban } from "lucide-react";

const TIPOS = [
  { value: "RECIBO_ASSINADO", label: "Recibo assinado" },
  { value: "FOTO_ENTREGA", label: "Foto da entrega" },
  { value: "COMPROVANTE", label: "Comprovante" },
  { value: "OUTRO", label: "Outro" },
] as const;

const MOTIVOS_NAO_FATURAVEL = [
  { value: "bonificacao", label: "Bonificação" },
  { value: "amostra", label: "Amostra" },
  { value: "complemento_gratuito", label: "Complemento gratuito" },
  { value: "correcao_entrega", label: "Correção de entrega" },
  { value: "outro", label: "Outro" },
] as const;

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
const MAX_BYTES = 15 * 1024 * 1024;

const ERROS_ENTREGA: Record<string, string> = {
  COCKPIT_UNAUTHENTICATED: "Sessão expirada. Entre novamente para confirmar a entrega.",
  COCKPIT_FORBIDDEN: "Seu perfil não tem permissão para confirmar entregas.",
  COCKPIT_FORBIDDEN_ORIGEM: "Seu perfil não pode confirmar entregas desta origem.",
  COCKPIT_ENTREGA_NAO_ENCONTRADA: "Entrega não encontrada.",
  COCKPIT_ENTREGA_CANCELADA: "Entrega cancelada não pode ser confirmada.",
  COCKPIT_ENTREGA_RECEBEDOR_OBRIGATORIO: "Informe o nome de quem recebeu a entrega.",
  COCKPIT_ENTREGA_MOTIVO_NAO_FATURAVEL_OBRIGATORIO: "Descreva o motivo da entrega sem cobrança.",
  COCKPIT_ENTREGA_ESTOQUE_NAO_ENCONTRADO: "O item de estoque vinculado à entrega não foi encontrado.",
  COCKPIT_ENTREGA_QUANTIDADE_EXCEDE_RESERVA: "A quantidade da entrega excede o saldo reservado.",
  COCKPIT_RELATION_MISMATCH_ENTREGA_OS: "A entrega não pertence à ordem de serviço informada.",
  COCKPIT_RELATION_MISMATCH_ENTREGA_ESTOQUE: "O estoque vinculado pertence a outra ordem de serviço.",
  COCKPIT_RELATION_MISMATCH_ENTREGA_ORIGEM: "O estoque vinculado pertence a outra origem de OS.",
  COCKPIT_ENTREGA_PARAMS_INVALIDOS: "Dados insuficientes para confirmar a entrega.",
};

function traduzErroEntrega(msg?: string | null): string {
  const texto = (msg || "").trim();
  const chave = Object.keys(ERROS_ENTREGA).find((k) => texto.includes(k));
  return chave ? ERROS_ENTREGA[chave] : texto || "Não foi possível confirmar a entrega.";
}


type PendingFile = { id: string; file: File; tipo: string };
export type ConfirmMode = "bill_now" | "bill_later" | "not_billable";

interface Props {
  open: boolean;
  onClose: () => void;
  entrega: any | null;
  onConfirmed?: (mode: ConfirmMode, entregaId: string) => void;
}

export function ConfirmarEntregaDialog({ open, onClose, entrega, onConfirmed }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nowLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const [form, setForm] = useState({
    entregue_em: nowLocal(),
    recebido_por_nome: "",
    recebido_por_cargo: "",
    recebido_por_documento: "",
    observacoes_confirmacao: "",
  });
  const [mode, setMode] = useState<ConfirmMode | "">("");
  const [motivoNB, setMotivoNB] = useState<string>("");
  const [motivoNBTexto, setMotivoNBTexto] = useState<string>("");
  const [pending, setPending] = useState<PendingFile[]>([]);

  useEffect(() => {
    if (open && entrega) {
      setForm({
        entregue_em: nowLocal(),
        recebido_por_nome: entrega.recebido_por_nome || "",
        recebido_por_cargo: entrega.recebido_por_cargo || "",
        recebido_por_documento: entrega.recebido_por_documento || "",
        observacoes_confirmacao: entrega.observacoes_confirmacao || "",
      });
      setMode("");
      setMotivoNB("");
      setMotivoNBTexto("");
      setPending([]);
    }
  }, [open, entrega?.id]);

  const { data: docsExistentes = [] } = useQuery({
    queryKey: ["entrega-docs", entrega?.id],
    enabled: !!entrega?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entrega_documentos" as any)
        .select("*")
        .eq("entrega_id", entrega.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const totalAnexos = (docsExistentes?.length || 0) + pending.length;
  const requerComprovante = !!entrega?.comprovante_entrega_obrigatorio;

  const onPick = (files: FileList | null) => {
    if (!files) return;
    const arr: PendingFile[] = [];
    Array.from(files).forEach((f) => {
      if (f.size > MAX_BYTES) {
        toast({ title: "Arquivo excede 15MB", description: f.name, variant: "destructive" });
        return;
      }
      arr.push({ id: crypto.randomUUID(), file: f, tipo: "RECIBO_ASSINADO" });
    });
    setPending((p) => [...p, ...arr]);
  };

  const removePending = (id: string) => setPending((p) => p.filter((x) => x.id !== id));

  const validateBeforeSubmit = (): string | null => {
    if (!form.recebido_por_nome.trim()) return "Informe o nome de quem recebeu";
    if (entrega?.status === "cancelada") return "Entrega cancelada não pode ser confirmada";
    if (requerComprovante && totalAnexos === 0) return "Esta entrega exige pelo menos um comprovante anexado";
    if (!mode) return "Selecione uma opção de faturamento";
    if (mode === "not_billable") {
      if (!motivoNB) return "Selecione o motivo";
      if (!motivoNBTexto.trim()) return "Descreva o motivo";
    }
    return null;
  };

  const confirmar = useMutation({
    mutationFn: async () => {
      if (!user || !entrega) throw new Error("Sessão inválida");
      const err = validateBeforeSubmit();
      if (err) throw new Error(err);

      // 1) Upload dos arquivos pendentes
      for (const pf of pending) {
        const rawExt = pf.file.name.split(".").pop()?.toLowerCase();
        const ext = rawExt && /^[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : "bin";
        const path = `entregas/${entrega.id}/comprovantes/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("entrega-documentos")
          .upload(path, pf.file, { contentType: pf.file.type || undefined, upsert: false });
        if (upErr) throw new Error(`Falha ao enviar ${pf.file.name}: ${upErr.message}`);

        const { error: insErr } = await supabase.from("entrega_documentos" as any).insert({
          entrega_id: entrega.id,
          tipo_documento: pf.tipo,
          nome_arquivo: pf.file.name,
          arquivo_path: path,
          mime_type: pf.file.type || null,
          tamanho_bytes: pf.file.size,
          uploaded_by: user.id,
        });
        if (insErr) throw insErr;
      }

      // 2) Confirmação transacional pelo motor único (estoque, esteira e finalização)
      const reason =
        mode === "not_billable"
          ? `${MOTIVOS_NAO_FATURAVEL.find((m) => m.value === motivoNB)?.label}: ${motivoNBTexto.trim()}`
          : null;

      const { data, error: rpcErr } = await supabase.rpc("rpc_entrega_confirmar_v1" as any, {
        p_entrega_id: entrega.id,
        p_recebedor: {
          nome: form.recebido_por_nome.trim(),
          cargo: form.recebido_por_cargo.trim() || null,
          documento: form.recebido_por_documento.trim() || null,
          observacoes: form.observacoes_confirmacao.trim() || null,
        },
        p_opcoes: {
          entregue_em: new Date(form.entregue_em).toISOString(),
          faturamento: mode,
          motivo_nao_faturavel: reason,
        },
      });
      if (rpcErr) throw new Error(traduzErroEntrega(rpcErr.message));
      const res = data as any;
      if (res && res.success === false) throw new Error(traduzErroEntrega(res.message || "Falha ao confirmar"));
      return res;

    },
    onSuccess: () => {
      toast({ title: "Entrega confirmada com sucesso" });
      qc.invalidateQueries({ queryKey: ["entregas"] });
      qc.invalidateQueries({ queryKey: ["entrega-docs", entrega?.id] });
      qc.invalidateQueries({ queryKey: ["entregas-nao-faturadas"] });
      const m = mode as ConfirmMode;
      const id = entrega?.id;
      onClose();
      if (m && id) onConfirmed?.(m, id);
    },
    onError: (e: any) =>
      toast({ title: "Não foi possível confirmar", description: e.message, variant: "destructive" }),
  });

  if (!entrega) return null;

  const submitDisabled =
    confirmar.isPending ||
    !form.recebido_por_nome.trim() ||
    !mode ||
    (mode === "not_billable" && (!motivoNB || !motivoNBTexto.trim())) ||
    (requerComprovante && totalAnexos === 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar Entrega</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm grid grid-cols-2 gap-2">
          <div><span className="text-muted-foreground">Cliente:</span> <strong>{entrega.clientes?.nome || "—"}</strong></div>
          <div><span className="text-muted-foreground">Produto:</span> {entrega.produtos?.nome || "—"}</div>
          <div><span className="text-muted-foreground">Quantidade:</span> <strong>{entrega.quantidade_entregue}</strong></div>
          <div><span className="text-muted-foreground">Lote:</span> <span className="font-mono-data">{entrega.lotes?.codigo_lote || "—"}</span></div>
        </div>

        {requerComprovante && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            Esta entrega exige pelo menos um comprovante anexado para ser confirmada.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Data/hora da entrega *</Label>
            <Input type="datetime-local" value={form.entregue_em}
              onChange={(e) => setForm((f) => ({ ...f, entregue_em: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Label>Recebido por (nome) *</Label>
            <Input value={form.recebido_por_nome} maxLength={150}
              onChange={(e) => setForm((f) => ({ ...f, recebido_por_nome: e.target.value }))}
              placeholder="Nome de quem recebeu na fazenda" />
          </div>
          <div>
            <Label>Cargo / função</Label>
            <Input value={form.recebido_por_cargo} maxLength={100}
              onChange={(e) => setForm((f) => ({ ...f, recebido_por_cargo: e.target.value }))}
              placeholder="Ex.: Gerente da fazenda" />
          </div>
          <div>
            <Label>Documento (opcional)</Label>
            <Input value={form.recebido_por_documento} maxLength={50}
              onChange={(e) => setForm((f) => ({ ...f, recebido_por_documento: e.target.value }))}
              placeholder="CPF / RG" />
          </div>
          <div className="sm:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={3} maxLength={1000}
              value={form.observacoes_confirmacao}
              onChange={(e) => setForm((f) => ({ ...f, observacoes_confirmacao: e.target.value }))}
              placeholder="Ocorrências, divergências, observações do recebimento…" />
          </div>
        </div>

        {/* Anexos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> Anexos {requerComprovante ? "*" : "(opcional)"}</Label>
            <label className="inline-flex">
              <input type="file" multiple accept={ACCEPT} className="hidden"
                onChange={(e) => { onPick(e.target.files); e.currentTarget.value = ""; }} />
              <Button type="button" variant="outline" size="sm" asChild>
                <span><Upload className="h-4 w-4 mr-1" /> Adicionar arquivo</span>
              </Button>
            </label>
          </div>

          {docsExistentes.length > 0 && (
            <div className="rounded-md border divide-y text-xs">
              {docsExistentes.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary">{TIPOS.find((t) => t.value === d.tipo_documento)?.label || d.tipo_documento}</Badge>
                    <span className="truncate">{d.nome_arquivo}</span>
                  </div>
                  <span className="text-muted-foreground">salvo</span>
                </div>
              ))}
            </div>
          )}

          {pending.length > 0 && (
            <div className="rounded-md border divide-y text-xs">
              {pending.map((pf) => (
                <div key={pf.id} className="flex items-center justify-between gap-2 p-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Select value={pf.tipo} onValueChange={(v) => setPending((p) => p.map((x) => (x.id === pf.id ? { ...x, tipo: v } : x)))}>
                      <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="truncate">{pf.file.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{(pf.file.size / 1024).toFixed(0)} KB</span>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removePending(pf.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {totalAnexos === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum anexo adicionado. Aceita PDF, PNG, JPG (até 15MB cada).</p>
          )}
        </div>

        {/* Faturamento */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-sm font-medium">Faturamento *</Label>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as ConfirmMode)} className="space-y-2">
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
              <RadioGroupItem value="bill_now" id="m1" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium"><DollarSign className="h-4 w-4" /> Confirmar e gerar contas a receber agora</div>
                <p className="text-xs text-muted-foreground">Abre o passo financeiro logo após a confirmação.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
              <RadioGroupItem value="bill_later" id="m2" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4" /> Confirmar e faturar depois</div>
                <p className="text-xs text-muted-foreground">A entrega entra na fila de "Entregas pendentes de faturamento".</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
              <RadioGroupItem value="not_billable" id="m3" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium"><Ban className="h-4 w-4" /> Confirmar sem cobrança</div>
                <p className="text-xs text-muted-foreground">Exige motivo. Não gera lançamento financeiro.</p>
              </div>
            </label>
          </RadioGroup>

          {mode === "not_billable" && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div>
                <Label>Motivo *</Label>
                <Select value={motivoNB} onValueChange={setMotivoNB}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_NAO_FATURAVEL.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Justificativa *</Label>
                <Textarea rows={2} maxLength={500} value={motivoNBTexto}
                  onChange={(e) => setMotivoNBTexto(e.target.value)}
                  placeholder="Descreva o motivo da entrega sem cobrança" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={confirmar.isPending}>Cancelar</Button>
          <Button onClick={() => confirmar.mutate()} disabled={submitDisabled}>
            {confirmar.isPending ? "Confirmando…" : "Confirmar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
