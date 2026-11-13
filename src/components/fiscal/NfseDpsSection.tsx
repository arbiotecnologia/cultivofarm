import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DPS_FORM_ERROR_LABEL, PIS_COFINS_CST, PIS_COFINS_RET_TYPES, type NfseDpsForm } from "@/lib/fiscal/serviceNfseDpsForm";

const NONE = "__none__";

/** Campos do complemento DPS (NFS-e Nacional) no editor canônico do perfil de serviço. */
export function NfseDpsSection({ value, onChange, errors }: { value: NfseDpsForm; onChange: (v: NfseDpsForm) => void; errors: string[] }) {
  const set = <K extends keyof NfseDpsForm>(k: K, v: NfseDpsForm[K]) => onChange({ ...value, [k]: v });
  const txt = (k: keyof NfseDpsForm, label: string, opts: { hint?: string; mode?: "numeric" | "decimal"; max?: number } = {}) => (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={`dps-${k}`}>{label}</Label>
      <Input id={`dps-${k}`} value={value[k] as string} inputMode={opts.mode} maxLength={opts.max} onChange={(e) => set(k, e.target.value as never)} />
      {opts.hint ? <p className="text-xs text-muted-foreground">{opts.hint}</p> : null}
    </div>
  );
  return (
    <section aria-label="Complemento NFS-e Nacional" data-testid="service-nfse-dps" className="space-y-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">NFS-e Nacional (DPS)</p>
        <p className="text-xs text-muted-foreground">Copiado para o rascunho no faturamento. Campos vazios não são enviados.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {txt("nbs_code", "Código NBS", { hint: "9 dígitos.", mode: "numeric", max: 12 })}
        {txt("service_location_ibge_code", "Local da prestação (IBGE)", { hint: "Onde o serviço é prestado; pode diferir do município de incidência.", mode: "numeric", max: 7 })}
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="dps-cst">CST PIS/COFINS</Label>
          <Select value={value.pis_cofins_cst || NONE} onValueChange={(v) => set("pis_cofins_cst", v === NONE ? "" : v)}>
            <SelectTrigger id="dps-cst"><SelectValue placeholder="Não informar" /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Não informar</SelectItem>{PIS_COFINS_CST.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="dps-ret">Retenção PIS/COFINS</Label>
          <Select value={value.pis_cofins_ret_type || NONE} onValueChange={(v) => set("pis_cofins_ret_type", v === NONE ? "" : v)}>
            <SelectTrigger id="dps-ret"><SelectValue placeholder="Não informar" /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Não informar</SelectItem>{Object.entries(PIS_COFINS_RET_TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{k} — {l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {txt("p_aliq_pis", "Alíquota PIS (%)", { mode: "decimal" })}
        {txt("p_aliq_cofins", "Alíquota COFINS (%)", { mode: "decimal" })}
        {txt("cp_rate", "Retenção CP (%)", { mode: "decimal" })}
        {txt("irrf_rate", "Retenção IRRF (%)", { mode: "decimal" })}
        {txt("csll_rate", "Retenção CSLL (%)", { mode: "decimal" })}
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="dps-tot">Total aproximado de tributos</Label>
          <Select value={value.tot_mode || NONE} onValueChange={(v) => set("tot_mode", (v === NONE ? "" : v) as NfseDpsForm["tot_mode"])}>
            <SelectTrigger id="dps-tot"><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Não definido (pendência)</SelectItem>
              <SelectItem value="IND">Não informar valor estimado</SelectItem>
              <SelectItem value="PERCENT">Percentuais federal/estadual/municipal</SelectItem>
              <SelectItem value="SN">Percentual Simples Nacional</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {value.tot_mode === "PERCENT" && <>{txt("tot_fed", "Tributos federais (%)", { mode: "decimal" })}{txt("tot_est", "Tributos estaduais (%)", { mode: "decimal" })}{txt("tot_mun", "Tributos municipais (%)", { mode: "decimal" })}</>}
        {value.tot_mode === "SN" && txt("tot_sn", "Simples Nacional (%)", { mode: "decimal" })}
      </div>
      {errors.length > 0 && <ul role="alert" className="list-disc pl-5 text-xs text-destructive">{errors.map((e) => <li key={e}>{DPS_FORM_ERROR_LABEL[e] ?? e}</li>)}</ul>}
    </section>
  );
}
