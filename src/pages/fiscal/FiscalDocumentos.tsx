/**
 * Fase Fiscal 3.5 — Workflow Documental Fiscal MANUAL (sem emissão).
 *
 * Rota: /fiscal/documentos. Sob feature flag `fiscalDocumentWorkflowUi`
 * (default false). Sem entrada no menu enquanto a flag estiver desligada.
 * Emissão fiscal está permanentemente desativada nesta fase.
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  useFiscalDocumentList,
  useFiscalDocument,
  useFiscalDocumentItems,
  useFiscalDocumentEvents,
  useFiscalAuditLog,
  useReconciliationPending,
  useSaveFiscalDocument,
  useRegisterManualEvent,
  isEditableManualDocument,
  OptimisticFiscalConflictError,
  InvoiceLockedError,
  ManualEventRpcDisabledError,
} from "@/hooks/useFiscalDocuments";
import {
  invoiceFormSchema,
  rowToFormValues,
  maskSnapshot,
  maskSensitiveText,
  truncate,
  DOCUMENT_MODEL_VALUES,
  INVOICE_TYPE_VALUES,
  ENVIRONMENT_ALLOWED,
  STATUS_ALLOWED,
  NORMALIZED_STATUS_MANUAL,
  RECONCILIATION_STATUS_VALUES,
  MANUAL_EVENT_TYPES,
  type InvoiceFormValues,
  type ManualEventType,
} from "@/lib/fiscal/documentWorkflowValidation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Lock, ShieldOff, FilePlus2 } from "lucide-react";
import RascunhoWizard from "@/components/fiscal/documentos/RascunhoWizard";
import { useFiscalCompanySettings } from "@/hooks/useFiscalCompanySettings";
import {
  labelDocumentModel,
  labelDocumentOrigin,
  labelNormalizedStatus,
  labelStatus,
  labelEnvironment,
  labelReconciliationStatus,
  labelInvoiceType,
  labelItemKind,
} from "@/lib/fiscal/documentLabels";


const ROUTE = "/fiscal/documentos";

function currency(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function EmissionOffBanner() {
  return (
    <Alert data-testid="fiscal-emission-off">
      <ShieldOff className="h-4 w-4" aria-hidden />
      <AlertTitle>HOMOLOGAÇÃO — SEM VALOR FISCAL</AlertTitle>
      <AlertDescription>
        Emissão fiscal desativada. Esta tela mantém apenas registros
        documentais MANUAIS; nenhuma ação transmite, autoriza, cancela ou
        consulta documento fiscal.
      </AlertDescription>
    </Alert>
  );
}

export default function FiscalDocumentos() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const access = getAccessLevel(role, ROUTE);
  const canWrite = access === "rw";
  const flagOn = FEATURE_FLAGS.fiscalDocumentWorkflowUi === true;
  const manualEventFlag = FEATURE_FLAGS.fiscalDocumentManualEventRpc === true;

  const [search, setSearch] = useState("");
  const [documentModel, setDocumentModel] = useState<string>("");
  const [normalizedStatus, setNormalizedStatus] = useState<string>("");
  const [reconciliationStatus, setReconciliationStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const listParams = useMemo(
    () => ({
      search,
      documentModel: documentModel || null,
      documentOrigin: null,
      normalizedStatus: normalizedStatus || null,
      reconciliationStatus: reconciliationStatus || null,
      environment: null,
      page,
      pageSize,
    }),
    [search, documentModel, normalizedStatus, reconciliationStatus, page],
  );

  const listQ = useFiscalDocumentList(listParams);
  const reconQ = useReconciliationPending();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const companyQ = useFiscalCompanySettings({ enabled: flagOn && access !== "none" });

  const detailQ = useFiscalDocument(selectedId);
  const itemsQ = useFiscalDocumentItems(selectedId);
  const eventsQ = useFiscalDocumentEvents(selectedId);
  const auditQ = useFiscalAuditLog(selectedId);
  const saveMut = useSaveFiscalDocument();
  const eventMut = useRegisterManualEvent();

  if (access === "none") {
    return (
      <div className="p-6" data-testid="fiscal-doc-forbidden">
        <Alert variant="destructive">
          <AlertTitle>Acesso negado</AlertTitle>
          <AlertDescription>
            Você não tem permissão para acessar o workflow documental fiscal.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="p-6 space-y-4" data-testid="fiscal-doc-preparation">
        <EmissionOffBanner />
        <Card>
          <CardHeader>
            <CardTitle>Workflow Documental Fiscal — Preparação</CardTitle>
            <CardDescription>
              Módulo isolado, sem emissão. Ativação depende da flag
              <code className="mx-1">fiscalDocumentWorkflowUi</code> e do
              gate secundário <code>fiscalDocumentManualEventRpc</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Recursos previstos: consulta paginada de <em>fiscal_invoices</em>,
            detalhe com itens, eventos e trilha de auditoria mascarados,
            criação/edição manual restrita a ambiente seguro
            (Não configurado/Homologação) e provedor Nenhum.
          </CardContent>
        </Card>
      </div>
    );
  }

  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="fiscal-doc-root">
      <EmissionOffBanner />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documentos Fiscais (Manual)</h1>
          <p className="text-sm text-muted-foreground">
            Consulta, edição documental e reconciliação. Sem emissão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <Button
              variant="default"
              onClick={() => setWizardOpen(true)}
              data-testid="fiscal-doc-novo-rascunho"
            >
              <FilePlus2 className="h-4 w-4 mr-2" aria-hidden /> Novo rascunho NF-e / NFS-e
            </Button>
          )}
          {canWrite && (
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedId(null);
                setCreating(true);
              }}
              data-testid="fiscal-doc-new"
            >
              Novo registro manual
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="grid min-w-0 content-start gap-1.5">
            <Label>Busca</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Número, série ou CNPJ"
              data-testid="fiscal-doc-search"
            />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label>Modelo</Label>
            <Select
              value={documentModel || "__all__"}
              onValueChange={(v) => {
                setDocumentModel(v === "__all__" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {DOCUMENT_MODEL_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>{labelDocumentModel(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label>Status normalizado</Label>
            <Select
              value={normalizedStatus || "__all__"}
              onValueChange={(v) => {
                setNormalizedStatus(v === "__all__" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {NORMALIZED_STATUS_MANUAL.map((v) => (
                  <SelectItem key={v} value={v}>{labelNormalizedStatus(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label>Reconciliação</Label>
            <Select
              value={reconciliationStatus || "__all__"}
              onValueChange={(v) => {
                setReconciliationStatus(v === "__all__" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {RECONCILIATION_STATUS_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>{labelReconciliationStatus(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Registros</CardTitle>
          <div className="text-xs text-muted-foreground">
            {listQ.isLoading ? "Carregando..." : `${total} registro(s)`}
          </div>
        </CardHeader>
        <CardContent>
          {listQ.isLoading && (
            <div data-testid="fiscal-doc-loading" className="text-sm text-muted-foreground">
              Carregando registros…
            </div>
          )}
          {listQ.isError && (
            <Alert variant="destructive" data-testid="fiscal-doc-error">
              <AlertTitle>Erro ao carregar</AlertTitle>
              <AlertDescription>
                {(listQ.error as Error)?.message ?? "Falha inesperada."}
              </AlertDescription>
            </Alert>
          )}
          {!listQ.isLoading && !listQ.isError && total === 0 && (
            <div data-testid="fiscal-doc-empty" className="text-sm text-muted-foreground">
              Nenhum registro fiscal manual encontrado.
            </div>
          )}
          {!listQ.isLoading && !listQ.isError && total > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Modelo</th>
                    <th className="p-2">Origem</th>
                    <th className="p-2">Nº / Série</th>
                    <th className="p-2">Emissão</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Reconc.</th>
                    <th className="p-2">Valor</th>
                    <th className="p-2">Vínculos</th>
                    <th className="p-2 sr-only">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data?.items.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t hover:bg-muted/40 cursor-pointer"
                      onClick={() => { setCreating(false); setSelectedId(r.id); }}
                      data-testid={`fiscal-doc-row-${r.id}`}
                    >
                      <td className="p-2">{labelDocumentModel(r.document_model)}</td>
                      <td className="p-2">{labelDocumentOrigin(r.document_origin)}</td>
                      <td className="p-2">
                        {r.invoice_number ?? "—"} / {r.series ?? "—"}
                      </td>
                      <td className="p-2">{r.issue_date ?? "—"}</td>
                      <td className="p-2">
                        <Badge variant="outline">{labelNormalizedStatus(r.normalized_status ?? r.status)}</Badge>
                        {r.locked_at && (
                          <Badge className="ml-2" variant="secondary">
                            <Lock className="w-3 h-3 mr-1" /> travado
                          </Badge>
                        )}
                      </td>
                      <td className="p-2">{labelReconciliationStatus(r.reconciliation_status)}</td>
                      <td className="p-2">{currency(r.total_amount)}</td>
                      <td className="p-2 text-xs">
                        {r.receivable_id && <div>AR: {truncate(r.receivable_id, 8)}</div>}
                        {r.delivery_id && <div>Entrega: {truncate(r.delivery_id, 8)}</div>}
                        {!r.receivable_id && !r.delivery_id && "—"}
                      </td>
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
                >Anterior</Button>
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="ghost" size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reconciliação pendente</CardTitle>
          <CardDescription>
            View somente-leitura <code>v_fiscal_document_reconciliation_pending</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {reconQ.isLoading && <span className="text-muted-foreground">Carregando…</span>}
          {reconQ.isError && (
            <span className="text-destructive">
              {(reconQ.error as Error)?.message ?? "Falha ao consultar."}
            </span>
          )}
          {reconQ.data && reconQ.data.length === 0 && (
            <span className="text-muted-foreground">Nenhuma pendência.</span>
          )}
          {reconQ.data && reconQ.data.length > 0 && (
            <ul className="space-y-1">
              {reconQ.data.slice(0, 20).map((r, i) => (
                <li key={`${r.fiscal_invoice_id}-${i}`}>
                  {labelDocumentModel(r.document_model)} · {labelNormalizedStatus(r.normalized_status)} · {labelReconciliationStatus(r.reconciliation_status)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DetailSheet
        open={selectedId !== null || creating}
        onOpenChange={(o) => {
          if (!o) { setSelectedId(null); setCreating(false); }
        }}
        creating={creating}
        canWrite={canWrite}
        detail={detailQ.data ?? null}
        detailLoading={detailQ.isLoading}
        detailError={detailQ.error as Error | null}
        items={itemsQ.data ?? []}
        events={eventsQ.data ?? []}
        audit={auditQ.data ?? []}
        onSubmit={async (values, prev) => {
          if (!user) return;
          try {
            const id = await saveMut.mutateAsync({ values, prev, createdBy: user.id });
            toast({ title: "Registro salvo", description: "Alterações persistidas." });
            setSelectedId(id);
            setCreating(false);
          } catch (e) {
            if (e instanceof OptimisticFiscalConflictError) {
              toast({
                title: "Conflito de concorrência",
                description: e.message,
                variant: "destructive",
              });
            } else if (e instanceof InvoiceLockedError) {
              toast({
                title: "Registro bloqueado",
                description: e.message,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Erro ao salvar",
                description: (e as Error)?.message ?? "Falha inesperada.",
                variant: "destructive",
              });
            }
          }
        }}
        onManualEvent={async (invoiceId, eventType, notes) => {
          try {
            await eventMut.mutateAsync({
              invoiceId,
              eventType,
              notes,
              enabled: manualEventFlag,
            });
            toast({ title: "Evento registrado" });
          } catch (e) {
            if (e instanceof ManualEventRpcDisabledError) {
              toast({
                title: "Ação indisponível",
                description: e.message,
              });
            } else {
              toast({
                title: "Erro no evento",
                description: (e as Error)?.message ?? "Falha inesperada.",
                variant: "destructive",
              });
            }
          }
        }}
        manualEventEnabled={manualEventFlag}
      />

      <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Novo rascunho NF-e / NFS-e</SheetTitle>
            <SheetDescription>
              Preparação e homologação. Nenhuma nota é transmitida por esta tela.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {companyQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando configuração fiscal…</p>
            ) : !companyQ.data?.cnpj ? (
              <Alert variant="destructive">
                <AlertTitle>Configuração fiscal incompleta</AlertTitle>
                <AlertDescription>
                  Preencha o CNPJ da empresa em Configurações → Fiscal antes de criar rascunhos.
                </AlertDescription>
              </Alert>
            ) : (
              <RascunhoWizard
                invoiceId={null}
                companyCnpj={companyQ.data.cnpj}
                expectedVersion={1}
                onSaved={(id) => {
                  setWizardOpen(false);
                  setSelectedId(id);
                  toast({ title: "Rascunho salvo", description: "Você pode continuar editando pelo detalhe." });
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface DetailProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creating: boolean;
  canWrite: boolean;
  detail: import("@/lib/fiscal/documentWorkflowValidation").FiscalInvoiceRow | null;
  detailLoading: boolean;
  detailError: Error | null;
  items: import("@/lib/fiscal/documentWorkflowValidation").FiscalInvoiceItemRow[];
  events: import("@/integrations/supabase/cultivofarm.types").Database["public"]["Tables"]["fiscal_events"]["Row"][];
  audit: import("@/integrations/supabase/cultivofarm.types").Database["public"]["Tables"]["fiscal_audit_log"]["Row"][];
  onSubmit: (
    values: InvoiceFormValues,
    prev: import("@/lib/fiscal/documentWorkflowValidation").FiscalInvoiceRow | null,
  ) => Promise<void>;
  onManualEvent: (invoiceId: string, eventType: ManualEventType, notes: string) => Promise<void>;
  manualEventEnabled: boolean;
}

const DEFAULT_VALUES: InvoiceFormValues = {
  invoice_type: "OTHER",
  document_model: "OTHER",
  environment: "NOT_CONFIGURED",
  status: "DRAFT",
  normalized_status: "DRAFT",
  reconciliation_status: "NOT_APPLICABLE",
  invoice_number: "",
  series: "",
  issue_date: "",
  total_amount: "",
  company_cnpj: "",
  notes: "",
  receivable_id: "",
  delivery_id: "",
};

function DetailSheet(props: DetailProps) {
  const { detail, creating, canWrite, items, events, audit } = props;
  const editable = detail ? isEditableManualDocument(detail) : true;
  const readOnly = !canWrite || (!creating && !editable);

  const [values, setValues] = useState<InvoiceFormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [eventType, setEventType] = useState<ManualEventType>("MANUAL_UPDATED");
  const [eventNotes, setEventNotes] = useState("");

  // Hidra o formulário quando o registro selecionado muda.
  const detailId = detail?.id ?? null;
  useMemo(() => {
    if (creating) setValues(DEFAULT_VALUES);
    else if (detail) setValues(rowToFormValues(detail));
  }, [detailId, creating]); // eslint-disable-line react-hooks/exhaustive-deps

  function onField<K extends keyof InvoiceFormValues>(k: K, v: InvoiceFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = invoiceFormSchema.safeParse(values);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const iss of parsed.error.issues) map[iss.path.join(".")] = iss.message;
      setErrors(map);
      return;
    }
    setErrors({});
    await props.onSubmit(parsed.data, detail);
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {creating ? "Novo registro manual" : `Registro ${detail?.invoice_number ?? "—"}`}
          </SheetTitle>
          <SheetDescription>
            Apenas registro manual. Provedor forçado como Nenhum, ambiente
            restrito a Não configurado ou Homologação. Nenhuma emissão é
            executada.
          </SheetDescription>
        </SheetHeader>

        {props.detailLoading && <div className="py-4 text-sm text-muted-foreground">Carregando…</div>}
        {props.detailError && (
          <Alert variant="destructive" className="my-3">
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{props.detailError.message}</AlertDescription>
          </Alert>
        )}

        {readOnly && detail && (
          <Alert className="my-3" data-testid="fiscal-doc-readonly">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Somente leitura</AlertTitle>
            <AlertDescription>
              {detail.locked_at
                ? "Registro travado por processo de integração."
                : "Registro fora do domínio manual/editável (origem, provider ou status)."}
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="form" className="mt-3">
          <TabsList>
            <TabsTrigger value="form">Dados</TabsTrigger>
            <TabsTrigger value="items">Itens ({items.length})</TabsTrigger>
            <TabsTrigger value="events">Eventos ({events.length})</TabsTrigger>
            <TabsTrigger value="audit">Auditoria ({audit.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="form">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Tipo</Label>
                  <Select
                    value={values.invoice_type}
                    onValueChange={(v) => onField("invoice_type", v as InvoiceFormValues["invoice_type"])}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVOICE_TYPE_VALUES.map((v) => (
                        <SelectItem key={v} value={v}>{labelInvoiceType(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Modelo</Label>
                  <Select
                    value={values.document_model}
                    onValueChange={(v) => onField("document_model", v as InvoiceFormValues["document_model"])}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_MODEL_VALUES.map((v) => (
                        <SelectItem key={v} value={v}>{labelDocumentModel(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Ambiente</Label>
                  <Select
                    value={values.environment}
                    onValueChange={(v) => onField("environment", v as InvoiceFormValues["environment"])}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ENVIRONMENT_ALLOWED.map((v) => (
                        <SelectItem key={v} value={v}>{labelEnvironment(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Ambiente de Produção não é permitido nesta fase.</p>
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Status</Label>
                  <Select
                    value={values.status}
                    onValueChange={(v) => onField("status", v as InvoiceFormValues["status"])}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_ALLOWED.map((v) => (
                        <SelectItem key={v} value={v}>{labelStatus(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Status normalizado</Label>
                  <Select
                    value={values.normalized_status}
                    onValueChange={(v) => onField("normalized_status", v as InvoiceFormValues["normalized_status"])}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NORMALIZED_STATUS_MANUAL.map((v) => (
                        <SelectItem key={v} value={v}>{labelNormalizedStatus(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Reconciliação</Label>
                  <Select
                    value={values.reconciliation_status}
                    onValueChange={(v) => onField("reconciliation_status", v as InvoiceFormValues["reconciliation_status"])}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECONCILIATION_STATUS_VALUES.map((v) => (
                        <SelectItem key={v} value={v}>{labelReconciliationStatus(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Número</Label>
                  <Input
                    value={values.invoice_number}
                    onChange={(e) => onField("invoice_number", e.target.value)}
                    disabled={readOnly}
                  />
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Série</Label>
                  <Input
                    value={values.series}
                    onChange={(e) => onField("series", e.target.value)}
                    disabled={readOnly}
                  />
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Data de emissão</Label>
                  <Input
                    type="date"
                    value={values.issue_date}
                    onChange={(e) => onField("issue_date", e.target.value)}
                    disabled={readOnly}
                  />
                  {errors.issue_date && <p className="text-xs text-destructive">{errors.issue_date}</p>}
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Valor total</Label>
                  <Input
                    inputMode="decimal"
                    value={values.total_amount}
                    onChange={(e) => onField("total_amount", e.target.value)}
                    disabled={readOnly}
                  />
                  {errors.total_amount && <p className="text-xs text-destructive">{errors.total_amount}</p>}
                </div>
                <div className="grid min-w-0 content-start gap-1.5 col-span-2">
                  <Label>CNPJ da empresa</Label>
                  <Input
                    value={values.company_cnpj}
                    onChange={(e) => onField("company_cnpj", e.target.value)}
                    disabled={readOnly}
                  />
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Conta a receber (ID)</Label>
                  <Input
                    value={values.receivable_id}
                    onChange={(e) => onField("receivable_id", e.target.value)}
                    disabled={readOnly}
                    placeholder="UUID existente (não altera AR)"
                  />
                  {errors.receivable_id && <p className="text-xs text-destructive">{errors.receivable_id}</p>}
                </div>
                <div className="grid min-w-0 content-start gap-1.5">
                  <Label>Entrega (ID)</Label>
                  <Input
                    value={values.delivery_id}
                    onChange={(e) => onField("delivery_id", e.target.value)}
                    disabled={readOnly}
                    placeholder="UUID existente (não altera entrega)"
                  />
                  {errors.delivery_id && <p className="text-xs text-destructive">{errors.delivery_id}</p>}
                </div>
                <div className="grid min-w-0 content-start gap-1.5 col-span-2">
                  <Label>Notas internas</Label>
                  <Textarea
                    value={values.notes}
                    maxLength={2000}
                    onChange={(e) => onField("notes", e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <SheetFooter>
                <Button type="submit" disabled={readOnly} data-testid="fiscal-doc-save">
                  Salvar
                </Button>
              </SheetFooter>
            </form>
          </TabsContent>

          <TabsContent value="items">
            {items.length === 0 && <p className="text-sm text-muted-foreground">Sem itens.</p>}
            {items.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">#</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Descrição</th>
                    <th className="p-2">Qtd</th>
                    <th className="p-2">Valor un.</th>
                    <th className="p-2">Total líq.</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">{it.item_sequence}</td>
                      <td className="p-2">{labelItemKind(it.item_kind)}</td>
                      <td className="p-2">{truncate(it.description)}</td>
                      <td className="p-2">{it.quantity ?? "—"}</td>
                      <td className="p-2">{currency(it.unit_value)}</td>
                      <td className="p-2">{currency(it.net_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>

          <TabsContent value="events">
            {detail && canWrite && (
              <div className="grid min-w-0 content-start gap-1.5 rounded border p-3 mb-3">
                <Label className="text-xs">Registrar evento manual (via RPC)</Label>
                <div className="flex flex-col gap-2 mt-1">
                  <Select
                    value={eventType}
                    onValueChange={(v) => setEventType(v as ManualEventType)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MANUAL_EVENT_TYPES.map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    maxLength={2000}
                    placeholder="Notas (opcional, ≤ 2000 chars)"
                    value={eventNotes}
                    onChange={(e) => setEventNotes(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!props.manualEventEnabled}
                    onClick={() => props.onManualEvent(detail.id, eventType, eventNotes)}
                    data-testid="fiscal-doc-manual-event"
                  >
                    {props.manualEventEnabled
                      ? "Registrar evento"
                      : "Indisponível (flag fiscalDocumentManualEventRpc)"}
                  </Button>
                </div>
              </div>
            )}
            {events.length === 0 && <p className="text-sm text-muted-foreground">Sem eventos.</p>}
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
                    {ev.notes && <div className="text-sm mt-1">{truncate(ev.notes, 200)}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Request: {maskSnapshot(ev.request_snapshot)} · Response: {maskSnapshot(ev.response_snapshot)}
                      {ev.provider_event_id && (
                        <> · provider_event_id: {maskSensitiveText(ev.provider_event_id)}</>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="audit">
            {audit.length === 0 && <p className="text-sm text-muted-foreground">Sem trilha.</p>}
            {audit.length > 0 && (
              <ul className="space-y-2 text-sm">
                {audit.map((a) => (
                  <li key={a.id} className="border rounded p-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{a.action} · {a.table_name}</span>
                      <span>{new Date(a.changed_at).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      old: {maskSnapshot(a.old_values)} · new: {maskSnapshot(a.new_values)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
