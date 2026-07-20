import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";

export function EntregaChecklistPanel({ entregaId, canEdit = true }: { entregaId: string; canEdit?: boolean }) {
  const qc = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["entrega-checklist", entregaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("entrega_checklist" as any)
        .select("*")
        .eq("entrega_id", entregaId)
        .order("created_at");
      return (data as any[]) || [];
    },
  });

  const toggle = useMutation({
    mutationFn: async (it: any) => {
      const { error } = await supabase.rpc("rpc_atualizar_checklist_entrega" as any, {
        p_checklist_id: it.id,
        p_concluido: !it.concluido,
        p_observacao: null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entrega-checklist", entregaId] }),
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="text-sm font-medium">Checklist de entrega</div>
      {!items?.length && <div className="text-xs text-muted-foreground">Gere o formulário para criar o checklist.</div>}
      <ul className="space-y-1.5">
        {items?.map((it) => (
          <li key={it.id} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={it.concluido}
              disabled={!canEdit}
              onCheckedChange={() => toggle.mutate(it)}
              className="mt-0.5"
            />
            <span className={it.concluido ? "line-through text-muted-foreground" : ""}>
              {it.item}
              {it.obrigatorio && <span className="text-destructive ml-1">*</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
