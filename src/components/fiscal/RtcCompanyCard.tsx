/**
 * Fase Fiscal 3.19.2 — Card "Reforma Tributária 2026 (IBS/CBS)".
 * Interface mínima e auditável: campos textuais/enums de RTC, sem
 * credenciais, sem toggles de produção. Salva via RPC.
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

  useEffect(() => {
    if (rtc.data) setForm(rtc.data);
  }, [rtc.data]);

  const disabled = !canEdit || rtc.loading || rtc.saving;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reforma Tributária 2026 — IBS e CBS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rtc.loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {rtc.error ? (
          <Alert variant="destructive"><AlertDescription>{rtc.error}</AlertDescription></Alert>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
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
          <div>
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
          <div>
            <Label htmlFor="rtc_source_document">Documento normativo</Label>
            <Input
              id="rtc_source_document" maxLength={120}
              placeholder="Ex.: NT NF-e 2025.002"
              value={form.source_document ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, source_document: e.target.value || undefined }))}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="rtc_source_version">Versão do documento</Label>
            <Input
              id="rtc_source_version" maxLength={60}
              placeholder="Ex.: v1.60"
              value={form.source_version ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, source_version: e.target.value || undefined }))}
              disabled={disabled}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="rtc_notes">Notas contábeis</Label>
          <Textarea
            id="rtc_notes" maxLength={4000} rows={4}
            value={form.accounting_review_notes ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, accounting_review_notes: e.target.value || undefined }))}
            disabled={disabled}
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => rtc.save(form)}
          >
            {rtc.saving ? "Salvando…" : "Salvar RTC 2026"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default RtcCompanyCard;
