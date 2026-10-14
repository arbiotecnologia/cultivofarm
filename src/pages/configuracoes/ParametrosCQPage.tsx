import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { formatConcentracaoDisplay, parseConcentracao, formatConcentracaoValue } from "@/lib/cqFormat";

interface Row {
  id: string;
  microrganismo_id: string;
  produto_id: string | null;
  ph_min: number | null;
  ph_max: number | null;
  concentracao_min_ufc_ml: number | null;
  aparencia_esperada: string | null;
  odor_esperado: string | null;
  contaminacao_esperada: string | null;
  observacoes: string | null;
  ativo: boolean;
  microrganismos?: { nome: string; nome_cientifico: string | null } | null;
  produtos?: { nome: string } | null;
}

const EMPTY = {
  id: "",
  microrganismo_id: "",
  produto_id: "",
  ph_min: "",
  ph_max: "",
  conc_mantissa: "",
  conc_expoente: "",
  aparencia_esperada: "",
  odor_esperado: "",
  contaminacao_esperada: "",
  observacoes: "",
  ativo: true,
};

export default function ParametrosCQPage() {
  const { role } = useAuth();
  const canEdit = role === "administrador" || role === "gestor" || role === "producao";
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data: microrganismos = [] } = useQuery({
    queryKey: ["mo-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("microrganismos")
        .select("id, nome, nome_cientifico")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["prod-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cq-parametros-referencia"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("cq_parametros_referencia")
        .select("*, microrganismos:microrganismo_id(nome, nome_cientifico), produtos:produto_id(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      assertGlobalCatalogWriteBlocked();
      if (!form.microrganismo_id) throw new Error("Selecione o microrganismo");
      const payload = {
        microrganismo_id: form.microrganismo_id,
        produto_id: form.produto_id || null,
        ph_min: form.ph_min ? Number(form.ph_min.replace(",", ".")) : null,
        ph_max: form.ph_max ? Number(form.ph_max.replace(",", ".")) : null,
        concentracao_min_ufc_ml: formatConcentracaoValue(form.conc_mantissa, form.conc_expoente),
        aparencia_esperada: form.aparencia_esperada || null,
        odor_esperado: form.odor_esperado || null,
        contaminacao_esperada: form.contaminacao_esperada || null,
        observacoes: form.observacoes || null,
        ativo: form.ativo,
      };
      if (form.id) {
        const { error } = await supabase.from("cq_parametros_referencia").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cq_parametros_referencia").insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Referência salva");
      queryClient.invalidateQueries({ queryKey: ["cq-parametros-referencia"] });
      queryClient.invalidateQueries({ queryKey: ["cq-referencia"] });
      setDialogOpen(false);
      setForm(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertGlobalCatalogWriteBlocked();
      const { error } = await supabase.from("cq_parametros_referencia").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Referência excluída");
      queryClient.invalidateQueries({ queryKey: ["cq-parametros-referencia"] });
      queryClient.invalidateQueries({ queryKey: ["cq-referencia"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (r: Row) => {
    const conc = parseConcentracao(r.concentracao_min_ufc_ml);
    setForm({
      id: r.id,
      microrganismo_id: r.microrganismo_id,
      produto_id: r.produto_id ?? "",
      ph_min: r.ph_min !== null ? String(r.ph_min).replace(".", ",") : "",
      ph_max: r.ph_max !== null ? String(r.ph_max).replace(".", ",") : "",
      conc_mantissa: conc.mantissa,
      conc_expoente: conc.expoente,
      aparencia_esperada: r.aparencia_esperada ?? "",
      odor_esperado: r.odor_esperado ?? "",
      contaminacao_esperada: r.contaminacao_esperada ?? "",
      observacoes: r.observacoes ?? "",
      ativo: r.ativo,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Parâmetros de referência do CQ"
        description="Faixas esperadas usadas como comparativo informativo ao registrar o Controle de Qualidade."
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Referências cadastradas</CardTitle>
            <CardDescription>
              Uma referência por microrganismo (com produto opcional). A comparação exibida no
              cockpit é apenas informativa — a aprovação/reprovação continua manual.
            </CardDescription>
          </div>
          {canEdit && (
            <Button onClick={() => { setForm(EMPTY); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova referência
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma referência cadastrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Microrganismo</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>pH</TableHead>
                    <TableHead>Conc. mínima</TableHead>
                    <TableHead>Aparência</TableHead>
                    <TableHead>Odor</TableHead>
                    <TableHead>Contaminação</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="w-24 text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.microrganismos?.nome ?? "—"}
                        {r.microrganismos?.nome_cientifico && (
                          <div className="text-[11px] italic text-muted-foreground">
                            {r.microrganismos.nome_cientifico}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.produtos?.nome ?? <span className="italic">— (padrão)</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.ph_min ?? "—"} – {r.ph_max ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.concentracao_min_ufc_ml !== null
                          ? formatConcentracaoDisplay(r.concentracao_min_ufc_ml)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.aparencia_esperada ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.odor_esperado ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.contaminacao_esperada ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.ativo ? "default" : "secondary"}>
                          {r.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Excluir esta referência?")) remove.mutate(r.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar referência" : "Nova referência"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Microrganismo *</Label>
              <Select
                value={form.microrganismo_id}
                onValueChange={(v) => setForm({ ...form, microrganismo_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {microrganismos.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Produto (opcional)</Label>
              <Select
                value={form.produto_id || "__none__"}
                onValueChange={(v) => setForm({ ...form, produto_id: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Padrão para o microrganismo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— (padrão)</SelectItem>
                  {produtos.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>pH mínimo</Label>
              <Input value={form.ph_min} onChange={(e) => setForm({ ...form, ph_min: e.target.value })} placeholder="6,0" />
            </div>
            <div className="space-y-1.5">
              <Label>pH máximo</Label>
              <Input value={form.ph_max} onChange={(e) => setForm({ ...form, ph_max: e.target.value })} placeholder="7,5" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Concentração mínima (UFC/mL)</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  className="w-20 text-center font-mono"
                  value={form.conc_mantissa}
                  onChange={(e) => setForm({ ...form, conc_mantissa: e.target.value.replace(".", ",").replace(/[^0-9,]/g, "") })}
                  placeholder="1,0"
                />
                <span className="text-sm text-muted-foreground italic px-1">× 10</span>
                <Input
                  className="w-16 text-center font-mono"
                  value={form.conc_expoente}
                  onChange={(e) => setForm({ ...form, conc_expoente: e.target.value.replace(/[^0-9]/g, "") })}
                  placeholder="8"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Aparência esperada</Label>
              <Input value={form.aparencia_esperada} onChange={(e) => setForm({ ...form, aparencia_esperada: e.target.value })} placeholder="normal" />
            </div>
            <div className="space-y-1.5">
              <Label>Odor esperado</Label>
              <Input value={form.odor_esperado} onChange={(e) => setForm({ ...form, odor_esperado: e.target.value })} placeholder="característico" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Contaminação esperada</Label>
              <Input value={form.contaminacao_esperada} onChange={(e) => setForm({ ...form, contaminacao_esperada: e.target.value })} placeholder="ausente" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => upsert.mutate()} disabled={upsert.isPending || !canEdit}>
              {upsert.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
