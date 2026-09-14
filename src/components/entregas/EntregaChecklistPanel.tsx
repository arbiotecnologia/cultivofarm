import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const MSG_ERRO_ACAO = "Não foi possível atualizar o checklist. Tente novamente.";

interface ChecklistItem {
  id: string;
  item: string;
  concluido: boolean;
  obrigatorio: boolean;
}

export function EntregaChecklistPanel({ entregaId, canEdit = true }: { entregaId: string; canEdit?: boolean }) {
  const qc = useQueryClient();
  // Trava síncrona: impede segundo clique antes do refetch concluir.
  const emAndamentoRef = useRef(false);

  const { data: items, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["entrega-checklist", entregaId],
    enabled: !!entregaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entrega_checklist" as any)
        .select("id, item, concluido, obrigatorio, created_at")
        .eq("entrega_id", entregaId)
        .order("created_at");
      if (error) throw error;
      return ((data as any[]) || []) as ChecklistItem[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, concluido }: { id: string; concluido: boolean }) => {
      const { error } = await supabase.rpc("rpc_atualizar_checklist_entrega" as any, {
        p_checklist_id: id,
        p_concluido: concluido,
        p_observacao: null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["entrega-checklist", entregaId] });
    },
    onError: () => toast({ title: "Erro", description: MSG_ERRO_ACAO, variant: "destructive" }),
    onSettled: () => {
      emAndamentoRef.current = false;
    },
  });

  const bloqueado = !canEdit || toggle.isPending || isFetching;

  const alternar = (item: ChecklistItem, valor: boolean) => {
    if (!canEdit) return;
    if (emAndamentoRef.current) return;
    if (typeof valor !== "boolean") return;
    if (valor === item.concluido) return;
    emAndamentoRef.current = true;
    toggle.mutate({ id: item.id, concluido: valor });
  };

  return (
    <section className="rounded-md border p-3 space-y-2" aria-labelledby={`checklist-titulo-${entregaId}`}>
      <div id={`checklist-titulo-${entregaId}`} className="text-sm font-medium">
        Checklist de entrega
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground" data-testid="checklist-carregando">
          Carregando checklist…
        </p>
      )}

      {isError && (
        <div className="space-y-2" data-testid="checklist-erro">
          <p className="text-xs text-destructive">Não foi possível carregar o checklist desta entrega.</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!isLoading && !isError && !items?.length && (
        <p className="text-xs text-muted-foreground" data-testid="checklist-vazio">
          Gere o formulário para criar o checklist.
        </p>
      )}

      {!isLoading && !isError && !!items?.length && (
        <ul className="space-y-1.5">
          {items.map((it) => {
            const inputId = `checklist-${it.id}`;
            return (
              <li key={it.id} className="flex items-start gap-2 text-sm">
                <Checkbox
                  id={inputId}
                  checked={!!it.concluido}
                  disabled={bloqueado}
                  onCheckedChange={(valor) => alternar(it, valor === true)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor={inputId}
                  className={`font-normal leading-snug ${it.concluido ? "line-through text-muted-foreground" : ""}`}
                >
                  {it.item}
                  {it.obrigatorio && (
                    <span className="text-destructive ml-1" aria-label="item obrigatório">
                      *
                    </span>
                  )}
                </Label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
