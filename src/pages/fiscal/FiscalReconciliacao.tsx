/**
 * Fase Fiscal 3.6 — Página de reconciliação assistida (fila + resumo).
 * Sem emissão. Sem escrita em AR/entregas. Escrita atrás de flag.
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useReconciliationQueue,
  useReconciliationInvoice,
  useReconciliationEvents,
  useLinkFiscalInvoice,
  useUnlinkFiscalInvoice,
  type QueueParams,
} from "@/hooks/useFiscalReconciliation";
import {
  RECONCILIATION_STATUS_VALUES,
  PENDENCY_KIND_VALUES,
  classifyPendency,
  summarize,
  maskAccessKey,
  maskDocument,
  truncateId,
  ReconciliationWriteDisabledError,
  OptimisticReconciliationConflictError,
  NonManualInvoiceError,
  type PendencyKind,
} from "@/lib/fiscal/reconciliationValidation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Lock, ShieldOff } from "lucide-react";
import {
  DOCUMENT_MODEL,
  DOCUMENT_ORIGIN,
  RECONCILIATION_STATUS,
  NORMALIZED_STATUS,
  INVOICE_TYPE,
} from "@/lib/fiscal/labels";

const ROUTE = "/fiscal/reconciliacao";

const KIND_LABEL: Record<PendencyKind, string> = {
  MISSING_RECEIVABLE: "Sem conta a receber",
  MISSING_DELIVERY: "Sem entrega vinculada",
  STATUS_DIVERGENT: "Status divergente",
  REVIEW_REQUIRED: "Revisão necessária",
};

function Banner() {
  return (
    <Alert data-testid="fiscal-recon-banner">
      <ShieldOff className="h-4 w-4" aria-hidden />
      <AlertTitle>Reconciliação fiscal interna — emissão desativada</AlertTitle>
      <AlertDescription>
        Esta tela consulta pendências e permite reconciliar vínculos apenas em
        documentos fiscais MANUAIS. Nenhuma ação transmite, autoriza, cancela
        ou consulta documento fiscal externo.
      </AlertDescription>
    </Alert>
  );
}

export default function FiscalReconciliacao() {
  const { role } = useAuth();
  const { toast } = useToast();
  const access = getAccessLevel(role, ROUTE);
  const canWrite = access === "rw";
  const flagOn = FEATURE_FLAGS.fiscalReconciliationUi === true;
  const writeFlagOn = FEATURE_FLAGS.fiscalReconciliationWrite === true;
  const manualEventFlagOn = FEATURE_FLAGS.fiscalDocumentManualEventRpc === true;

  const [documentModel, setDocumentModel] = useState<string>("");
  const [documentOrigin, setDocumentOrigin] = useState<string>("");
  const [reconciliationStatus, setReconciliationStatus] = useState<string>("");
  const [hasReceivable, setHasReceivable] = useState<"any" | "yes" | "no">("any");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const params: QueueParams = useMemo(
    () => ({
      documentModel: documentModel || null,
      documentOrigin: documentOrigin || null,
      reconciliationStatus: reconciliationStatus || null,
      normalizedStatus: null,
      hasReceivable,
      page,
      pageSize,
    }),
    [documentModel, documentOrigin, reconciliationStatus, hasReceivable, page],
  );

  const queueQ = useReconciliationQueue(params);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const invoiceQ = useReconciliationInvoice(selectedId);
  const eventsQ = useReconciliationEvents(selectedId);
  const linkMut = useLinkFiscalInvoice();
  const unlinkMut = useUnlinkFiscalInvoice();

  const summary = useMemo(() => {
    const items = queueQ.data?.items ?? [];
    return summarize(items, items.map(() => null));
  }, [queueQ.data?.items]);

  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-recon-forbidden">
        <Alert variant="destructive">
          <AlertTitle>Acesso negado</AlertTitle>
          <AlertDescription>
            Você não tem permissão para acessar a reconciliação fiscal.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="p-6 space-y-4" data-testid="fiscal-recon-preparation">
        <Banner />
        <Card>
          <CardHeader>
            <CardTitle>Reconciliação Fiscal — Preparação</CardTitle>
            <CardDescription>
              Módulo isolado. Ativação depende das flags
              <code className="mx-1">fiscalReconciliationUi</code> e
              <code className="mx-1">fiscalReconciliationWrite</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Fila lê apenas <em>v_fiscal_document_reconciliation_pending</em>.
            Vínculo/desvínculo atualiza somente <em>fiscal_invoices</em>
            manuais; jamais toca contas a receber ou entregas.
          </CardContent>
        </Card>
      </div>
    );
  }

  const total = queueQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="fiscal-recon-root">
      <Banner />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Reconciliação Fiscal</h1>
          <p className="text-sm text-muted-foreground">
            Fila de pendências e resumo interno somente leitura.
          </p>
        </div>
        {!writeFlagOn && (
          <Badge variant="outline" aria-live="polite">
            Escrita indisponível (flag <code>fiscalReconciliationWrite</code>)
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resumo</CardTitle>
          <CardDescription>Amostra da página atual, sem SELECT amplo.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <SummaryTile label="Total (amostra)" value={String(summary.total)} />
          {PENDENCY_KIND_VALUES.map((k) => (
            <SummaryTile key={k} label={KIND_LABEL[k]} value={String(summary.byKind[k])} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="grid min-w-0 content-start gap-1.5">
            <Label>Modelo</Label>
            <Select
              value={documentModel || "__all__"}
              onValueChange={(v) => { setDocumentModel(v === "__all__" ? "" : v); setPage(1); }}
            >
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="NFE">{INVOICE_TYPE.label("NFE")}</SelectItem>
                <SelectItem value="NFSE">{INVOICE_TYPE.label("NFSE")}</SelectItem>
                <SelectItem value="OTHER">{INVOICE_TYPE.label("OTHER")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label>Origem</Label>
            <Select
              value={documentOrigin || "__all__"}
              onValueChange={(v) => { setDocumentOrigin(v === "__all__" ? "" : v); setPage(1); }}
            >
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                <SelectItem value="MANUAL_RECORD">{DOCUMENT_ORIGIN.label("MANUAL_RECORD")}</SelectItem>
                <SelectItem value="EXTERNAL_IMPORTED">{DOCUMENT_ORIGIN.label("EXTERNAL_IMPORTED")}</SelectItem>
                <SelectItem value="SYSTEM_PREPARED">{DOCUMENT_ORIGIN.label("SYSTEM_PREPARED")}</SelectItem>
                <SelectItem value="PROVIDER_INTEGRATED">{DOCUMENT_ORIGIN.label("PROVIDER_INTEGRATED")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label>Status reconc.</Label>
            <Select
              value={reconciliationStatus || "__all__"}
              onValueChange={(v) => { setReconciliationStatus(v === "__all__" ? "" : v); setPage(1); }}
            >
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {RECONCILIATION_STATUS_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>{RECONCILIATION_STATUS.label(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label>Vínculo AR</Label>
            <Select
              value={hasReceivable}
              onValueChange={(v) => { setHasReceivable(v as typeof hasReceivable); setPage(1); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer</SelectItem>
                <SelectItem value="yes">Com AR</SelectItem>
                <SelectItem value="no">Sem AR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Fila de pendências</CardTitle>
          <div className="text-xs text-muted-foreground" aria-live="polite">
            {queueQ.isLoading ? "Carregando..." : `${total} pendência(s)`}
          </div>
        </CardHeader>
        <CardContent>
          {queueQ.isLoading && (
            <div data-testid="fiscal-recon-loading" className="text-sm text-muted-foreground">
              Carregando pendências…
            </div>
          )}
          {queueQ.isError && (
            <Alert variant="destructive" data-testid="fiscal-recon-error">
              <AlertTitle>Erro ao carregar</AlertTitle>
              <AlertDescription>
                {(queueQ.error as Error)?.message ?? "Falha inesperada."}
              </AlertDescription>
            </Alert>
          )}
          {!queueQ.isLoading && !queueQ.isError && total === 0 && (
            <div data-testid="fiscal-recon-empty" className="text-sm text-muted-foreground">
              Nenhuma pendência encontrada.
            </div>
          )}
          {!queueQ.isLoading && !queueQ.isError && total > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Motivo</th>
                    <th className="p-2">Modelo</th>
                    <th className="p-2">Origem</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Reconc.</th>
                    <th className="p-2">AR</th>
                    <th className="p-2 sr-only">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {queueQ.data?.items.map((r) => (
                    <tr
                      key={r.fiscal_invoice_id ?? Math.random()}
                      tabIndex={0}
                      role="button"
                      aria-label={`Abrir detalhe do documento ${truncateId(r.fiscal_invoice_id)}`}
                      onClick={() => r.fiscal_invoice_id && setSelectedId(r.fiscal_invoice_id)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && r.fiscal_invoice_id) {
                          e.preventDefault();
                          setSelectedId(r.fiscal_invoice_id);
                        }
                      }}
                      className="border-t hover:bg-muted/40 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid={`fiscal-recon-row-${r.fiscal_invoice_id ?? ""}`}
                    >
                      <td className="p-2">
                        <Badge variant="secondary">
                          {KIND_LABEL[classifyPendency(r)]}
                        </Badge>
                      </td>
                      <td className="p-2">{r.document_model ? DOCUMENT_MODEL.label(r.document_model) : "—"}</td>
                      <td className="p-2">{r.document_origin ? DOCUMENT_ORIGIN.label(r.document_origin) : "—"}</td>
                      <td className="p-2">{(r.normalized_status || r.status) ? NORMALIZED_STATUS.label(r.normalized_status ?? r.status) : "—"}</td>
                      <td className="p-2">{r.reconciliation_status ? RECONCILIATION_STATUS.label(r.reconciliation_status) : "—"}</td>
                      <td className="p-2 text-xs">{r.receivable_id ? truncateId(r.receivable_id, 8) : "—"}</td>
                      <td className="p-2 text-right">Detalhes</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between pt-3">
                <Button
                  variant="ghost" size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Página anterior"
                >Anterior</Button>
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="ghost" size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Próxima página"
                >Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DetailDrawer
        open={selectedId !== null}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
        canWrite={canWrite}
        writeFlagOn={writeFlagOn}
        manualEventFlagOn={manualEventFlagOn}
        invoice={invoiceQ.data ?? null}
        invoiceLoading={invoiceQ.isLoading}
        invoiceError={invoiceQ.error as Error | null}
        events={eventsQ.data ?? []}
        onLink={async (target, targetId, confirmOverwrite) => {
          if (!invoiceQ.data) return;
          try {
            await linkMut.mutateAsync({
              values: { invoiceId: invoiceQ.data.id, target, targetId, confirmOverwrite },
              prev: invoiceQ.data,
              writeEnabled: writeFlagOn,
            });
            toast({ title: "Vínculo aplicado" });
          } catch (e) {
            handleErr(e, toast);
          }
        }}
        onUnlink={async (target, reason) => {
          if (!invoiceQ.data) return;
          try {
            await unlinkMut.mutateAsync({
              values: { invoiceId: invoiceQ.data.id, target, reason },
              prev: invoiceQ.data,
              writeEnabled: writeFlagOn,
              manualEventEnabled: manualEventFlagOn,
            });
            toast({ title: "Vínculo removido" });
          } catch (e) {
            handleErr(e, toast);
          }
        }}
      />
    </div>
  );
}

function SummaryTile(props: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="text-2xl font-semibold" aria-live="polite">{props.value}</div>
    </div>
  );
}

function handleErr(e: unknown, toast: ReturnType<typeof useToast>["toast"]) {
  if (e instanceof ReconciliationWriteDisabledError) {
    toast({ title: "Ação indisponível", description: e.message });
    return;
  }
  if (e instanceof OptimisticReconciliationConflictError) {
    toast({ title: "Conflito de concorrência", description: e.message, variant: "destructive" });
    return;
  }
  if (e instanceof NonManualInvoiceError) {
    toast({ title: "Documento não elegível", description: e.message, variant: "destructive" });
    return;
  }
  toast({
    title: "Erro",
    description: (e as Error)?.message ?? "Falha inesperada.",
    variant: "destructive",
  });
}

interface DetailProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canWrite: boolean;
  writeFlagOn: boolean;
  manualEventFlagOn: boolean;
  invoice: import("@/lib/fiscal/reconciliationValidation").FiscalInvoiceRow | null;
  invoiceLoading: boolean;
  invoiceError: Error | null;
  events: import("@/integrations/supabase/cultivofarm.types").Database["public"]["Tables"]["fiscal_events"]["Row"][];
  onLink: (target: "receivable_id" | "delivery_id", targetId: string, confirmOverwrite: boolean) => Promise<void>;
  onUnlink: (target: "receivable_id" | "delivery_id", reason: string) => Promise<void>;
}

function DetailDrawer(props: DetailProps) {
  const { invoice, canWrite, writeFlagOn, manualEventFlagOn, events } = props;
  const [target, setTarget] = useState<"receivable_id" | "delivery_id">("receivable_id");
  const [targetId, setTargetId] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [reason, setReason] = useState("");

  const editable =
    !!invoice &&
    !invoice.locked_at &&
    invoice.document_origin === "MANUAL_RECORD" &&
    invoice.provider === "NONE";
  const writeAllowed = canWrite && writeFlagOn && editable;

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {invoice ? `Documento ${invoice.invoice_number ?? truncateId(invoice.id)}` : "Documento"}
          </SheetTitle>
          <SheetDescription>
            Vínculo/desvínculo altera apenas o documento fiscal. Contas a receber
            e entregas permanecem inalteradas.
          </SheetDescription>
        </SheetHeader>

        {props.invoiceLoading && <div className="py-4 text-sm text-muted-foreground">Carregando…</div>}
        {props.invoiceError && (
          <Alert variant="destructive" className="my-3">
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{props.invoiceError.message}</AlertDescription>
          </Alert>
        )}

        {invoice && !editable && (
          <Alert className="my-3" data-testid="fiscal-recon-readonly">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Somente leitura</AlertTitle>
            <AlertDescription>
              {invoice.locked_at
                ? "Documento travado por processo de integração."
                : "Documento não é MANUAL/NONE."}
            </AlertDescription>
          </Alert>
        )}
        {invoice && editable && !writeFlagOn && (
          <Alert className="my-3">
            <AlertTitle>Escrita atrás de flag</AlertTitle>
            <AlertDescription>
              A ação será exibida como pré-visualização. Habilitação depende de
              certificação em staging (<code>fiscalReconciliationWrite</code>).
            </AlertDescription>
          </Alert>
        )}

        {invoice && (
          <Tabs defaultValue="link" className="mt-2">
            <TabsList>
              <TabsTrigger value="link">Vincular</TabsTrigger>
              <TabsTrigger value="unlink">Desvincular</TabsTrigger>
              <TabsTrigger value="context">Contexto</TabsTrigger>
              <TabsTrigger value="events">Eventos ({events.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="link">
              <div className="space-y-3">
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Campo</Label>
                  <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receivable_id">Conta a receber</SelectItem>
                      <SelectItem value="delivery_id">Entrega</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>UUID de referência</Label>
                  <Input
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    disabled={!writeAllowed}
                    placeholder="UUID existente (não altera AR/entrega)"
                    aria-label="UUID de referência"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmOverwrite}
                    onChange={(e) => setConfirmOverwrite(e.target.checked)}
                    disabled={!writeAllowed}
                  />
                  Confirmar substituição de vínculo existente
                </label>
                <SheetFooter>
                  <Button
                    disabled={!writeAllowed}
                    onClick={() => props.onLink(target, targetId.trim(), confirmOverwrite)}
                    data-testid="fiscal-recon-link"
                  >
                    Aplicar vínculo
                  </Button>
                </SheetFooter>
              </div>
            </TabsContent>

            <TabsContent value="unlink">
              <div className="space-y-3">
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Campo</Label>
                  <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receivable_id">Conta a receber</SelectItem>
                      <SelectItem value="delivery_id">Entrega</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Motivo (10–500 caracteres)</Label>
                  <Textarea
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={!writeAllowed}
                    aria-label="Motivo do desvínculo"
                  />
                </div>
                {!manualEventFlagOn && (
                  <p className="text-xs text-muted-foreground">
                    Evento manual indisponível até habilitar
                    <code className="mx-1">fiscalDocumentManualEventRpc</code>.
                  </p>
                )}
                <SheetFooter>
                  <Button
                    variant="destructive"
                    disabled={!writeAllowed}
                    onClick={() => props.onUnlink(target, reason)}
                    data-testid="fiscal-recon-unlink"
                  >
                    Remover vínculo
                  </Button>
                </SheetFooter>
              </div>
            </TabsContent>

            <TabsContent value="context">
              <dl className="text-sm grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Modelo</dt>
                <dd>{invoice.document_model ?? "—"}</dd>
                <dt className="text-muted-foreground">Origem</dt>
                <dd>{invoice.document_origin ?? "—"}</dd>
                <dt className="text-muted-foreground">Provider</dt>
                <dd>{invoice.provider ?? "—"}</dd>
                <dt className="text-muted-foreground">Ambiente</dt>
                <dd>{invoice.environment ?? "—"}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  {invoice.normalized_status ?? invoice.status ?? "—"}
                  {invoice.locked_at && (
                    <Badge className="ml-2" variant="secondary">
                      <Lock className="w-3 h-3 mr-1" /> travado
                    </Badge>
                  )}
                </dd>
                <dt className="text-muted-foreground">CNPJ (mascarado)</dt>
                <dd>{maskDocument(invoice.company_cnpj)}</dd>
                <dt className="text-muted-foreground">Chave (mascarada)</dt>
                <dd>{maskAccessKey(invoice.access_key)}</dd>
                <dt className="text-muted-foreground">Receivable</dt>
                <dd>{invoice.receivable_id ? truncateId(invoice.receivable_id, 8) : "—"}</dd>
                <dt className="text-muted-foreground">Entrega</dt>
                <dd>{invoice.delivery_id ? truncateId(invoice.delivery_id, 8) : "—"}</dd>
              </dl>
            </TabsContent>

            <TabsContent value="events">
              {events.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem eventos.</p>
              )}
              {events.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {events.map((ev) => (
                    <li key={ev.id} className="border rounded p-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{ev.event_type} · {ev.event_source}</span>
                        <span>{new Date(ev.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <div className="text-xs">
                        {ev.status_before ?? "—"} → {ev.status_after ?? "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Snapshots mascarados. Erros: {ev.error_code ?? "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
