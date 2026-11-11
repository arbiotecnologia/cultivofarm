/**
 * Fase B — Atribuições de plano por parceiro/produtor.
 *
 * Um plano só se torna selecionável no carrinho quando a atribuição está
 * publicada. Preparação: administrador, financeiro, gestor comercial.
 * Publicação: administrador e financeiro.
 */
import { useMemo, useRef, useState } from "react";
import {
  usePlanAssignments,
  useSaveAssignment,
  useSubmitAssignment,
  usePublishAssignment,
  useArchiveAssignment,
  conditionErrorMessage,
  type AssignmentInput,
  type ConditionScope,
  type PlanAssignment,
} from "@/hooks/useCommercialConditions";
import { usePriceRuleLookups } from "@/hooks/useCommercialPriceRules";
import { useAllCommercialPaymentPlans } from "@/hooks/useCommercialPaymentPlansAdmin";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, Loader2, Plus, Send, CheckCircle2, Archive } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";
import { readCivilDateInput } from "@/lib/civil-date-input";
import { Pencil } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  published: "Publicado",
  archived: "Arquivado",
};

const statusVariant = (s: string): "default" | "secondary" | "outline" =>
  s === "published" ? "default" : s === "archived" ? "outline" : "secondary";

const emptyForm: AssignmentInput = {
  plan_id: "",
  buyer_scope: "partner",
  partner_id: null,
  customer_id: null,
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: null,
  motivo: null,
};

type PublishConfirmation = {
  assignment: PlanAssignment;
  conditionLabel: string;
  destinationLabel: string;
  scope: string;
};

const PUBLISH_CONTEXT_ERROR = "A sessão, a empresa, o perfil ou a atribuição mudou desde a abertura. Feche esta janela e abra a publicação novamente após a revalidação do acesso.";

function samePublishTarget(current: PlanAssignment | undefined, expected: PlanAssignment) {
  return !!current && current.id === expected.id && current.plan_id === expected.plan_id
    && current.buyer_scope === expected.buyer_scope && current.partner_id === expected.partner_id
    && current.customer_id === expected.customer_id && current.status === expected.status
    && current.valid_from === expected.valid_from && current.valid_until === expected.valid_until;
}

