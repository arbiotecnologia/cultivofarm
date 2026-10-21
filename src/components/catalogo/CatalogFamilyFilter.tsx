import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { READ_CATALOG_FAMILIES, READ_FAMILY_LABEL, readCatalogFamily, type CatalogFamilyFilter } from "@/lib/catalogo/catalogFamilyRead";

export function CatalogFamilyFilter({ value, onChange }: { value: CatalogFamilyFilter; onChange: (value: CatalogFamilyFilter) => void }) {
  return <ToggleGroup type="single" value={value === "todos" ? "" : value}
    onValueChange={v => onChange(readCatalogFamily(v) ?? "todos")}
    aria-label="Família do catálogo" className="flex flex-wrap justify-start gap-1">
    {READ_CATALOG_FAMILIES.map(f => <ToggleGroupItem key={f} value={f} className="h-auto min-h-9 whitespace-normal text-sm" aria-label={READ_FAMILY_LABEL[f]}>
      {READ_FAMILY_LABEL[f]}
    </ToggleGroupItem>)}
  </ToggleGroup>;
}