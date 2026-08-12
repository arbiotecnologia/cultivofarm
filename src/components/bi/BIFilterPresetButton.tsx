import { Button } from "@/components/ui/button";
import { Filter, Star, X } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BIFilterPresetButtonProps {
  currentFilters: any;
  onSelect: (filters: any) => void;
  section?: string;
}

export function BIFilterPresetButton({ currentFilters, onSelect, section = "geral" }: BIFilterPresetButtonProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const { data: presets = [] } = useQuery({
    queryKey: ["bi-filter-presets", section],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("bi_user_preferences")
          .select("*")
          .eq("user_id", user?.id)
          .eq("secao", section);
        
        if (error) return [];
        return data || [];
      } catch (e) {
        return [];
      }
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await (supabase as any).from("bi_user_preferences").insert({
        user_id: user?.id,
        nome: nome as any,
        filtros: currentFilters as any,
        secao: section
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bi-filter-presets", section] });
      toast.success("Filtro favorito salvo com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao salvar filtro favorito. Verifique se o módulo de preferências está ativo.");
    }
  });

  const handleSave = () => {
    const nome = prompt("Dê um nome para este filtro favorito:");
    if (nome) saveMutation.mutate(nome);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1.5">
          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
          Filtros Favoritos
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase font-black tracking-tight">Meus Filtros</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {presets.length === 0 ? (
          <div className="p-4 text-center text-[10px] text-muted-foreground italic">
            Nenhum filtro favorito salvo.
          </div>
        ) : (
          presets.map((p: any) => (
            <DropdownMenuItem key={p.id} onClick={() => onSelect(p.filtros)} className="text-xs font-medium">
              {p.nome}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSave} className="text-xs font-bold text-primary">
          + Salvar Filtros Atuais
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
