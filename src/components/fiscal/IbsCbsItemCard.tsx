/**
 * Fase Fiscal 3.19.2 — Card IBS/CBS por item (produto ou serviço).
 * Serviço inclui campos NFS-e Nacional: cIndOp, finNFSe, tpNFSeDebito, tpNFSeCredito.
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

export function IbsCbsItemCard({ kind, itemId, canEdit }: IbsCbsItemCardProps) {
  const rtc = useFiscalRtcItem(kind, itemId);
  const [form, setForm] = useState<IbsCbsItemConfiguration>({ schema_version: 1 });

  useEffect(() => { if (rtc.data) setForm(rtc.data); }, [rtc.data]);

  const disabled = !canEdit || rtc.loading || rtc.saving || !itemId;
  const title = kind === "service"
    ? "IBS/CBS do serviço — NFS-e Nacional"
    : "IBS/CBS do produto";

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!itemId ? <p className="text-sm text-muted-foreground">Selecione um item para editar.</p> : null}
        {rtc.error ? (
          <Alert variant="destructive"><AlertDescription>{rtc.error}</AlertDescription></Alert>
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
            <div>
              <Label htmlFor="finNFSe">finNFSe</Label>
              <Input id="finNFSe" maxLength={4}
                value={(form.additional_fields as any)?.finNFSe ?? ""}
                onChange={(e) => setForm((s) => ({
                  ...s,
                  additional_fields: {
                    ...(s.additional_fields ?? {}),
                    finNFSe: e.target.value || undefined,
                  },
                }))}
                disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="tpNFSeDebito">tpNFSeDebito</Label>
              <Input id="tpNFSeDebito" maxLength={4}
                value={(form.additional_fields as any)?.tpNFSeDebito ?? ""}
                onChange={(e) => setForm((s) => ({
                  ...s,
                  additional_fields: {
                    ...(s.additional_fields ?? {}),
                    tpNFSeDebito: e.target.value || undefined,
                  },
                }))}
                disabled={disabled} />
            </div>
            <div>
              <Label htmlFor="tpNFSeCredito">tpNFSeCredito</Label>
              <Input id="tpNFSeCredito" maxLength={4}
                value={(form.additional_fields as any)?.tpNFSeCredito ?? ""}
                onChange={(e) => setForm((s) => ({
                  ...s,
                  additional_fields: {
                    ...(s.additional_fields ?? {}),
                    tpNFSeCredito: e.target.value || undefined,
                  },
                }))}
                disabled={disabled} />
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" disabled={disabled} onClick={() => rtc.save(form)}>
            {rtc.saving ? "Salvando…" : "Salvar IBS/CBS"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default IbsCbsItemCard;
