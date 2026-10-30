import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDateDisplay } from "@/lib/date-utils";
import { DELIVERY_OPERATION_BLOCK, requireDeliveryOperationContract } from "@/lib/entregas/operationalContainment";

interface EntregaOpt {
  id: string;
  data_saida?: string | null;
  status: string;
  separacao_status?: string | null;
  clientes?: { nome: string } | null;
  ordens_servico?: { fazendas?: { nome: string } | null } | null;
}

export function ReservarEmbalagemEntregaDialog({
  open, onOpenChange, embalagemId, onDone,
}: { open: boolean; onOpenChange: (o: boolean) => void; embalagemId: string; onDone?: () => void; }) {
  const { toast } = useToast();
  const [entregaId, setEntregaId] = useState("");
  const [entregas, setEntregas] = useState<EntregaOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setFetching(true);
      const { data } = await (supabase as any)
        .from("entregas")
        .select("id, data_saida, status, separacao_status, clientes(nome), ordens_servico(fazendas(nome))")
        .neq("status", "cancelada")
        .neq("status", "entregue")
        .order("data_saida", { ascending: true })
        .limit(200);
      setEntregas((data as any) ?? []);
      setFetching(false);
    })();
  }, [open]);

  const submit = async () => {
    setLoading(true);
    try {
      requireDeliveryOperationContract();
      const { error } = await (supabase as any).rpc("rpc_reservar_embalagem_entrega", {
        p_embalagem_id: embalagemId, p_entrega_id: entregaId, p_entrega_item_id: null,
      });
      if (error) throw error;
      toast({ title: "Reservado" });
      onDone?.();
      onOpenChange(false);
      setEntregaId("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reservar embalagem para entrega</DialogTitle></DialogHeader>
        <p role="alert" className="text-sm text-destructive">{DELIVERY_OPERATION_BLOCK}</p>
        <div className="space-y-2">
          <Label>Entrega</Label>
          <Select value={entregaId} onValueChange={setEntregaId}>
            <SelectTrigger>
              <SelectValue placeholder={fetching ? "Carregando..." : "Selecione uma entrega"} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {entregas.map((e) => {
                const cliente = e.clientes?.nome ?? "—";
                const fazenda = e.ordens_servico?.fazendas?.nome ?? "—";
                const data = e.data_saida ? formatDateDisplay(e.data_saida) : "s/data";
                const num = `Entrega ${e.id.slice(0, 8)}`;
                return (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="font-mono mr-2">{num}</span>
                    {cliente} · {fazenda} · {data} · {e.status}
                    {e.separacao_status ? ` · sep:${e.separacao_status}` : ""}
                  </SelectItem>
                );
              })}
              {!entregas.length && !fetching && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma entrega disponível.</div>
              )}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || !entregaId}>Reservar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
