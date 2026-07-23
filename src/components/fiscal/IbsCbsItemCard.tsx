/**
 * Fase Fiscal 3.19.3 — Card IBS/CBS por item (produto ou serviço).
 * Serviço: seção NFS-e Nacional (cIndOp já em codeString; finNFSe,
 * tpNFSeDebito, tpNFSeCredito e gIBSCBSAjuste/vAjusteBC em
 * `additional_fields`). Sem casts inseguros, com concorrência otimista.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFiscalRtcItem } from "@/hooks/useFiscalRtc";
import type { IbsCbsItemConfiguration } from "@/lib/fiscal/rtcConfiguration";

export interface IbsCbsItemCardProps {
  kind: "product" | "service";
  itemId: string | null;
  canEdit: boolean;
}

/** Chaves NFS-e tratadas no passthrough `additional_fields`. */
const NFSE_KEYS = ["finNFSe", "tpNFSeDebito", "tpNFSeCredito", "gIBSCBSAjuste", "vAjusteBC"] as const;
type NfseKey = (typeof NFSE_KEYS)[number];

function getExtra(cfg: IbsCbsItemConfiguration, key: NfseKey): string {
  const extra = cfg.additional_fields;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const v = (extra as Record<string, unknown>)[key];
    return typeof v === "string" ? v : "";
  }
  return "";
}

function setExtra(
  cfg: IbsCbsItemConfiguration,
  key: NfseKey,
  value: string,
): IbsCbsItemConfiguration {
  const prev =
    cfg.additional_fields && typeof cfg.additional_fields === "object" && !Array.isArray(cfg.additional_fields)
      ? { ...(cfg.additional_fields as Record<string, unknown>) }
      : {};
  if (value === "") delete prev[key];
  else prev[key] = value;
  return { ...cfg, additional_fields: Object.keys(prev).length ? prev : undefined };
}

export function IbsCbsItemCard({ kind, itemId, canEdit }: IbsCbsItemCardProps) {
  const rtc = useFiscalRtcItem(kind, itemId);
  const [form, setForm] = useState<IbsCbsItemConfiguration>({ schema_version: 1 });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { if (rtc.data) setForm(rtc.data); }, [rtc.data]);

  const disabled = !canEdit || rtc.loading || rtc.saving || !itemId;
  const title = kind === "service"
    ? "IBS/CBS do serviço — NFS-e Nacional"
    : "IBS/CBS do produto";

  async function onSave() {
    setFlash(null);
    const res = await rtc.save(form);
    if (res.ok) setFlash("Salvo com sucesso.");
  }

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!itemId ? <p className="text-sm text-muted-foreground">Selecione um item para editar.</p> : null}
        {rtc.error ? (
          <Alert variant="destructive"><AlertDescription>{rtc.error}</AlertDescription></Alert>
        ) : null}
        {flash ? (
          <Alert><AlertDescription>{flash}</AlertDescription></Alert>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="cst_ibs_cbs">CST IBS/CBS</Label>
            <Input id="cst_ibs_cbs" maxLength={6} value={form.cst_ibs_cbs ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, cst_ibs_cbs: e.target.value || undefined }))}
              disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="c_class_trib">cClassTrib</Label>
            <Input id="c_class_trib" maxLength={10} value={form.c_class_trib ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, c_class_trib: e.target.value || undefined }))}
              disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="c_ind_op">cIndOp</Label>
            <Input id="c_ind_op" maxLength={4} value={form.c_ind_op ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, c_ind_op: e.target.value || undefined }))}
              disabled={disabled} />
          </div>

          <div>
            <Label htmlFor="aliquota_cbs">Alíquota CBS (%)</Label>
            <Input id="aliquota_cbs" type="number" step="0.01" min={0} max={100}
              value={form.aliquota_cbs ?? ""}
              onChange={(e) => setForm((s) => ({
                ...s, aliquota_cbs: e.target.value ? Number(e.target.value) : undefined,
              }))}
              disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="aliquota_ibs_uf">Alíquota IBS UF (%)</Label>
            <Input id="aliquota_ibs_uf" type="number" step="0.01" min={0} max={100}
              value={form.aliquota_ibs_uf ?? ""}
              onChange={(e) => setForm((s) => ({
                ...s, aliquota_ibs_uf: e.target.value ? Number(e.target.value) : undefined,
              }))}
              disabled={disabled} />
          </div>
          <div>
            <Label htmlFor="aliquota_ibs_municipio">Alíquota IBS Município (%)</Label>
            <Input id="aliquota_ibs_municipio" type="number" step="0.01" min={0} max={100}
              value={form.aliquota_ibs_municipio ?? ""}
              onChange={(e) => setForm((s) => ({
                ...s, aliquota_ibs_municipio: e.target.value ? Number(e.target.value) : undefined,
              }))}
              disabled={disabled} />
          </div>
        </div>

        {kind === "service" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t pt-3">
            {NFSE_KEYS.map((key) => (
              <div key={key}>
                <Label htmlFor={key}>{key}</Label>
                <Input id={key} maxLength={20}
                  value={getExtra(form, key)}
                  onChange={(e) => setForm((s) => setExtra(s, key, e.target.value))}
                  disabled={disabled} />
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => rtc.reload()} disabled={rtc.loading}>
            Recarregar
          </Button>
          <Button type="button" disabled={disabled} onClick={onSave}>
            {rtc.saving ? "Salvando…" : "Salvar IBS/CBS"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default IbsCbsItemCard;
