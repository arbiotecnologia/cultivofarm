import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { READ_CATALOG_FAMILIES, READ_FAMILY_LABEL, readCatalogFamily, type CatalogFamilyFilter } from "@/lib/catalogo/catalogFamilyRead";
import { CompactCatalogSelect } from "./CompactCatalogSelect";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActiveCatalogFamilies } from "@/hooks/useActiveCatalogFamilies";

export function CatalogFamilyFilter({ value, onChange }: { value: CatalogFamilyFilter; onChange: (value: CatalogFamilyFilter) => void }) {
  const mobile = useIsMobile();
  const families = useActiveCatalogFamilies();
  if (mobile) return <CompactCatalogSelect label="Família do catálogo" value={value} onChange={v => onChange(v as CatalogFamilyFilter)} options={families.options} />;
  return <ToggleGroup type="single" value={value === "todos" ? "" : value}
    onValueChange={v => onChange(v === "sem_classificacao" ? v : readCatalogFamily(v) ?? "todos")}
    aria-label="Família do catálogo" className="flex flex-wrap justify-start gap-1">
    {families.options.filter(f => f.value !== "todos" && f.value !== "sem_classificacao").map(f => <ToggleGroupItem key={f.value} value={f.value} className="h-auto min-h-11 whitespace-normal text-sm" aria-label={f.label}>
      {f.label}
    </ToggleGroupItem>)}
    <ToggleGroupItem value="sem_classificacao" className="min-h-11">Sem classificação</ToggleGroupItem>
  </ToggleGroup>;
}