import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function CompactCatalogSelect({ label, value, options, onChange }: {
  label: string; value: string; options: readonly { value: string; label: string }[]; onChange(value: string): void;
}) {
  return <div className="space-y-1 min-w-0"><Label>{label}</Label><Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label={label} className="min-h-11 w-full"><SelectValue /></SelectTrigger>
    <SelectContent className="max-h-[60dvh]">{options.map(o => <SelectItem key={o.value} value={o.value} className="min-h-11">{o.label}</SelectItem>)}</SelectContent>
  </Select></div>;
}