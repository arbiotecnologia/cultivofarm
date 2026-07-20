import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { rowClickProps, stopRowClick } from "@/lib/rowClick";

export default function FormasPagamento() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", active: true });

  const { data = [] } = useQuery({
    queryKey: ["fin-pm"],
    queryFn: async () => { const { data, error } = await supabase.from("payment_methods").select("*").order("name"); if (error) throw error; return data; },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editing) { const { error } = await supabase.from("payment_methods").update(form).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("payment_methods").insert(form); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["fin-pm"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("rpc_desativar_payment_method" as any, { p_id: id, p_reason: "Desativado pelo usuário" }); if (error) throw error; },
    onSuccess: () => { toast.success("Forma desativada (histórico preservado)"); qc.invalidateQueries({ queryKey: ["fin-pm"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Formas de Pagamento</h1>
        <Button onClick={() => { setEditing(null); setForm({ name: "", active: true }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nova</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.map((r: any) => (
                  <TableRow key={r.id} {...rowClickProps(() => { setEditing(r); setForm({ name: r.name, active: r.active }); setOpen(true); })}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                    <TableCell className="text-right" onClick={stopRowClick}>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setForm({ name: r.name, active: r.active }); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} forma de pagamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="flex items-center justify-between"><Label>Ativa</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
