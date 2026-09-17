/**
 * Fase Fiscal 3.19 (+3.19.4) — Card IBS/CBS por item (produto ou serviço).
 *
 * Organizado em seções recolhíveis (details/summary) com rótulos humanos em
 * pt-BR e o código técnico como ajuda contextual. Sem casts inseguros; os
 * campos NFS-e Nacional são tipados via `additional_fields` (rejeita
 * `vAjusteBC` sem o toggle `gIBSCBSAjuste`). Não preenche alíquotas nem
 * códigos automaticamente — a Fase Fiscal 3.19 é explícita: sem catálogo
 * parcial apresentado como completo.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFiscalRtcItem } from "@/hooks/useFiscalRtc";
import {
  getNfseField,
  setNfseField,
  type IbsCbsItemConfiguration,
} from "@/lib/fiscal/rtcConfiguration";

export interface IbsCbsItemCardProps {
  /**
   * "service_profile" (Bloco 5) usa a identidade estável do perfil
   * (service_fiscal_profiles.id) e habilita a edição quando o perfil
   * existe somente por source_reference (service_id nulo). "service"
   * permanece por retrocompatibilidade dos consumidores atuais.
   */
  kind: "product" | "service" | "service_profile";
  itemId: string | null;
  canEdit: boolean;
}

