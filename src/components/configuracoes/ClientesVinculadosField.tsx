import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClienteOption {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
}

export interface ClienteVinculo {
  cliente_id: string;
  principal: boolean;
}

interface Props {
  clientes: ClienteOption[];
  value: ClienteVinculo[];
  onChange: (v: ClienteVinculo[]) => void;
  required?: boolean;
  label?: string;
  helperText?: string;
}

export function ClientesVinculadosField({ clientes, value, onChange, required, label = "Clientes vinculados", helperText }: Props) {
  const [open, setOpen] = useState(false);
  const selectedIds = useMemo(() => new Set(value.map(v => v.cliente_id)), [value]);
  const byId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);

  const toggle = (cid: string) => {
    if (selectedIds.has(cid)) {
      const next = value.filter(v => v.cliente_id !== cid);
      // garantir principal
      if (next.length > 0 && !next.some(v => v.principal)) next[0].principal = true;
      onChange(next);
    } else {
      const next = [...value, { cliente_id: cid, principal: value.length === 0 }];
      onChange(next);
    }
  };

  const setPrincipal = (cid: string) => {
    onChange(value.map(v => ({ ...v, principal: v.cliente_id === cid })));
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
            {value.length === 0
              ? <span className="text-muted-foreground">Selecione um ou mais clientes...</span>
              : <span>{value.length} cliente{value.length > 1 ? "s" : ""} selecionado{value.length > 1 ? "s" : ""}</span>}
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar por nome ou CPF/CNPJ..." />
            <CommandList>
              <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
              <CommandGroup>
                {clientes.map(c => {
                  const sel = selectedIds.has(c.id);
                  return (
                    <CommandItem
                      key={c.id}
                      value={`${c.nome} ${c.cpf_cnpj ?? ""}`}
                      onSelect={() => toggle(c.id)}
                    >
                      <Check className={cn("mr-2 h-4 w-4", sel ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span>{c.nome}</span>
                        {c.cpf_cnpj && <span className="text-xs text-muted-foreground">{c.cpf_cnpj}</span>}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map(v => {
            const c = byId.get(v.cliente_id);
            return (
              <Badge key={v.cliente_id} variant={v.principal ? "default" : "outline"} className="gap-1 pl-2 pr-1 py-1">
                {v.principal && <Star className="h-3 w-3 fill-current" />}
                <span className="text-xs">{c?.nome ?? v.cliente_id.slice(0, 8)}</span>
                {!v.principal && (
                  <button
                    type="button"
                    onClick={() => setPrincipal(v.cliente_id)}
                    className="ml-1 text-[10px] hover:underline"
                    title="Definir como principal"
                  >
                    tornar principal
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggle(v.cliente_id)}
                  className="ml-1 hover:bg-foreground/10 rounded"
                  title="Remover"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
