/**
 * Fase H11-A — Combobox reutilizável de catálogo fiscal oficial.
 *
 * Substitui digitação livre de códigos fiscais por seleção pesquisável
 * sobre o catálogo ACTIVE publicado no servidor. Nunca infere, nunca
 * calcula e nunca sobrescreve silenciosamente um valor já gravado:
 * códigos legados (fora do catálogo vigente) continuam sendo exibidos.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, AlertTriangle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  useFiscalCatalogSearch,
  useFiscalCatalogResolve,
  type FiscalCatalogEntry,
  type FiscalCatalogType,
} from "@/hooks/useFiscalCatalog";

export interface FiscalCatalogComboboxProps {
  catalogType: FiscalCatalogType;
  value: string | null;
  onChange: (code: string | null) => void;
  onSelectEntry?: (entry: FiscalCatalogEntry | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  parentCode?: string | null;
  disabled?: boolean;
  /** Mantém e exibe um valor gravado que não existe no catálogo vigente. */
  allowLegacyValue?: boolean;
  /** Códigos sugeridos (ex.: 5101 para venda interna) exibidos no topo. */
  preferredCodes?: string[];
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
  multiline?: boolean;
  addAction?: boolean;
  resolvedEntries?: import("@/hooks/useFiscalCatalog").FiscalCatalogResolvedEntry[];
  externalResolution?: boolean;
}

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function FiscalCatalogCombobox({
  catalogType,
  value,
  onChange,
  onSelectEntry,
  placeholder = "Selecionar…",
  searchPlaceholder = "Buscar por código ou descrição…",
  parentCode = null,
  disabled = false,
  allowLegacyValue = true,
  preferredCodes,
  id,
  className,
  multiline = false,
  addAction = false,
  resolvedEntries,
  externalResolution = false,
  ...aria
}: FiscalCatalogComboboxProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term);

  const search = useFiscalCatalogSearch({
    catalogType,
    query: debounced,
    parentCode,
    preferredCodes,
    enabled: open && !disabled,
  });

  const resolved = useFiscalCatalogResolve(catalogType, value ? [value] : [], !disabled && !externalResolution);
  const current = (resolvedEntries ?? resolved.data)?.find((e) => e.code === value) ?? null;
  const isLegacy = Boolean(value) && resolved.isSuccess && !current;

  const entries = useMemo(() => search.data ?? [], [search.data]);

  const label = value
    ? current
      ? `${current.code} — ${current.description}`
      : value
    : placeholder;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={aria["aria-invalid"]}
            aria-describedby={aria["aria-describedby"]}
            disabled={disabled}
            className={cn("w-full min-w-0 justify-between font-normal", multiline && "h-auto min-h-10 whitespace-normal py-3", addAction && "w-auto justify-center")}
            data-testid={`fiscal-catalog-${catalogType.toLowerCase()}`}
          >
            {addAction && <Plus className="h-4 w-4 shrink-0" aria-hidden />}
            <span className={cn(multiline ? "min-w-0 break-words text-left" : "min-w-0 truncate text-left", !value && !addAction && "text-muted-foreground")}>{label}</span>
            {!addAction && <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(32rem,90vw)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={term} onValueChange={setTerm} placeholder={searchPlaceholder} />
            <CommandList>
              {search.isFetching && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando…
                </div>
              )}
              {!search.isFetching && search.isError && (
                <div className="px-3 py-4 text-sm text-destructive" role="alert">
                  {(search.error as Error)?.message ?? "Não foi possível consultar o catálogo fiscal agora."}
                </div>
              )}
              {!search.isFetching && !search.isError && entries.length === 0 && (
                <CommandEmpty>Nenhum código encontrado no catálogo vigente.</CommandEmpty>
              )}
              {!search.isFetching && !search.isError && entries.length > 0 && (
                <CommandGroup>
                  {entries.map((entry) => (
                    <CommandItem
                      key={entry.code}
                      value={entry.code}
                      onSelect={() => {
                        onChange(entry.code);
                        onSelectEntry?.(entry);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("mr-2 h-4 w-4", value === entry.code ? "opacity-100" : "opacity-0")}
                        aria-hidden
                      />
                      <span className="font-mono text-xs mr-2">{entry.code}</span>
                      <span className={cn(multiline ? "min-w-0 whitespace-normal break-words" : "truncate")}>{entry.description}</span>
                      {entry.is_preferred && (
                        <span className="ml-auto text-[10px] uppercase text-muted-foreground">sugerido</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {isLegacy && allowLegacyValue && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-600" data-testid="fiscal-catalog-legacy">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Código gravado fora do catálogo vigente. Revise antes de emitir.
        </p>
      )}
    </div>
  );
}
