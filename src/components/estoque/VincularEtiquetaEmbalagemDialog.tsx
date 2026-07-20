import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link2 } from "lucide-react";

export function VincularEtiquetaEmbalagemDialog({
  open, onOpenChange, embalagemId, onDone,
}: { open: boolean; onOpenChange: (o: boolean) => void; embalagemId: string; onDone?: () => void; }) {
  const { toast } = useToast();
  const [emb, setEmb] = useState<any>(null);
  const [opcoes, setOpcoes] = useState<any[]>([]);
  const [etqId, setEtqId] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open || !embalagemId) return;
    setEtqId("");
    setFetching(true);
    (async () => {
      const { data: e } = await (supabase as any)
        .from("estoque_embalagens")
        .select("id, codigo_embalagem, lote_id, produto_id")
        .eq("id", embalagemId)
        .maybeSingle();
      setEmb(e);

      let q = (supabase as any)
        .from("produto_etiquetas")
        .select("id, codigo_etiqueta, status, lote_id, produto_id")
        .is("embalagem_id", null)
        .neq("status", "cancelada")
        .order("codigo_etiqueta", { ascending: false })
        .limit(200);
      if (e?.lote_id) q = q.eq("lote_id", e.lote_id);
      const { data } = await q;
      setOpcoes((data as any[]) ?? []);
      setFetching(false);
    })();
  }, [open, embalagemId]);

  const submit = async () => {
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc("rpc_vincular_etiqueta_embalagem", {
        p_embalagem_id: embalagemId, p_etiqueta_id: etqId,
      });
      if (error) throw error;
      toast({ title: "Etiqueta vinculada" });
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Vincular etiqueta existente</DialogTitle>
          <DialogDescription>
            {emb?.codigo_embalagem ? `Embalagem ${emb.codigo_embalagem}` : "Carregando..."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Etiqueta disponível (mesmo lote, não cancelada, sem embalagem)</Label>
          {fetching ? (
            <p className="text-sm text-muted-foreground">Buscando etiquetas...</p>
          ) : opcoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etiqueta disponível para este lote.</p>
          ) : (
            <Select value={etqId} onValueChange={setEtqId}>
              <SelectTrigger><SelectValue placeholder="Selecione uma etiqueta" /></SelectTrigger>
              <SelectContent>
                {opcoes.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.codigo_etiqueta} — {o.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || !etqId}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
