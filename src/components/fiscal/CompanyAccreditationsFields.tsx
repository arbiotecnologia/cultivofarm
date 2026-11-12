import { useState } from "react";
import type { Json } from "@/integrations/supabase/cultivofarm.types";
import {
  accreditationRecord, accreditedUfs, lookupAccreditation, mergeDeclaredAccreditation,
  type AccreditationDeclaration,
} from "@/lib/fiscal/companyAccreditations";
import { UF_OPTIONS } from "@/lib/fiscal/fiscalOptions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Pencil } from "lucide-react";

const LABEL: Record<AccreditationDeclaration, string> = {
  yes: "Apta para homologação NF-e",
  no: "Não apta",
  "": "Não informada",
};

/**
 * Edita uma UF por vez. Uma única UF gravada abre selecionada; com várias,
 * o usuário escolhe explicitamente qual editar. "Não informada" (chave
 * ausente) é distinta de "Não apta" (false). Registrar só altera o rascunho
 * do formulário: a gravação depende do salvamento geral.
 */
export default function CompanyAccreditationsFields({ records, savedRecords, onChange, disabled }: {
  records: Json[]; savedRecords: Json[]; onChange: (next: Json[]) => void; disabled: boolean;
}) {
  const initialUfs = accreditedUfs(records);
  const initialUf = initialUfs.length === 1 && records.length === 1 ? initialUfs[0] : "";
  const [uf, setUf] = useState(initialUf);
  const [declaration, setDeclaration] = useState<AccreditationDeclaration>(() => {
    if (!initialUf) return "";
    const found = lookupAccreditation(records, initialUf);
    return found.kind === "single" ? found.declaration : "";
  });
  const [error, setError] = useState("");
  const lookup = uf ? lookupAccreditation(records, uf) : null;
  const pending = JSON.stringify(records) !== JSON.stringify(savedRecords);

  function select(next: string) {
    setUf(next); setError("");
    const found = next ? lookupAccreditation(records, next) : null;
    setDeclaration(found?.kind === "single" ? found.declaration : "");
    if (found?.kind === "duplicate") setError("Há registros duplicados para esta UF. Revisão necessária; nenhum registro será alterado.");
  }

  const canRegister = !disabled && !!uf && lookup?.kind !== "duplicate" && !(lookup?.kind === "new" && declaration === "")
    && !(lookup?.kind === "single" && lookup.declaration === declaration && !lookup.legacyValue);

  return <div className="space-y-3 md:col-span-2" data-testid="accreditations">
    <h3 className="text-sm font-medium">Credenciamento NF-e declarado por UF</h3>
    <p className="text-xs text-muted-foreground">Declaração de aptidão informada pela empresa. Não comprova teste técnico ou autorização SEFAZ; não valida a contabilidade.</p>
    {records.length > 0 && <ul className="space-y-1 text-sm" aria-label="UFs registradas">{records.map((value, index) => {
      const record = accreditationRecord(value);
      const recUf = typeof record?.uf === "string" ? record.uf : null;
      const decl: AccreditationDeclaration = record?.accredited === true ? "yes" : record?.accredited === false ? "no" : "";
      const selected = recUf !== null && recUf === uf;
      return <li key={index} className="flex min-h-11 flex-wrap items-center gap-2" data-selected={selected || undefined}>
        <span className={selected ? "font-medium" : undefined}>{recUf ?? "Registro existente (preservado)"} — {LABEL[decl]}{selected ? " · em edição" : ""}</span>
        {recUf && !selected ? <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={disabled} onClick={() => select(recUf)} aria-label={`Editar credenciamento ${recUf}`}><Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />Editar</Button> : null}
      </li>;
    })}</ul>}
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="grid gap-1.5"><Label htmlFor="accreditation-uf">UF do credenciamento</Label>
        <select id="accreditation-uf" disabled={disabled} className="h-11 rounded-md border bg-background px-3" value={uf} onChange={(e) => select(e.target.value)}>
          <option value="">Selecionar UF</option>{UF_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}{accreditedUfs(records).includes(option.value) ? " (registrada)" : ""}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5"><Label htmlFor="accreditation-declaration">Aptidão declarada</Label>
        <select id="accreditation-declaration" disabled={disabled || !uf || lookup?.kind === "duplicate"} className="h-11 rounded-md border bg-background px-3" value={declaration} onChange={(e) => setDeclaration(e.target.value as AccreditationDeclaration)}>
          <option value="">Não informada</option><option value="yes">{LABEL.yes}</option><option value="no">{LABEL.no}</option>
        </select>
        {uf ? <p className="text-xs font-medium">UF em edição: {uf}</p> : null}
        {lookup?.kind === "new" ? <p className="text-xs text-muted-foreground">Nova UF, sem registro anterior.</p> : null}
        {lookup?.kind === "single" && lookup.legacyValue ? <p className="text-xs text-muted-foreground">Valor legado não booleano; registrar o substituirá.</p> : null}
      </div>
      <Button type="button" variant="outline" className="min-h-11 self-end" disabled={!canRegister} onClick={() => {
        try {
          onChange(mergeDeclaredAccreditation(records, uf, declaration === "yes" ? true : declaration === "no" ? false : null));
          setError("");
        } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível registrar."); }
      }}><Check className="mr-2 h-4 w-4" aria-hidden />Registrar declaração</Button>
    </div>
    {pending ? <p className="text-xs font-medium text-amber-700 dark:text-amber-400" role="status" data-testid="accreditations-pending">Alteração registrada apenas no formulário. Use “Salvar configuração” para gravar.</p> : null}
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
  </div>;
}
