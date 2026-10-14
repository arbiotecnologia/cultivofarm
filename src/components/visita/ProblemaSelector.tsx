import { TENANT_CAN_EDIT_GLOBAL_CATALOG, GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";
import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import React, { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface CatalogoProblema {
  id: string;
  nome: string;
  categoria: string;
  nome_cientifico?: string | null;
}

interface ProblemaSelectorProps {
  value: string;
  onSelect: (problema: CatalogoProblema) => void;
  className?: string;
  placeholder?: string;
}

const CATEGORIA_LABELS: Record<string, string> = {
  insetos_praga: "Pragas",
  doencas_fungicas: "Doenças fúngicas",
  doencas_bacterianas: "Doenças bacterianas",
  nematoides: "Nematoides",
  plantas_daninhas: "Plantas daninhas",
  desequilibrio_biologico_solo: "Solo",
  baixa_vitalidade: "Nutricional",
  fitotoxidade: "Falha operacional",
  outro: "Outros",
};

export function ProblemaSelector({ value, onSelect, className, placeholder = "Selecione o problema..." }: ProblemaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newCategoria, setNewCategoria] = useState("outro");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: problemas, isLoading } = useQuery({
    queryKey: ["catalogo-problemas-ativo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("catalogo_problemas")
        .select("id, nome, categoria, nome_cientifico")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { nome: string; categoria: string }) => {
      assertGlobalCatalogWriteBlocked();
      const { data, error } = await (supabase as any)
        .from("catalogo_problemas")
        .insert([{ 
          nome: payload.nome, 
          categoria: payload.categoria, 
          criado_por: user?.id 
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["catalogo-problemas-ativo"] });
      toast.success("Problema cadastrado com sucesso!");
      onSelect(data as CatalogoProblema);
      setDialogOpen(false);
      setNewNome("");
    },
    onError: (error: any) => {
      toast.error("Erro ao cadastrar: " + (error.message || "Tente novamente"));
    },
  });

  const handleCreateNew = () => {
    if (!TENANT_CAN_EDIT_GLOBAL_CATALOG) { toast.error(GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE); return; }
    if (!newNome.trim()) {
      toast.error("Informe o nome do problema");
      return;
    }
    createMutation.mutate({ nome: newNome, categoria: newCategoria });
  };

  const groupedProblemas = React.useMemo(() => {
    if (!problemas) return {};
    return problemas.reduce((acc, p) => {
      if (!acc[p.categoria]) acc[p.categoria] = [];
      acc[p.categoria].push(p);
      return acc;
    }, {} as Record<string, CatalogoProblema[]>);
  }, [problemas]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between font-normal", className)}
          >
            {value || placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-32px)] sm:w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar problema..." />
            <CommandList className="max-h-[300px] sm:max-h-[400px] overflow-y-auto">
              <CommandEmpty>Nenhum problema encontrado.</CommandEmpty>
              {Object.entries(groupedProblemas).map(([cat, list]) => (
                <CommandGroup key={cat} heading={CATEGORIA_LABELS[cat] || cat}>
                  {(list as any[]).map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.nome}
                      onSelect={() => {
                        onSelect(p);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === p.nome ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{p.nome}</span>
                        {p.nome_cientifico && (
                          <span className="text-[10px] text-muted-foreground italic">
                            {p.nome_cientifico}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {TENANT_CAN_EDIT_GLOBAL_CATALOG && (<>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setDialogOpen(true);
                    setOpen(false);
                  }}
                  className="text-primary font-medium"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar novo problema...
                </CommandItem>
              </CommandGroup>
              </>)}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo problema no catálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do problema</Label>
              <Input 
                value={newNome} 
                onChange={(e) => setNewNome(e.target.value)} 
                placeholder="Ex: Lagarta tal..."
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={newCategoria} onValueChange={setNewCategoria}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIA_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateNew} disabled={createMutation.isPending}>
              Salvar e selecionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
