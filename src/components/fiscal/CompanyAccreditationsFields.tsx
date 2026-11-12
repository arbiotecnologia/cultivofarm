import { useState } from "react";
import type { Json } from "@/integrations/supabase/cultivofarm.types";
import { accreditationRecord, mergeDeclaredAccreditation } from "@/lib/fiscal/companyAccreditations";
import { UF_OPTIONS } from "@/lib/fiscal/fiscalOptions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

export default function CompanyAccreditationsFields({ records, onChange, disabled }: {
  records: Json[]; onChange: (next: Json[]) => void; disabled: boolean;
}) {
  const [uf, setUf] = useState("");
  const [declaration, setDeclaration] = useState("");
  const [error, setError] = useState("");
  return <div className="space-y-3 md:col-span-2">
    <h3 className="text-sm font-medium">Credenciamento NF-e declarado por UF</h3>
    <p className="text-xs text-muted-foreground">Declaração de aptidão informada pela empresa. Não comprova teste técnico ou autorização SEFAZ; não valida a contabilidade.</p>
    {records.length > 0 && <ul className="space-y-1 text-sm">{records.map((value, index) => {
      const record = accreditationRecord(value);
      return <li key={index}>{typeof record?.uf === "string" ? record.uf : "Registro existente"} — {record?.accredited === true ? "Aptidão declarada" : record?.accredited === false ? "Sem aptidão declarada" : "Registro preservado"}</li>;
    })}</ul>}
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="grid gap-1.5"><Label htmlFor="accreditation-uf">UF do credenciamento</Label>
        <select id="accreditation-uf" disabled={disabled} className="h-10 rounded-md border bg-background px-3" value={uf} onChange={(e) => { setUf(e.target.value); setDeclaration(""); setError(""); }}>
          <option value="">Selecionar UF</option>{UF_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5"><Label htmlFor="accreditation-declaration">Aptidão declarada</Label>
        <select id="accreditation-declaration" disabled={disabled || !uf} className="h-10 rounded-md border bg-background px-3" value={declaration} onChange={(e) => setDeclaration(e.target.value)}>
          <option value="">Não informada</option><option value="yes">Apta para homologação NF-e</option><option value="no">Não apta</option>
        </select>
      </div>
      <Button type="button" variant="outline" className="self-end" disabled={disabled || !uf || !declaration} onClick={() => {
        try { onChange(mergeDeclaredAccreditation(records, uf, declaration === "yes")); setError(""); setUf(""); setDeclaration(""); }
        catch (err) { setError(err instanceof Error ? err.message : "Não foi possível registrar."); }
      }}><Check className="mr-2 h-4 w-4" />Registrar declaração</Button>
    </div>
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
  </div>;
}