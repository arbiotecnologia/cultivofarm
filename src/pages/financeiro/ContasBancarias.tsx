import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/financial/format";

export default function ContasBancarias() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const empty = { name: "", bank_name: "", agency: "", account_number: "", pix_key: "", opening_balance: 0, active: true };
  const [form, setForm] = useState<any>(empty);

  const { data = [] } = useQuery({
    queryKey: ["fin-ba"],
    queryFn: async () => { const { data, error } = await supabase.from("bank_accounts").select("*").order("name"); if (error) throw error; return data; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, opening_balance: Number(form.opening_balance) || 0 };
      if (editing) { const { error } = await supabase.from("bank_accounts").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("bank_accounts").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Salvo"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["fin-ba"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc("rpc_desativar_bank_account" as any, { p_id: id, p_reason: "Desativado pelo usuário" }); if (error) throw error; },
    onSuccess: () => { toast.success("Conta desativada (histórico preservado)"); qc.invalidateQueries({ queryKey: ["fin-ba"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contas Bancárias</h1>
        <Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nova conta</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Banco</TableHead><TableHead>Ag./Conta</TableHead><TableHead>Saldo inicial</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {data.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.bank_name || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{[r.agency, r.account_number].filter(Boolean).join(" / ") || "—"}</TableCell>
                    <TableCell>{brl(r.opening_balance)}</TableCell>
                    <TableCell>{r.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setForm({ ...empty, ...r }); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma conta bancária</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} conta bancária</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Banco</Label><Input value={form.bank_name || ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
            <div><Label>Agência</Label><Input value={form.agency || ""} onChange={(e) => setForm({ ...form, agency: e.target.value })} /></div>
            <div><Label>Conta</Label><Input value={form.account_number || ""} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div>
            <div><Label>Chave PIX</Label><Input value={form.pix_key || ""} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} /></div>
            <div><Label>Saldo inicial</Label><MoneyInput value={form.opening_balance} onValueChange={(v) => setForm({ ...form, opening_balance: v ?? 0 })} /></div>
            <div className="flex items-center justify-between sm:col-span-2"><Label>Ativa</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
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
