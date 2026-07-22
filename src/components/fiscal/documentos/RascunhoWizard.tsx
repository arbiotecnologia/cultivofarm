/**
 * Fase Fiscal 3.16 — Wizard de rascunho NF-e/NFS-e (preparação/homologação).
 *
 * NÃO transmite nada. Apenas prepara e salva rascunhos. Todos os textos
 * estão em pt-BR. Nenhum botão de emissão/transmissão/autorização.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldOff, Trash2, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  emptyRascunho,
  rascunhoSchema,
  type RascunhoFormValues,
  type RascunhoItem,
} from "@/lib/fiscal/rascunhoWizardValidation";
import { useSaveFiscalRascunho, useValidateHomologation } from "@/hooks/useFiscalRascunho";

const STEPS = ["documento", "destinatario", "itens", "tributos", "revisao"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  documento: "Documento",
  destinatario: "Destinatário",
  itens: "Itens e Serviços",
  tributos: "Tributos e Totais",
  revisao: "Revisão",
};

export interface RascunhoWizardProps {
  invoiceId: string | null;
  initialValues?: RascunhoFormValues;
  companyCnpj: string;
  expectedVersion?: number;
  onSaved?: (id: string, version: number) => void;
  disabled?: boolean;
}

export default function RascunhoWizard({
  invoiceId,
  initialValues,
  companyCnpj,
  expectedVersion = 1,
  onSaved,
  disabled = false,
}: RascunhoWizardProps) {
  const [values, setValues] = useState<RascunhoFormValues>(initialValues ?? emptyRascunho());
  const [step, setStep] = useState<Step>("documento");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saveMut = useSaveFiscalRascunho();
  const validateMut = useValidateHomologation();

  const readonly = disabled;

  function set<K extends keyof RascunhoFormValues>(key: K, val: RascunhoFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function addItem() {
    const empty: RascunhoItem = {
      item_kind: values.invoice_type === "NFSE" ? "SERVICE" : "PRODUCT",
      description: "",
      quantity: 1,
      commercial_unit: "UN",
      unit_value: 0,
      gross_value: 0,
      discount_value: 0,
      net_value: 0,
    };
    setValues((prev) => ({ ...prev, items: [...prev.items, empty] }));
  }

  function removeItem(idx: number) {
    setValues((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  function updateItem(idx: number, patch: Partial<RascunhoItem>) {
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        merged.gross_value = Number((merged.quantity * merged.unit_value).toFixed(2));
        merged.net_value = Number(
          (merged.gross_value - (merged.discount_value ?? 0)).toFixed(2),
        );
        return merged;
      }),
    }));
  }

  function validateAll(): boolean {
    const parsed = rascunhoSchema.safeParse(values);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!flat[key]) flat[key] = issue.message;
      }
      setErrors(flat);
      return false;
    }
    setErrors({});
    return true;
  }

  async function handleSave() {
    if (!validateAll()) {
      toast({ title: "Verifique os campos", description: "Há dados inválidos no rascunho.", variant: "destructive" });
      return;
    }
    try {
      const res = await saveMut.mutateAsync({
        invoiceId,
        values,
        expectedVersion,
        companyCnpj,
      });
      toast({ title: "Rascunho salvo", description: `Versão ${res.draft_version}.` });
      onSaved?.(res.id, res.draft_version);
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Falha inesperada.",
        variant: "destructive",
      });
    }
  }

  async function handleValidateHomologation() {
    if (!invoiceId) {
      toast({ title: "Salve o rascunho antes de validar", variant: "destructive" });
      return;
    }
    try {
      const res = await validateMut.mutateAsync(invoiceId);
      if (res.status === "READY") {
        toast({ title: "Pronto para homologação", description: "Nenhuma pendência identificada." });
      } else if (res.status === "INCOMPLETE") {
        toast({
          title: "Rascunho incompleto",
          description: `Campos pendentes: ${(res.missing ?? []).join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Bloqueado",
          description: `Motivo: ${res.reason ?? "desconhecido"}.`,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Falha na validação",
        description: err instanceof Error ? err.message : "Erro inesperado.",
        variant: "destructive",
      });
    }
  }

  const totalItens = values.items.reduce((acc, it) => acc + (it.net_value ?? 0), 0);
  const totalGeral = totalItens + (values.freight ?? 0) + (values.insurance ?? 0) + (values.other_expenses ?? 0) - (values.discount_total ?? 0);

  return (
    <div className="space-y-4" data-testid="fiscal-rascunho-wizard">
      <Alert>
        <ShieldOff className="h-4 w-4" aria-hidden />
        <AlertTitle>Preparação para homologação — sem emissão</AlertTitle>
        <AlertDescription>
          Esta tela apenas prepara e salva rascunhos NF-e/NFS-e. Nenhuma nota é
          transmitida, autorizada ou consultada.
        </AlertDescription>
      </Alert>

      <Tabs value={step} onValueChange={(v) => setStep(v as Step)}>
        <TabsList className="flex flex-wrap">
          {STEPS.map((s) => (
            <TabsTrigger key={s} value={s}>{STEP_LABELS[s]}</TabsTrigger>
          ))}
        </TabsList>

        <fieldset disabled={readonly || saveMut.isPending} className="mt-4">
          <TabsContent value="documento">
            <Card>
              <CardHeader><CardTitle className="text-base">Documento</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de documento</Label>
                  <select className="h-10 border rounded-md px-3 bg-background w-full" value={values.invoice_type} onChange={(e) => set("invoice_type", e.target.value as RascunhoFormValues["invoice_type"])}>
                    <option value="NFE">NF-e</option>
                    <option value="NFSE">NFS-e</option>
                  </select>
                </div>
                <div>
                  <Label>Modelo</Label>
                  <select className="h-10 border rounded-md px-3 bg-background w-full" value={values.document_model} onChange={(e) => set("document_model", e.target.value as RascunhoFormValues["document_model"])}>
                    <option value="55">55 (NF-e)</option>
                    <option value="NFSE">NFS-e</option>
                  </select>
                </div>
                <div>
                  <Label>Ambiente</Label>
                  <select className="h-10 border rounded-md px-3 bg-background w-full" value={values.environment} onChange={(e) => set("environment", e.target.value as RascunhoFormValues["environment"])}>
                    <option value="NOT_CONFIGURED">Não configurado</option>
                    <option value="HOMOLOGATION">Homologação</option>
                  </select>
                </div>
                <div>
                  <Label>Série</Label>
                  <Input value={values.series} onChange={(e) => set("series", e.target.value)} />
                </div>
                <div>
                  <Label>Data de emissão</Label>
                  <Input type="date" value={values.issue_date} onChange={(e) => set("issue_date", e.target.value)} />
                </div>
                <div>
                  <Label>Natureza da operação</Label>
                  <Input value={values.natureza_operacao ?? ""} onChange={(e) => set("natureza_operacao", e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label>Observações</Label>
                  <Textarea value={values.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="destinatario">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Destinatário</CardTitle>
                <CardDescription>Selecione o cliente e confirme os dados fiscais.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>ID do cliente</Label>
                  <Input value={values.customer_id} onChange={(e) => set("customer_id", e.target.value)} placeholder="UUID do cliente" />
                  {errors.customer_id ? <p className="text-xs text-destructive" role="alert">{errors.customer_id}</p> : null}
                </div>
                <div>
                  <Label>CPF/CNPJ</Label>
                  <Input value={values.customer_document} onChange={(e) => set("customer_document", e.target.value.replace(/\D/g, ""))} maxLength={14} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="itens">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    {values.invoice_type === "NFSE" ? "Serviços" : "Itens"}
                  </CardTitle>
                  <CardDescription>
                    Adicione, edite ou remova. Totais são recalculados no servidor ao salvar.
                  </CardDescription>
                </div>
                <Button size="sm" variant="secondary" onClick={addItem} type="button">
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {values.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
                )}
                {values.items.map((it, idx) => (
                  <div key={idx} className="border rounded p-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                    <div className="md:col-span-2">
                      <Label>Descrição</Label>
                      <Input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                    </div>
                    <div>
                      <Label>Qtd.</Label>
                      <Input type="number" step="0.01" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label>Unidade</Label>
                      <Input value={it.commercial_unit} onChange={(e) => updateItem(idx, { commercial_unit: e.target.value })} />
                    </div>
                    <div>
                      <Label>Valor unit.</Label>
                      <Input type="number" step="0.01" value={it.unit_value} onChange={(e) => updateItem(idx, { unit_value: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label>Total líquido</Label>
                      <Input readOnly value={it.net_value} />
                    </div>
                    <div className="md:col-span-6 flex justify-end">
                      <Button variant="ghost" size="sm" type="button" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Remover
                      </Button>
                    </div>
                  </div>
                ))}
                {errors.items ? <p className="text-xs text-destructive" role="alert">{errors.items}</p> : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tributos">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tributos e Totais</CardTitle>
                <CardDescription>
                  Cálculos preparatórios sujeitos à validação contábil.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Desconto</Label>
                  <Input type="number" step="0.01" value={values.discount_total} onChange={(e) => set("discount_total", Number(e.target.value))} />
                </div>
                <div>
                  <Label>Frete</Label>
                  <Input type="number" step="0.01" value={values.freight} onChange={(e) => set("freight", Number(e.target.value))} />
                </div>
                <div>
                  <Label>Seguro</Label>
                  <Input type="number" step="0.01" value={values.insurance} onChange={(e) => set("insurance", Number(e.target.value))} />
                </div>
                <div>
                  <Label>Outras despesas</Label>
                  <Input type="number" step="0.01" value={values.other_expenses} onChange={(e) => set("other_expenses", Number(e.target.value))} />
                </div>
                <div className="md:col-span-4 text-right text-sm">
                  Total dos itens: <strong>R$ {totalItens.toFixed(2)}</strong><br/>
                  Total geral estimado: <strong>R$ {totalGeral.toFixed(2)}</strong>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revisao">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revisão</CardTitle>
                <CardDescription>Confira antes de salvar. Nada será transmitido.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    {values.invoice_type ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                    Tipo: {values.invoice_type === "NFE" ? "NF-e" : "NFS-e"} — Série {values.series}
                  </li>
                  <li className="flex items-center gap-2">
                    {values.customer_id ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                    Destinatário: {values.customer_id || "não selecionado"}
                  </li>
                  <li className="flex items-center gap-2">
                    {values.items.length > 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                    Itens: {values.items.length}
                  </li>
                </ul>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" onClick={handleSave} disabled={saveMut.isPending} data-testid="fiscal-rascunho-salvar">
                    Salvar rascunho
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleValidateHomologation} disabled={validateMut.isPending || !invoiceId} data-testid="fiscal-rascunho-validar">
                    Validar para homologação
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </fieldset>
      </Tabs>
    </div>
  );
}
