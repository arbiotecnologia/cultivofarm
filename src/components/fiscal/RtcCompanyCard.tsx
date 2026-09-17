/**
 * Fase Fiscal 3.19 (+3.19.4) — Card "Reforma Tributária 2026 (IBS/CBS)".
 * Interface auditável: enums, datas (effective_from, last_reviewed_at),
 * fonte normativa, notas e status de revisão. Sem credenciais e sem
 * toggles de produção. Salva via RPC narrow com concorrência otimista.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFiscalRtcCompany } from "@/hooks/useFiscalRtc";
import type { RtcCompanyConfiguration } from "@/lib/fiscal/rtcConfiguration";

export interface RtcCompanyCardProps {
  canEdit: boolean;
}

export function RtcCompanyCard({ canEdit }: RtcCompanyCardProps) {
  const rtc = useFiscalRtcCompany();
  const [form, setForm] = useState<RtcCompanyConfiguration>({
    schema_version: 1, rtc_environment: "NOT_CONFIGURED",
  });
  const [flash, setFlash] = useState<string | null>(null);

  // Preserva formulário em erro; só sincroniza quando não há edição pendente.
  useEffect(() => {
    if (rtc.data && !rtc.error) setForm(rtc.data);
  }, [rtc.data, rtc.error]);

  const disabled = !canEdit || rtc.loading || rtc.saving;

  async function onSave() {
    setFlash(null);
    const res = await rtc.save(form);
    if (res.ok) setFlash("Configuração RTC salva com sucesso.");
  }

  function onReload() {
    setFlash(null);
    void rtc.reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reforma Tributária 2026 — IBS e CBS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rtc.loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {rtc.error ? (
          <Alert variant="destructive" data-testid="rtc-company-error">
            <AlertDescription>{rtc.error}</AlertDescription>
          </Alert>
        ) : null}
        {flash ? (
          <Alert data-testid="rtc-company-success"><AlertDescription>{flash}</AlertDescription></Alert>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="rtc_environment">Ambiente RTC</Label>
            <Select
              value={form.rtc_environment ?? "NOT_CONFIGURED"}
              onValueChange={(v) => setForm((s) => ({
                ...s, rtc_environment: v as RtcCompanyConfiguration["rtc_environment"],
              }))}
              disabled={disabled}
            >
              <SelectTrigger id="rtc_environment"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NOT_CONFIGURED">Não configurado</SelectItem>
                <SelectItem value="HOMOLOGATION">Homologação</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Produção não é oferecida nesta fase.</p>
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="rtc_transition_year">Ano de transição</Label>
            <Input
              id="rtc_transition_year"
              type="number" min={2026} max={2033}
              value={form.transition_year ?? ""}
              onChange={(e) => setForm((s) => ({
                ...s, transition_year: e.target.value ? Number(e.target.value) : undefined,
              }))}
              disabled={disabled}
            />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="rtc_source_document">Documento normativo</Label>
            <Input
              id="rtc_source_document" maxLength={120}
              placeholder="Ex.: NT NF-e 2025.002"
              value={form.source_document ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, source_document: e.target.value || undefined }))}
              disabled={disabled}
            />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="rtc_source_version">Versão do documento</Label>
            <Input
              id="rtc_source_version" maxLength={60}
              placeholder="Ex.: v1.60"
              value={form.source_version ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, source_version: e.target.value || undefined }))}
              disabled={disabled}
            />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="rtc_effective_from">Vigência inicial</Label>
            <Input
              id="rtc_effective_from" type="date"
              value={(form.effective_from ?? "").slice(0, 10)}
              onChange={(e) => setForm((s) => ({
                ...s, effective_from: e.target.value || undefined,
              }))}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Data em que a configuração passa a valer (AAAA-MM-DD).
            </p>
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="rtc_last_reviewed_at">Última revisão</Label>
            <Input
              id="rtc_last_reviewed_at" type="date"
              value={(form.last_reviewed_at ?? "").slice(0, 10)}
              onChange={(e) => setForm((s) => ({
                ...s, last_reviewed_at: e.target.value || undefined,
              }))}
              disabled={disabled}
            />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="rtc_review_status">Status da revisão contábil</Label>
            <Select
              value={form.accounting_review_status ?? "PENDING"}
              onValueChange={(v) => setForm((s) => ({
                ...s,
                accounting_review_status: v as RtcCompanyConfiguration["accounting_review_status"],
              }))}
              disabled={disabled}
            >
              <SelectTrigger id="rtc_review_status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pendente</SelectItem>
                <SelectItem value="REVIEWED">Revisado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="rtc_notes">Notas contábeis</Label>
          <Textarea
            id="rtc_notes" maxLength={4000} rows={4}
            value={form.accounting_review_notes ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, accounting_review_notes: e.target.value || undefined }))}
            disabled={disabled}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button" variant="outline"
            onClick={onReload}
            disabled={rtc.loading || rtc.saving}
            data-testid="rtc-company-reload"
          >
            Recarregar
          </Button>
          <Button
            type="button"
            disabled={disabled}
            onClick={onSave}
            data-testid="rtc-company-save"
          >
            {rtc.saving ? "Salvando…" : "Salvar RTC 2026"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default RtcCompanyCard;
