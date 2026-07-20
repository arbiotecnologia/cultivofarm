import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TIPOS = [
  "entrega_parcial","produto_recusado","volume_divergente","recebedor_ausente",
  "endereco_incorreto","produto_avariado","atraso","observacao","ressalva_recebimento","outro",
];
const GRAV = ["baixa", "media", "alta", "critica"];

export function EntregaOcorrenciasPanel({ entregaId, canAdd = true }: { entregaId: string; canAdd?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tipo: "observacao", descricao: "", gravidade: "baixa" });

  const { data: items } = useQuery({
    queryKey: ["entrega-ocorrencias", entregaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("entrega_ocorrencias" as any)
        .select("*")
        .eq("entrega_id", entregaId)
        .order("registrado_em", { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.descricao.trim()) throw new Error("Descrição obrigatória");
      const { error } = await supabase.rpc("rpc_registrar_ocorrencia_entrega" as any, {
        p_entrega_id: entregaId,
        p_payload: form,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Ocorrência registrada" });
      setOpen(false);
      setForm({ tipo: "observacao", descricao: "", gravidade: "baixa" });
      qc.invalidateQueries({ queryKey: ["entrega-ocorrencias", entregaId] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Ocorrências</div>
        {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> Nova
          </Button>
        )}
      </div>
      {!items?.length && <div className="text-xs text-muted-foreground">Nenhuma ocorrência registrada.</div>}
      <ul className="space-y-2">
        {items?.map((o) => (
          <li key={o.id} className="text-xs border-l-2 pl-2" style={{ borderColor: o.gravidade === "critica" ? "#ef4444" : o.gravidade === "alta" ? "#f97316" : "#cbd5e1" }}>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{o.tipo}</Badge>
              <Badge variant="secondary" className="text-[10px]">{o.gravidade}</Badge>
              <span className="text-muted-foreground">{new Date(o.registrado_em).toLocaleString("pt-BR")}</span>
            </div>
            <p className="mt-1">{o.descricao}</p>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar ocorrência</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gravidade</Label>
              <Select value={form.gravidade} onValueChange={(v) => setForm({ ...form, gravidade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GRAV.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição *</Label>
              <Textarea rows={3} value={form.descricao} maxLength={1000} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
