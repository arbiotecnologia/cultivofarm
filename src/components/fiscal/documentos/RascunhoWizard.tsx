/**
 * Fase Fiscal 3.16 / 3.16.2-B — Wizard de rascunho NF-e/NFS-e
 * (preparação/homologação).
 *
 * NÃO transmite nada. Apenas prepara e salva rascunhos. Todos os textos
 * estão em pt-BR. Nenhum botão de emissão/transmissão/autorização.
 *
 * 3.16.2-B:
 *   - Removido o campo manual de UUID do cliente; permanece somente o
 *     ClientePicker.
 *   - Cada item carrega campos fiscais reais (NCM/CEST/CFOP/CST/CSOSN/
 *     ISS/LC116/CNAE/origem) preenchíveis manualmente ou automaticamente
 *     via ProdutoPicker/ServicoPicker (perfil fiscal cadastrado).
 *   - Persistência inclui `fiscal_profile_snapshot` e `tax_snapshot` por
 *     item (sanitizados; o servidor rejeita chaves sensíveis).
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCpfCnpj } from "@/lib/masks";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldOff, Trash2, Plus, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import GeracaoXmlNfeSecao from "@/components/fiscal/documentos/GeracaoXmlNfeSecao";
import PreflightNfeSecao from "@/components/fiscal/documentos/PreflightNfeSecao";
import TributosPorItemSecao from "@/components/fiscal/documentos/TributosPorItemSecao";

import {
  emptyRascunho,
  rascunhoSchema,
  type RascunhoFormValues,
  type RascunhoItem,
} from "@/lib/fiscal/rascunhoWizardValidation";
import { useSaveFiscalRascunho, useValidateHomologation } from "@/hooks/useFiscalRascunho";
import { useFiscalClientesLite } from "@/hooks/useFiscalClientesLite";
import { useFiscalProdutosLite, type FiscalProdutoLite } from "@/hooks/useFiscalProdutosLite";
import { useFiscalServicosLite, type FiscalServicoLite } from "@/hooks/useFiscalServicosLite";
import { useDebounce } from "@/hooks/useDebounce";
import SinefOperationsPanel from "@/components/fiscal/documentos/sinief49/SinefOperationsPanel";
import { useAuth } from "@/hooks/useAuth";
import { canUseSinief49Operations } from "@/lib/fiscal/sinief49/permissions";

const LEGACY_STEPS = ["documento", "destinatario", "itens", "tributos", "revisao"] as const;
const SINIEF_STEPS = ["documento", "destinatario", "itens", "tributos", "sinief49", "revisao"] as const;
type Step = (typeof SINIEF_STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  documento: "Documento",
  destinatario: "Destinatário",
  itens: "Itens e Serviços",
  tributos: "Tributos e Totais",
  sinief49: "Operações especiais — SINIEF 49/2025",
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
  const { role } = useAuth();
  const canUseSinief = canUseSinief49Operations(role);
  const STEPS = canUseSinief ? SINIEF_STEPS : LEGACY_STEPS;
  const [step, setStep] = useState<Step>("documento");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saveMut = useSaveFiscalRascunho();
  const validateMut = useValidateHomologation();

  // Se o usuário perder acesso ao SINIEF, retorna a uma etapa legada.
  useEffect(() => {
    if (!canUseSinief && step === "sinief49") setStep("documento");
  }, [canUseSinief, step]);

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
      ncm: "",
      cest: "",
      cfop: "",
      origin_code: "",
      icms_cst: "",
      icms_csosn: "",
      ipi_cst: "",
      pis_cst: "",
      cofins_cst: "",
      lc116_item: "",
      cnae: "",
      municipal_taxation_code: "",
      iss_withheld: false,
      fiscal_profile_snapshot: {},
      tax_snapshot: {},
      tax_input_snapshot: {},
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

  function applyProduto(idx: number, p: FiscalProdutoLite) {
    const profile = p.fiscal_profile;
    const snap = profile
      ? {
          kind: "PRODUCT" as const,
          ncm: profile.ncm,
          cest: profile.cest,
          cfop_in_state: profile.cfop_in_state,
          cfop_interstate: profile.cfop_interstate,
          origin_code: profile.origin_code,
          profile_status: profile.profile_status,
        }
      : {};
    const tax = profile
      ? {
          icms_cst: profile.icms_cst,
          icms_csosn: profile.icms_csosn,
          ipi_cst: profile.ipi_cst,
          pis_cst: profile.pis_cst,
          cofins_cst: profile.cofins_cst,
        }
      : {};
    updateItem(idx, {
      item_kind: "PRODUCT",
      description: p.nome,
      source_item_type: "produto",
      source_item_id: p.id,
      commercial_unit: profile?.commercial_unit ?? "UN",
      ncm: profile?.ncm ?? "",
      cest: profile?.cest ?? "",
      cfop: profile?.cfop_in_state ?? "",
      origin_code: profile?.origin_code ?? "",
      icms_cst: profile?.icms_cst ?? "",
      icms_csosn: profile?.icms_csosn ?? "",
      ipi_cst: profile?.ipi_cst ?? "",
      pis_cst: profile?.pis_cst ?? "",
      cofins_cst: profile?.cofins_cst ?? "",
      fiscal_profile_snapshot: snap,
      tax_snapshot: tax,
    });
  }

  function applyServico(idx: number, s: FiscalServicoLite) {
    const profile = s.fiscal_profile;
    const snap = {
      kind: "SERVICE" as const,
      lc116_item: profile.lc116_item,
      cnae: profile.cnae,
      municipal_taxation_code: profile.municipal_taxation_code,
      incidence_municipality_ibge_code: profile.incidence_municipality_ibge_code,
      profile_status: profile.profile_status,
    };
    const tax = {
      iss_rate: profile.iss_rate,
      iss_withheld_default: profile.iss_withheld_default,
      national_taxation_code: profile.national_taxation_code,
    };
    updateItem(idx, {
      item_kind: "SERVICE",
      description: s.nome,
      source_item_type: "servico",
      source_item_id: s.service_id ?? undefined,
      commercial_unit: "UN",
      lc116_item: profile.lc116_item ?? "",
      cnae: profile.cnae ?? "",
      municipal_taxation_code: profile.municipal_taxation_code ?? "",
      iss_rate: profile.iss_rate ?? undefined,
      iss_withheld: profile.iss_withheld_default,
      fiscal_profile_snapshot: snap,
      tax_snapshot: tax,
    });
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
        const list = (res.missing ?? []).map((m) => m.message).join(" · ");
        toast({
          title: "Rascunho incompleto",
          description: list || "Campos pendentes identificados pelo servidor.",
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
                    <option value="NFE">NF-e (produtos)</option>
                    <option value="NFSE">NFS-e (serviços)</option>
                  </select>
                </div>
                <div>
                  <Label>Modelo</Label>
                  <select className="h-10 border rounded-md px-3 bg-background w-full" value={values.document_model} onChange={(e) => set("document_model", e.target.value as RascunhoFormValues["document_model"])}>
                    <option value="NFE">NF-e (modelo 55)</option>
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
                <CardDescription>Busque um cliente cadastrado (nome ou CPF/CNPJ) e confirme os dados fiscais.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ClientePicker
                  currentId={values.customer_id}
                  currentDoc={values.customer_document}
                  onPick={(c) => {
                    set("customer_id", c.id);
                    set("customer_document", (c.cpf_cnpj ?? "").replace(/\D/g, ""));
                    set("customer_snapshot", { nome: c.nome, cpf_cnpj: c.cpf_cnpj });
                  }}
                  disabled={readonly}
                />
                {errors.customer_id ? (
                  <p className="text-xs text-destructive" role="alert">{errors.customer_id}</p>
                ) : null}
                <div>
                  <Label>CPF/CNPJ do destinatário</Label>
                  <Input
                    value={formatCpfCnpj(values.customer_document)}
                    readOnly
                    placeholder="Selecione um cliente"
                  />
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
                    Selecione um produto ou serviço cadastrado para preencher automaticamente o perfil fiscal.
                  </CardDescription>
                </div>
                <Button size="sm" variant="secondary" onClick={addItem} type="button">
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {values.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
                )}
                {values.items.map((it, idx) => (
                  <div key={idx} className="border rounded p-3 space-y-3">
                    {values.invoice_type === "NFE" ? (
                      <ProdutoPicker onPick={(p) => applyProduto(idx, p)} disabled={readonly} />
                    ) : (
                      <ServicoPicker onPick={(s) => applyServico(idx, s)} disabled={readonly} />
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
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
                    </div>

                    {values.invoice_type === "NFE" ? (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t">
                        <div>
                          <Label>NCM</Label>
                          <Input value={it.ncm ?? ""} onChange={(e) => updateItem(idx, { ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
                        </div>
                        <div>
                          <Label>CEST</Label>
                          <Input value={it.cest ?? ""} onChange={(e) => updateItem(idx, { cest: e.target.value.replace(/\D/g, "").slice(0, 7) })} />
                        </div>
                        <div>
                          <Label>CFOP</Label>
                          <Input value={it.cfop ?? ""} onChange={(e) => updateItem(idx, { cfop: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                        </div>
                        <div>
                          <Label>Origem</Label>
                          <Input value={it.origin_code ?? ""} onChange={(e) => updateItem(idx, { origin_code: e.target.value.slice(0, 2) })} />
                        </div>
                        <div>
                          <Label>ICMS CST</Label>
                          <Input value={it.icms_cst ?? ""} onChange={(e) => updateItem(idx, { icms_cst: e.target.value.slice(0, 4) })} />
                        </div>
                        <div>
                          <Label>ICMS CSOSN</Label>
                          <Input value={it.icms_csosn ?? ""} onChange={(e) => updateItem(idx, { icms_csosn: e.target.value.slice(0, 4) })} />
                        </div>
                        <div>
                          <Label>IPI CST</Label>
                          <Input value={it.ipi_cst ?? ""} onChange={(e) => updateItem(idx, { ipi_cst: e.target.value.slice(0, 4) })} />
                        </div>
                        <div>
                          <Label>PIS CST</Label>
                          <Input value={it.pis_cst ?? ""} onChange={(e) => updateItem(idx, { pis_cst: e.target.value.slice(0, 4) })} />
                        </div>
                        <div>
                          <Label>COFINS CST</Label>
                          <Input value={it.cofins_cst ?? ""} onChange={(e) => updateItem(idx, { cofins_cst: e.target.value.slice(0, 4) })} />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t">
                        <div>
                          <Label>Item LC 116</Label>
                          <Input value={it.lc116_item ?? ""} onChange={(e) => updateItem(idx, { lc116_item: e.target.value.slice(0, 10) })} />
                        </div>
                        <div>
                          <Label>CNAE</Label>
                          <Input value={it.cnae ?? ""} onChange={(e) => updateItem(idx, { cnae: e.target.value.replace(/\D/g, "").slice(0, 7) })} />
                        </div>
                        <div>
                          <Label>Código municipal</Label>
                          <Input value={it.municipal_taxation_code ?? ""} onChange={(e) => updateItem(idx, { municipal_taxation_code: e.target.value.slice(0, 20) })} />
                        </div>
                        <div>
                          <Label>Alíquota ISS (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={it.iss_rate ?? ""}
                            onChange={(e) => updateItem(idx, { iss_rate: e.target.value === "" ? undefined : Number(e.target.value) })}
                          />
                        </div>
                        <div className="col-span-2 md:col-span-4 flex items-center gap-2 text-sm">
                          <input
                            id={`iss-with-${idx}`}
                            type="checkbox"
                            checked={!!it.iss_withheld}
                            onChange={(e) => updateItem(idx, { iss_withheld: e.target.checked })}
                          />
                          <Label htmlFor={`iss-with-${idx}`} className="cursor-pointer">
                            ISS retido pelo tomador
                          </Label>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
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
            <div className="pt-4">
              <TributosPorItemSecao
                invoiceId={invoiceId}
                items={values.items.map((it) => ({
                  description: it.description,
                  gross_value: it.gross_value,
                  discount_value: it.discount_value,
                  tax_input_snapshot: (it.tax_input_snapshot ?? {}) as Record<
                    string,
                    { baseReductionPct: number }
                  >,
                }))}
                freight={values.freight}
                insurance={values.insurance}
                otherExpenses={values.other_expenses}
                disabled={readonly}
                onChangeItemInput={(idx, snapshot) =>
                  updateItem(idx, { tax_input_snapshot: snapshot })
                }
              />
            </div>
          </TabsContent>

          {canUseSinief ? (
            <TabsContent value="sinief49">
              <SinefOperationsPanel issuerCnpj={companyCnpj} disabled={readonly} />
            </TabsContent>
          ) : null}

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
                    Destinatário: {values.customer_document || "não selecionado"}
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
            <div className="pt-4">
              <PreflightNfeSecao invoiceId={invoiceId} />
            </div>
            <div className="pt-4">
              <GeracaoXmlNfeSecao invoiceId={invoiceId} />
            </div>

          </TabsContent>
        </fieldset>
      </Tabs>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponente: seletor de cliente
// ────────────────────────────────────────────────────────────────────────────

interface ClientePickerProps {
  currentId: string;
  currentDoc: string;
  disabled?: boolean;
  onPick: (c: { id: string; nome: string; cpf_cnpj: string | null }) => void;
}

function ClientePicker({ currentId, currentDoc, disabled, onPick }: ClientePickerProps) {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 250);
  const [open, setOpen] = useState(false);
  const listQ = useFiscalClientesLite(debounced);

  useEffect(() => {
    if (debounced.trim().length >= 2) setOpen(true);
  }, [debounced]);

  return (
    <div className="rounded-md border p-3 space-y-2" data-testid="fiscal-rascunho-cliente-picker">
      <Label>Buscar cliente</Label>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          className="pl-8"
          placeholder="Digite nome ou CPF/CNPJ"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          disabled={disabled}
        />
      </div>
      {open && debounced.trim().length >= 2 && (
        <div className="max-h-48 overflow-auto rounded border bg-background">
          {listQ.isLoading ? (
            <div className="p-2 text-xs text-muted-foreground">Buscando…</div>
          ) : (listQ.data?.items ?? []).length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">
              {listQ.data?.status === "permission_denied"
                ? "Sem permissão para consultar clientes."
                : listQ.data?.status === "error"
                ? "Falha ao consultar clientes. Tente novamente."
                : "Nenhum cliente encontrado."}
            </div>
          ) : (
            <ul className="text-sm">
              {(listQ.data?.items ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted focus:bg-muted"
                    onClick={() => {
                      onPick(c);
                      setTerm(c.nome);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{c.nome}</span>
                    {c.cpf_cnpj ? <span className="text-xs text-muted-foreground ml-2">{c.cpf_cnpj}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {currentId && (
        <p className="text-xs text-muted-foreground">
          Selecionado: <span className="font-mono">{currentId.slice(0, 8)}…</span>
          {currentDoc ? <> · CPF/CNPJ: {currentDoc}</> : null}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponente: seletor de produto (com perfil fiscal)
// ────────────────────────────────────────────────────────────────────────────

function ProdutoPicker({ onPick, disabled }: { onPick: (p: FiscalProdutoLite) => void; disabled?: boolean }) {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 250);
  const [open, setOpen] = useState(false);
  const listQ = useFiscalProdutosLite(debounced);

  useEffect(() => {
    if (debounced.trim().length >= 2) setOpen(true);
  }, [debounced]);

  return (
    <div className="rounded-md border p-2 space-y-1 bg-muted/20" data-testid="fiscal-rascunho-produto-picker">
      <Label className="text-xs">Selecionar produto (opcional) — preenche perfil fiscal</Label>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          className="pl-8"
          placeholder="Nome ou código do produto"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          disabled={disabled}
        />
      </div>
      {open && debounced.trim().length >= 2 && (
        <div className="max-h-40 overflow-auto rounded border bg-background">
          {listQ.isLoading ? (
            <div className="p-2 text-xs text-muted-foreground">Buscando…</div>
          ) : (listQ.data ?? []).length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">Nenhum produto encontrado.</div>
          ) : (
            <ul className="text-sm">
              {(listQ.data ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted"
                    onClick={() => {
                      onPick(p);
                      setTerm(p.nome);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{p.nome}</span>
                    {p.fiscal_profile?.ncm ? (
                      <span className="text-xs text-muted-foreground ml-2">NCM {p.fiscal_profile.ncm}</span>
                    ) : (
                      <span className="text-xs text-amber-600 ml-2">sem perfil fiscal</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponente: seletor de serviço (com perfil fiscal)
// ────────────────────────────────────────────────────────────────────────────

function ServicoPicker({ onPick, disabled }: { onPick: (s: FiscalServicoLite) => void; disabled?: boolean }) {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 250);
  const [open, setOpen] = useState(false);
  const listQ = useFiscalServicosLite(debounced);

  useEffect(() => {
    if (debounced.trim().length >= 2) setOpen(true);
  }, [debounced]);

  return (
    <div className="rounded-md border p-2 space-y-1 bg-muted/20" data-testid="fiscal-rascunho-servico-picker">
      <Label className="text-xs">Selecionar serviço (opcional) — preenche perfil fiscal</Label>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          className="pl-8"
          placeholder="Nome do serviço"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          disabled={disabled}
        />
      </div>
      {open && debounced.trim().length >= 2 && (
        <div className="max-h-40 overflow-auto rounded border bg-background">
          {listQ.isLoading ? (
            <div className="p-2 text-xs text-muted-foreground">Buscando…</div>
          ) : (listQ.data ?? []).length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">Nenhum serviço encontrado.</div>
          ) : (
            <ul className="text-sm">
              {(listQ.data ?? []).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted"
                    onClick={() => {
                      onPick(s);
                      setTerm(s.nome);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{s.nome}</span>
                    {s.fiscal_profile.lc116_item ? (
                      <span className="text-xs text-muted-foreground ml-2">LC116 {s.fiscal_profile.lc116_item}</span>
                    ) : (
                      <span className="text-xs text-amber-600 ml-2">sem LC 116</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
