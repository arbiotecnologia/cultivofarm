import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import FiscalCatalogCombobox from "@/components/fiscal/FiscalCatalogCombobox";
import { useFiscalCatalogResolve } from "@/hooks/useFiscalCatalog";

interface Props {
  primary: string | null;
  secondary: string[];
  onPrimaryChange: (code: string) => void;
  onSecondaryChange: (codes: string[]) => void;
}

export default function CompanyCnaeFields({ primary, secondary, onPrimaryChange, onSecondaryChange }: Props) {
  const resolution = useFiscalCatalogResolve("CNAE", [...(primary ? [primary] : []), ...secondary]);
  const entries = resolution.data ?? [];
  const missing = (code: string) => resolution.isSuccess && !entries.some((entry) => entry.code === code && entry.is_active);
  return (
    <div className="min-w-0 space-y-4 md:col-span-2">
      <div className="grid min-w-0 content-start gap-1.5">
        <Label htmlFor="primary_cnae">CNAE principal</Label>
        <FiscalCatalogCombobox id="primary_cnae" catalogType="CNAE" value={primary}
          onChange={(code) => onPrimaryChange(code ?? "")} multiline externalResolution resolvedEntries={entries}
          placeholder="Selecionar CNAE…" searchPlaceholder="Buscar por código ou atividade" />
        {primary && missing(primary) && <p className="text-xs text-muted-foreground">Código gravado fora do catálogo vigente. Revise antes de emitir.</p>}
      </div>
      <div className="grid min-w-0 content-start gap-1.5">
        <Label id="secondary-cnaes-label">CNAEs secundários (opcional)</Label>
        {secondary.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-input" aria-labelledby="secondary-cnaes-label">
            {secondary.map((code) => {
              const entry = entries.find((item) => item.code === code);
              return (
                <li key={code} className="flex min-w-0 items-start gap-3 px-3 py-3">
                  <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3">
                    <span className="text-sm font-medium tabular-nums">{code}</span>
                    <div className="min-w-0 text-sm break-words">
                      {entry?.description ?? (resolution.isPending ? "Carregando descrição…" : resolution.isError ? "Descrição indisponível." : "Código gravado fora do catálogo vigente.")}
                      {entry && missing(code) && <p className="mt-1 text-xs text-muted-foreground">Código fora do catálogo vigente.</p>}
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Remover CNAE ${code}`} title={`Remover CNAE ${code}`} onClick={() => onSecondaryChange(secondary.filter((item) => item !== code))}>
                    <X aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nenhum CNAE secundário informado.</p>}
        <FiscalCatalogCombobox id="additional_cnaes" catalogType="CNAE" value={null} addAction multiline
          placeholder="Adicionar CNAE secundário" searchPlaceholder="Buscar por código ou atividade"
          disabled={secondary.length >= 50}
          onChange={(code) => { if (code && code !== primary && !secondary.includes(code)) onSecondaryChange([...secondary, code]); }} />
      </div>
      {resolution.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        Não foi possível carregar as descrições. Os códigos foram preservados.
        <Button type="button" variant="outline" size="sm" onClick={() => void resolution.refetch()}>Tentar novamente</Button>
      </div>}
    </div>
  );
}