type SectionProps = { title: string; children: React.ReactNode; testId: string; defaultOpen?: boolean };
function Section({ title, children, testId, defaultOpen }: SectionProps) {
  return (
    <details className="rounded-md border p-3" data-testid={testId} open={defaultOpen}>
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

export function IbsCbsItemCard({ kind, itemId, canEdit }: IbsCbsItemCardProps) {
  const rtc = useFiscalRtcItem(kind, itemId);
  const [form, setForm] = useState<IbsCbsItemConfiguration>({ schema_version: 1 });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (rtc.data && !rtc.error) setForm(rtc.data);
  }, [rtc.data, rtc.error]);

  const disabled = !canEdit || rtc.loading || rtc.saving || !itemId;
  const isService = kind === "service" || kind === "service_profile";
  const title = isService
    ? "IBS/CBS do serviço — NFS-e Nacional"
    : "IBS/CBS do produto";

  async function onSave() {
    setFlash(null);
    const res = await rtc.save(form);
    if (res.ok) setFlash("IBS/CBS salvo com sucesso.");
  }

  const reducao = form.reducao ?? {};
  const diferimento = form.diferimento ?? {};
  const monofasia = form.monofasia ?? {};

  const ajusteAtivo = getNfseField(form, "gIBSCBSAjuste") === true;

  // Mensagem contextual (pt-BR) — Bloco 5: enquanto o perfil carrega,
  // evita "Selecione um item" que confunde quando o perfil já existe.
  const emptyStateMessage = !itemId
    ? (rtc.loading
        ? "Carregando o perfil fiscal…"
        : kind === "service_profile"
          ? "Perfil fiscal indisponível para edição de IBS/CBS."
          : "Selecione um item para editar.")
    : null;

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {emptyStateMessage ? (
          <p className="text-sm text-muted-foreground" data-testid="ibs-cbs-empty">
            {emptyStateMessage}
          </p>
        ) : null}
        {rtc.error ? (
          <Alert variant="destructive" data-testid="ibs-cbs-error">
            <AlertDescription>{rtc.error}</AlertDescription>
          </Alert>
        ) : null}
        {flash ? (
          <Alert data-testid="ibs-cbs-success"><AlertDescription>{flash}</AlertDescription></Alert>
        ) : null}

        {/* Códigos e alíquotas */}
        <Section title="Códigos e alíquotas" testId="ibs-cbs-section-codes" defaultOpen>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="cst_ibs_cbs">CST IBS/CBS <span className="text-xs text-muted-foreground">(cstIBSCBS)</span></Label>
              <Input id="cst_ibs_cbs" maxLength={6} value={form.cst_ibs_cbs ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, cst_ibs_cbs: e.target.value || undefined }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="c_class_trib">Classificação tributária <span className="text-xs text-muted-foreground">(cClassTrib)</span></Label>
              <Input id="c_class_trib" maxLength={10} value={form.c_class_trib ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, c_class_trib: e.target.value || undefined }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="c_ind_op">Indicador de operação <span className="text-xs text-muted-foreground">(cIndOp)</span></Label>
              <Input id="c_ind_op" maxLength={4} value={form.c_ind_op ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, c_ind_op: e.target.value || undefined }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="aliquota_cbs">Alíquota CBS (%)</Label>
              <Input id="aliquota_cbs" type="number" step="0.01" min={0} max={100}
                value={form.aliquota_cbs ?? ""}
                onChange={(e) => setForm((s) => ({
                  ...s, aliquota_cbs: e.target.value ? Number(e.target.value) : undefined,
                }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="aliquota_ibs_uf">Alíquota IBS UF (%)</Label>
              <Input id="aliquota_ibs_uf" type="number" step="0.01" min={0} max={100}
                value={form.aliquota_ibs_uf ?? ""}
                onChange={(e) => setForm((s) => ({
                  ...s, aliquota_ibs_uf: e.target.value ? Number(e.target.value) : undefined,
                }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="aliquota_ibs_municipio">Alíquota IBS Município (%)</Label>
              <Input id="aliquota_ibs_municipio" type="number" step="0.01" min={0} max={100}
                value={form.aliquota_ibs_municipio ?? ""}
                onChange={(e) => setForm((s) => ({
                  ...s, aliquota_ibs_municipio: e.target.value ? Number(e.target.value) : undefined,
                }))}
                disabled={disabled} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Alíquotas não são preenchidas automaticamente. Preencha somente após confirmação normativa.
          </p>
        </Section>

        {/* Fonte normativa */}
        <Section title="Fonte normativa e revisão" testId="ibs-cbs-section-source">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="source_document">Documento normativo</Label>
              <Input id="source_document" maxLength={120}
                placeholder="Ex.: NT NF-e 2025.002"
                value={form.source_document ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, source_document: e.target.value || undefined }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="source_version">Versão</Label>
              <Input id="source_version" maxLength={60}
                placeholder="Ex.: v1.60"
                value={form.source_version ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, source_version: e.target.value || undefined }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="effective_from">Vigência inicial</Label>
              <Input id="effective_from" type="date"
                value={(form.effective_from ?? "").slice(0, 10)}
                onChange={(e) => setForm((s) => ({ ...s, effective_from: e.target.value || undefined }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="last_reviewed_at">Última revisão</Label>
              <Input id="last_reviewed_at" type="date"
                value={(form.last_reviewed_at ?? "").slice(0, 10)}
                onChange={(e) => setForm((s) => ({ ...s, last_reviewed_at: e.target.value || undefined }))}
                disabled={disabled} />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label htmlFor="review_status">Status da revisão contábil</Label>
              <Select
                value={form.accounting_review_status ?? "PENDING"}
                onValueChange={(v) => setForm((s) => ({
                  ...s, accounting_review_status: v as IbsCbsItemConfiguration["accounting_review_status"],
                }))}
                disabled={disabled}
              >
                <SelectTrigger id="review_status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="REVIEWED">Revisado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="accounting_notes">Observações</Label>
            <Textarea id="accounting_notes" rows={3} maxLength={2000}
              value={form.accounting_notes ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, accounting_notes: e.target.value || undefined }))}
              disabled={disabled} />
          </div>
        </Section>

        {/* Crédito presumido */}
        <Section title="Crédito presumido" testId="ibs-cbs-section-credit">
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="c_credito_presumido">Código do crédito presumido <span className="text-xs text-muted-foreground">(cCreditoPresumido)</span></Label>
            <Input id="c_credito_presumido" maxLength={10}
              value={form.c_credito_presumido ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, c_credito_presumido: e.target.value || undefined }))}
              disabled={disabled} />
          </div>
        </Section>

        {/* Redução da base */}
        <Section title="Redução da base de cálculo" testId="ibs-cbs-section-reducao">
          <div className="flex items-center gap-2">
            <Switch id="reducao_applies" checked={reducao.applies === true}
              onCheckedChange={(v) => setForm((s) => ({
                ...s, reducao: v ? { ...(s.reducao ?? {}), applies: true } : undefined,
              }))}
              disabled={disabled} />
            <Label htmlFor="reducao_applies">Aplica redução</Label>
          </div>
          {reducao.applies ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="reducao_pct">Percentual de redução da base (%)</Label>
                <Input id="reducao_pct" type="number" step="0.01" min={0} max={100}
                  value={reducao.percent_reduction_base ?? ""}
                  onChange={(e) => setForm((s) => ({
                    ...s, reducao: { ...(s.reducao ?? { applies: true }),
                      percent_reduction_base: e.target.value ? Number(e.target.value) : undefined },
                  }))}
                  disabled={disabled} />
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="reducao_reason">Motivo</Label>
                <Input id="reducao_reason" maxLength={500}
                  value={reducao.reason ?? ""}
                  onChange={(e) => setForm((s) => ({
                    ...s, reducao: { ...(s.reducao ?? { applies: true }),
                      reason: e.target.value || undefined },
                  }))}
                  disabled={disabled} />
              </div>
              <div className="grid min-w-0 content-start gap-1.5 md:col-span-2">
                <Label htmlFor="reducao_basis">Fundamento legal</Label>
                <Input id="reducao_basis" maxLength={500}
                  value={reducao.legal_basis ?? ""}
                  onChange={(e) => setForm((s) => ({
                    ...s, reducao: { ...(s.reducao ?? { applies: true }),
                      legal_basis: e.target.value || undefined },
                  }))}
                  disabled={disabled} />
              </div>
            </div>
          ) : null}
        </Section>

        {/* Diferimento / Suspensão */}
        <Section title="Diferimento ou suspensão" testId="ibs-cbs-section-diferimento">
          <div className="flex items-center gap-2">
            <Switch id="dif_applies" checked={diferimento.applies === true}
              onCheckedChange={(v) => setForm((s) => ({
                ...s, diferimento: v ? { ...(s.diferimento ?? {}), applies: true } : undefined,
              }))}
              disabled={disabled} />
            <Label htmlFor="dif_applies">Aplica</Label>
          </div>
          {diferimento.applies ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="dif_kind">Tipo</Label>
                <Select
                  value={diferimento.kind ?? ""}
                  onValueChange={(v) => setForm((s) => ({
                    ...s, diferimento: { ...(s.diferimento ?? { applies: true }),
                      kind: (v || undefined) as "DIFERIMENTO" | "SUSPENSAO" | undefined },
                  }))}
                  disabled={disabled}
                >
                  <SelectTrigger id="dif_kind"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIFERIMENTO">Diferimento</SelectItem>
                    <SelectItem value="SUSPENSAO">Suspensão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="dif_basis">Fundamento legal</Label>
                <Input id="dif_basis" maxLength={500}
                  value={diferimento.legal_basis ?? ""}
                  onChange={(e) => setForm((s) => ({
                    ...s, diferimento: { ...(s.diferimento ?? { applies: true }),
                      legal_basis: e.target.value || undefined },
                  }))}
                  disabled={disabled} />
              </div>
            </div>
          ) : null}
        </Section>

        {/* Monofasia */}
        <Section title="Monofasia" testId="ibs-cbs-section-monofasia">
          <div className="flex items-center gap-2">
            <Switch id="mono_applies" checked={monofasia.applies === true}
              onCheckedChange={(v) => setForm((s) => ({
                ...s, monofasia: v ? { ...(s.monofasia ?? {}), applies: true } : undefined,
              }))}
              disabled={disabled} />
            <Label htmlFor="mono_applies">Aplica</Label>
          </div>
          {monofasia.applies ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="mono_stage">Etapa</Label>
                <Select
                  value={monofasia.stage ?? ""}
                  onValueChange={(v) => setForm((s) => ({
                    ...s, monofasia: { ...(s.monofasia ?? { applies: true }),
                      stage: (v || undefined) as "FABRICANTE" | "IMPORTADOR" | "REVENDA" | undefined },
                  }))}
                  disabled={disabled}
                >
                  <SelectTrigger id="mono_stage"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FABRICANTE">Fabricante</SelectItem>
                    <SelectItem value="IMPORTADOR">Importador</SelectItem>
                    <SelectItem value="REVENDA">Revenda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="mono_basis">Fundamento legal</Label>
                <Input id="mono_basis" maxLength={500}
                  value={monofasia.legal_basis ?? ""}
                  onChange={(e) => setForm((s) => ({
                    ...s, monofasia: { ...(s.monofasia ?? { applies: true }),
                      legal_basis: e.target.value || undefined },
                  }))}
                  disabled={disabled} />
              </div>
            </div>
          ) : null}
        </Section>

        {/* NFS-e Nacional (apenas serviço) */}
        {isService ? (
          <Section title="NFS-e Nacional (IBS/CBS)" testId="ibs-cbs-section-nfse">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="finNFSe">Finalidade da NFS-e <span className="text-xs text-muted-foreground">(finNFSe)</span></Label>
                <Input id="finNFSe" maxLength={30}
                  value={getNfseField(form, "finNFSe") ?? ""}
                  onChange={(e) => setForm((s) => setNfseField(s, "finNFSe", e.target.value || undefined))}
                  disabled={disabled} />
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="tpNFSeDebito">Tipo de débito <span className="text-xs text-muted-foreground">(tpNFSeDebito)</span></Label>
                <Input id="tpNFSeDebito" maxLength={30}
                  value={getNfseField(form, "tpNFSeDebito") ?? ""}
                  onChange={(e) => setForm((s) => setNfseField(s, "tpNFSeDebito", e.target.value || undefined))}
                  disabled={disabled} />
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="tpNFSeCredito">Tipo de crédito <span className="text-xs text-muted-foreground">(tpNFSeCredito)</span></Label>
                <Input id="tpNFSeCredito" maxLength={30}
                  value={getNfseField(form, "tpNFSeCredito") ?? ""}
                  onChange={(e) => setForm((s) => setNfseField(s, "tpNFSeCredito", e.target.value || undefined))}
                  disabled={disabled} />
              </div>
            </div>
            <div className="flex items-center gap-2 border-t pt-3">
              <Switch id="gIBSCBSAjuste" checked={ajusteAtivo}
                onCheckedChange={(v) => setForm((s) => setNfseField(s, "gIBSCBSAjuste", v))}
                disabled={disabled} />
              <Label htmlFor="gIBSCBSAjuste">
                Grupo de ajuste IBS/CBS <span className="text-xs text-muted-foreground">(gIBSCBSAjuste)</span>
              </Label>
            </div>
            {ajusteAtivo ? (
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor="vAjusteBC">Valor de ajuste da base <span className="text-xs text-muted-foreground">(vAjusteBC — R$)</span></Label>
                <Input id="vAjusteBC" type="number" step="0.01" min={0}
                  value={getNfseField(form, "vAjusteBC") ?? ""}
                  onChange={(e) => setForm((s) => setNfseField(
                    s, "vAjusteBC", e.target.value === "" ? undefined : Number(e.target.value),
                  ))}
                  disabled={disabled} />
                <p className="text-xs text-muted-foreground mt-1">
                  Exige valor numérico maior ou igual a zero.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Desative o grupo de ajuste para omitir o campo Valor de ajuste da base.
              </p>
            )}
          </Section>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline"
            onClick={() => { setFlash(null); void rtc.reload(); }}
            disabled={rtc.loading || rtc.saving}
            data-testid="ibs-cbs-reload"
          >
            Recarregar
          </Button>
          <Button type="button" disabled={disabled} onClick={onSave} data-testid="ibs-cbs-save">
            {rtc.saving ? "Salvando…" : "Salvar IBS/CBS"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default IbsCbsItemCard;
