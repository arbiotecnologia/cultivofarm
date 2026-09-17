import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SINIEF_NAT_OP } from "@/lib/fiscal/sinief49/constants";
import { normalizeNatureOperation, uniqueNatureOperations, usePublishedFiscalOperationNatures } from "@/hooks/useFiscalOperationNatures";

const COMMON_NATURES = [
  "Venda de produção do estabelecimento",
  "Venda de mercadoria adquirida ou recebida de terceiros",
  "Remessa para demonstração",
  "Remessa para conserto ou reparo",
  "Devolução de compra",
  "Transferência de mercadoria",
] as const;

interface NatureOperationComboboxProps {
  id?: string;
  value: string | null;
  customOptions?: string[];
  onChange: (value: string | null) => void;
  onCustomOptionsChange?: (values: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  allowManage?: boolean;
}

export default function NatureOperationCombobox({
  id,
  value,
  customOptions = [],
  onChange,
  onCustomOptionsChange,
  disabled = false,
  placeholder = "Selecionar natureza…",
  allowManage = true,
}: NatureOperationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const policies = usePublishedFiscalOperationNatures(open && !disabled);

  const options = useMemo(() => uniqueNatureOperations([
    ...customOptions,
    ...(policies.data ?? []),
    ...COMMON_NATURES,
    ...Object.values(SINIEF_NAT_OP),
    value ?? "",
  ]), [customOptions, policies.data, value]);

  const customKeys = useMemo(
    () => new Set(customOptions.map((item) => normalizeNatureOperation(item).toLocaleLowerCase("pt-BR"))),
    [customOptions],
  );

  function startAdd() {
    setEditing(null);
    setDraft("");
    setError("");
    setOpen(false);
    setDialogOpen(true);
  }

  function startEdit(option: string) {
    setEditing(option);
    setDraft(option);
    setError("");
    setOpen(false);
    setDialogOpen(true);
  }

  function saveCustom() {
    const normalized = normalizeNatureOperation(draft);
    if (!normalized) {
      setError("Informe a natureza da operação.");
      return;
    }
    const duplicate = customOptions.some((item) =>
      item !== editing && normalizeNatureOperation(item).toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"),
    );
    if (duplicate) {
      setError("Esta natureza personalizada já foi cadastrada.");
      return;
    }
    const next = editing
      ? customOptions.map((item) => item === editing ? normalized : item)
      : [...customOptions, normalized];
    onCustomOptionsChange?.(uniqueNatureOperations(next));
    if (!editing || value === editing) onChange(normalized);
    setDialogOpen(false);
  }

  function removeCustom(option: string) {
    onCustomOptionsChange?.(customOptions.filter((item) => item !== option));
    if (value === option) onChange(null);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
            className="h-auto min-h-10 w-full min-w-0 justify-between whitespace-normal py-2 font-normal">
            <span className={cn("min-w-0 break-words text-left", !value && "text-muted-foreground")}>{value || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(36rem,90vw)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar natureza da operação…" />
            <CommandList>
              {policies.isLoading ? <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div> : null}
              {policies.isError ? <p className="px-3 py-2 text-xs text-destructive" role="alert">Não foi possível carregar as opções publicadas. As opções usuais e personalizadas continuam disponíveis.</p> : null}
              <CommandEmpty>Nenhuma natureza encontrada.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const custom = customKeys.has(option.toLocaleLowerCase("pt-BR"));
                  return (
                    <CommandItem key={option} value={option} onSelect={() => { onChange(option); setOpen(false); }} className="gap-2">
                      <Check className={cn("h-4 w-4 shrink-0", value === option ? "opacity-100" : "opacity-0")} aria-hidden />
                      <span className="min-w-0 flex-1 whitespace-normal break-words">{option}</span>
                      {custom && allowManage ? (
                        <span className="flex shrink-0 gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Editar ${option}`} onClick={(event) => { event.stopPropagation(); startEdit(option); }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Excluir ${option}`} onClick={(event) => { event.stopPropagation(); removeCustom(option); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {allowManage && onCustomOptionsChange ? (
                <div className="border-t p-1">
                  <Button type="button" variant="ghost" className="w-full justify-start" onClick={startAdd}><Plus className="mr-2 h-4 w-4" /> Adicionar natureza personalizada</Button>
                </div>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar natureza personalizada" : "Adicionar natureza personalizada"}</DialogTitle>
            <DialogDescription>Use uma descrição objetiva. O texto não define CFOP nem tributação automaticamente.</DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="custom-operation-nature">Natureza da operação</Label>
            <Input id="custom-operation-nature" value={draft} maxLength={200} autoFocus onChange={(event) => { setDraft(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "custom-operation-nature-error" : undefined} />
            {error ? <p id="custom-operation-nature-error" className="text-xs text-destructive" role="alert">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={saveCustom}>Salvar e selecionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}