export function AtribuicoesPlanosTab() {
  const { roles } = useAuth();
  const canPublish = roles.includes("administrador") || roles.includes("financeiro");

  const { data: assignments = [], isLoading, isError, error } = usePlanAssignments();
  const { data: plans = [] } = useAllCommercialPaymentPlans();
  const { data: lookups } = usePriceRuleLookups();

  const save = useSaveAssignment();
  const submit = useSubmitAssignment();
  const publish = usePublishAssignment();
  const archive = useArchiveAssignment();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssignmentInput>(emptyForm);
  const [publishTarget, setPublishTarget] = useState<PublishConfirmation | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const publishOpening = useRef<(() => boolean) | null>(null);
  const publishLock = useRef(false);
  const validFromRef = useRef<HTMLInputElement>(null);
  const validUntilRef = useRef<HTMLInputElement>(null);

  const planName = useMemo(() => {
    const m = new Map<string, string>();
    plans.forEach((p) => m.set(p.id, `${p.code} — ${p.name}`));
    return m;
  }, [plans]);

  const partnerName = useMemo(() => {
    const m = new Map<string, string>();
    (lookups?.partners ?? []).forEach((p) => m.set(p.id, p.nome_fantasia || p.razao_social));
    return m;
  }, [lookups]);

  const denied = isError && String((error as Error)?.message ?? "").includes("permissão");

  function targetLabel(a: PlanAssignment) {
    if (a.buyer_scope === "partner") return partnerName.get(a.partner_id ?? "") ?? "Parceiro";
    if (a.buyer_scope === "producer") return "Produtor";
    return "Tabela padrão";
  }

  const publishContextValid = !!publishTarget && publish.ready && publish.scope === publishTarget.scope
    && publishOpening.current?.() === true
    && samePublishTarget(assignments.find((a) => a.id === publishTarget.assignment.id), publishTarget.assignment);

  function resetPublishConfirmation() {
    publishOpening.current = null;
    setPublishTarget(null);
    setPublishError(null);
  }

  function openPublishConfirmation(a: PlanAssignment) {
    if (!canPublish || !publish.ready || publish.isPending || publishLock.current) return;
    publishOpening.current = publish.capture();
    setPublishError(null);
    setPublishTarget({
      assignment: { ...a },
      conditionLabel: planName.get(a.plan_id) ?? a.plan_id,
      destinationLabel: a.buyer_scope === "partner"
        ? partnerName.get(a.partner_id ?? "") ?? `Parceiro ${a.partner_id ?? "não identificado"}`
        : a.buyer_scope === "producer" ? `Produtor ${a.customer_id ?? "não identificado"}` : "Tabela padrão",
      scope: publish.scope,
    });
  }

  function handlePublishConfirmation() {
    const target = publishTarget;
    if (!target || publishLock.current || publish.isPending) return;
    if (!publishContextValid) {
      setPublishError(PUBLISH_CONTEXT_ERROR);
      return;
    }
    publishLock.current = true;
    setPublishError(null);
    publish.mutate({ id: target.assignment.id }, {
      onSuccess: () => {
        toast.success("Atribuição publicada");
        resetPublishConfirmation();
      },
      onError: (e) => setPublishError(conditionErrorMessage((e as Error)?.message)),
      onSettled: () => { publishLock.current = false; },
    });
  }

  function onError(e: unknown) {
    toast.error(conditionErrorMessage((e as Error)?.message));
  }

  function handleSave() {
    if (!form.plan_id) {
      toast.error("Selecione a condição de pagamento.");
      return;
    }
    if (form.buyer_scope === "partner" && !form.partner_id) {
      toast.error("Selecione o parceiro.");
      return;
    }
    const payload: AssignmentInput = {
      ...form,
      valid_from: readCivilDateInput(validFromRef, form.valid_from),
      valid_until: readCivilDateInput(validUntilRef, form.valid_until),
    };
    if (payload.valid_from && payload.valid_until && payload.valid_until < payload.valid_from) {
      toast.error("A vigência final deve ser igual ou posterior à inicial.");
      return;
    }
    setForm(payload);
    save.mutate(payload, {
      onSuccess: () => {
        toast.success("Atribuição salva em rascunho — não elegível até publicação.");
        setOpen(false);
        setForm(emptyForm);
      },
      onError,
    });
  }

  function openEdit(a: PlanAssignment) {
    setForm({
      id: a.id,
      plan_id: a.plan_id,
      buyer_scope: a.buyer_scope,
      partner_id: a.partner_id,
      customer_id: a.customer_id,
      valid_from: a.valid_from ? a.valid_from.slice(0, 10) : null,
      valid_until: a.valid_until ? a.valid_until.slice(0, 10) : null,
      motivo: a.motivo,
    });
    setOpen(true);
  }

  function assignmentActions(a: PlanAssignment) {
    return <>{a.status === "draft" && (
                        <Button size="sm" variant="ghost" disabled={save.isPending}
                          aria-label="Editar atribuição" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      )}                      {a.status === "draft" && (
                        <Button
                          size="sm" disabled={submit.isPending || publish.isPending || archive.isPending}
                          variant="outline"
                          onClick={() =>
                            submit.mutate({ id: a.id }, { onSuccess: () => toast.success("Enviado para aprovação"), onError })
                          }
                        >
                          <Send className="h-3.5 w-3.5 mr-1" /> Solicitar aprovação
                        </Button>
                      )}
                      {canPublish && a.status !== "published" && a.status !== "archived" && (
                        <Button
                          size="sm" disabled={submit.isPending || publish.isPending || archive.isPending || !publish.ready}
                          onClick={() => openPublishConfirmation(a)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Publicar
                        </Button>
                      )}
                      {canPublish && a.status !== "archived" && (
                        <Button
                          size="sm" disabled={submit.isPending || publish.isPending || archive.isPending}
                          variant="ghost"
                          onClick={() => {
                            const motivo = prompt("Motivo do arquivamento:") ?? "";
                            if (!motivo.trim()) return;
                            archive.mutate({ id: a.id, motivo }, { onSuccess: () => toast.success("Arquivada"), onError });
                          }}
                        >
                          <Archive className="h-3.5 w-3.5 mr-1" /> Arquivar
                        </Button>
                      )}
</>;
  }

  if (denied) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Você não tem permissão para administrar atribuições de planos.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Nenhum plano fica disponível para o parceiro sem atribuição <strong>publicada</strong>. Rascunhos e
          itens aguardando aprovação não são elegíveis no carrinho.
        </AlertDescription>
      </Alert>

      <div className="flex justify-between items-center gap-2">
        <div>
          <h2 className="text-lg font-medium">Atribuições de condição</h2>
          <p className="text-sm text-muted-foreground">Vincule condições de pagamento a parceiros ou produtores.</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova atribuição
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Atribuições cadastradas</CardTitle>
          <CardDescription>
            {canPublish
              ? "Você pode publicar e arquivar atribuições."
              : "Seu perfil prepara e solicita aprovação; a publicação é do financeiro/administrador."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Condição</TableHead>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && assignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma atribuição cadastrada.
                    </TableCell>
                  </TableRow>
                )}
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{planName.get(a.plan_id) ?? a.plan_id}</TableCell>
                    <TableCell className="capitalize">{a.buyer_scope}</TableCell>
                    <TableCell>{targetLabel(a)}</TableCell>
                    <TableCell className="text-sm">
                      {formatDateDisplay(a.valid_from)} → {a.valid_until ? formatDateDisplay(a.valid_until) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(a.status)}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {assignmentActions(a)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y">
            {isLoading && <div className="p-4 text-center text-sm">Carregando…</div>}
            {!isLoading && assignments.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">Nenhuma atribuição cadastrada.</div>
            )}
            {assignments.map((a) => (
              <div key={a.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{planName.get(a.plan_id) ?? a.plan_id}</span>
                  <Badge variant={statusVariant(a.status)}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {targetLabel(a)} · {formatDateDisplay(a.valid_from)}
                </p>
                <div className="flex gap-2">
                  {assignmentActions(a)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar atribuição (rascunho)" : "Nova atribuição"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="assignment-field-1">Condição de pagamento</Label>
              <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger id="assignment-field-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="assignment-field-2">Escopo</Label>
              <Select
                value={form.buyer_scope}
                onValueChange={(v) =>
                  setForm({ ...form, buyer_scope: v as ConditionScope, partner_id: null, customer_id: null })
                }
              >
                <SelectTrigger id="assignment-field-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">Parceiro B2B</SelectItem>
                  <SelectItem value="default">Tabela padrão (modelo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.buyer_scope === "partner" && (
              <div>
                <Label htmlFor="assignment-field-3">Parceiro</Label>
                <Select value={form.partner_id ?? ""} onValueChange={(v) => setForm({ ...form, partner_id: v })}>
                  <SelectTrigger id="assignment-field-3"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.partners ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="assignment-field-4">Vigência inicial</Label>
                <Input id="assignment-field-4"
                  type="date"
                  ref={validFromRef}
                  value={form.valid_from ?? ""}
                  onChange={(e) => { const v = e.target.value || null; setForm((f) => ({ ...f, valid_from: v })); }}
                  onInput={(e) => { const v = (e.target as HTMLInputElement).value || null; setForm((f) => ({ ...f, valid_from: v })); }}
                />
              </div>
              <div>
                <Label htmlFor="assignment-field-5">Vigência final</Label>
                <Input id="assignment-field-5"
                  type="date"
                  ref={validUntilRef}
                  value={form.valid_until ?? ""}
                  onChange={(e) => { const v = e.target.value || null; setForm((f) => ({ ...f, valid_until: v })); }}
                  onInput={(e) => { const v = (e.target as HTMLInputElement).value || null; setForm((f) => ({ ...f, valid_until: v })); }}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="assignment-field-6">Motivo / observação</Label>
              <Textarea id="assignment-field-6"
                value={form.motivo ?? ""}
                onChange={(e) => setForm({ ...form, motivo: e.target.value || null })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!publishTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !publish.isPending) resetPublishConfirmation();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar atribuição?</AlertDialogTitle>
            <AlertDialogDescription>
              A condição passa a ficar elegível somente para o destino conferido abaixo. A publicação só é confirmada após a resposta do servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {publishTarget && (
            <dl className="space-y-3 rounded-md border p-4 text-sm">
              <div>
                <dt className="font-medium">Condição</dt>
                <dd className="text-muted-foreground">{publishTarget.conditionLabel}</dd>
              </div>
              <div>
                <dt className="font-medium">Destino</dt>
                <dd className="text-muted-foreground">{publishTarget.destinationLabel}</dd>
              </div>
              <div>
                <dt className="font-medium">Vigência</dt>
                <dd className="text-muted-foreground">
                  {formatDateDisplay(publishTarget.assignment.valid_from)} → {publishTarget.assignment.valid_until ? formatDateDisplay(publishTarget.assignment.valid_until) : "sem data final"}
                </dd>
              </div>
            </dl>
          )}
          {(publishError || (publishTarget && !publishContextValid)) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{publishError ?? PUBLISH_CONTEXT_ERROR}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publish.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={publish.isPending || !publishContextValid}
              onClick={(event) => {
                event.preventDefault();
                handlePublishConfirmation();
              }}
            >
              {publish.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {publish.isPending ? "Publicando…" : "Confirmar publicação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
