import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Categorias() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", type: "RECEITA", parent_id: "", active: true, dre_group: "" });

  const { data = [], isLoading } = useQuery({
    queryKey: ["fin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, parent_id: form.parent_id || null };
      if (editing) {
        const { error } = await supabase.from("financial_categories").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financial_categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Categoria atualizada" : "Categoria criada");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["fin-categories"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("rpc_desativar_financial_category" as any, { p_id: id, p_reason: "Desativado pelo usuário" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria desativada (histórico preservado)");
      qc.invalidateQueries({ queryKey: ["fin-categories"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", type: "RECEITA", parent_id: "", active: true, dre_group: "" });
    setOpen(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    setForm({ name: row.name, type: row.type, parent_id: row.parent_id ?? "", active: row.active, dre_group: row.dre_group ?? "" });
    setOpen(true);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Categorias Financeiras</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Nova categoria</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lista</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Grupo DRE</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                      <TableCell>
                        {r.dre_group ? (
                          <Badge variant="secondary" className="text-[10px] uppercase">{r.dre_group.replace("_", " ")}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Não definido</span>
                        )}
                      </TableCell>
                      <TableCell>{r.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!data.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma categoria cadastrada</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} categoria</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEITA">Receita</SelectItem>
                  <SelectItem value="DESPESA">Despesa</SelectItem>
                  <SelectItem value="AMBOS">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria pai (opcional)</Label>
              <Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sem categoria pai" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria pai</SelectItem>
                  {data.filter((c: any) => c.id !== editing?.id).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Grupo DRE</Label>
              <Select value={form.dre_group || "none"} onValueChange={(v) => setForm({ ...form, dre_group: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o grupo DRE" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não definido</SelectItem>
                  <SelectItem value="RECEITA_BRUTA">Receita Bruta</SelectItem>
                  <SelectItem value="DEDUCOES">Deduções</SelectItem>
                  <SelectItem value="CUSTO_PRODUCAO">Custo de Produção</SelectItem>
                  <SelectItem value="DESPESA_VARIAVEL">Despesas Variáveis</SelectItem>
                  <SelectItem value="DESPESA_FIXA">Despesas Fixas</SelectItem>
                  <SelectItem value="DESPESA_ADMINISTRATIVA">Despesas Administrativas</SelectItem>
                  <SelectItem value="DESPESA_COMERCIAL">Despesas Comerciais</SelectItem>
                  <SelectItem value="DESPESA_FINANCEIRA">Despesas Financeiras</SelectItem>
                  <SelectItem value="IMPOSTOS">Impostos</SelectItem>
                  <SelectItem value="OUTRAS_RECEITAS">Outras Receitas</SelectItem>
                  <SelectItem value="OUTRAS_DESPESAS">Outras Despesas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativa</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
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
