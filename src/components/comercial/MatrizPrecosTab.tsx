import { useMemo, useState } from "react";
import {
  useCommercialPriceRules,
  usePriceRuleLookups,
  useSavePriceRule,
  useTogglePriceRuleActive,
  useDeletePriceRule,
  type CommercialPriceRule,
  type CommercialPriceRuleInput,
} from "@/hooks/useCommercialPriceRules";
import { useAllCommercialPaymentPlans } from "@/hooks/useCommercialPaymentPlansAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { brl } from "@/lib/financial/format";
import { formatDateDisplay } from "@/lib/date-utils";

const NONE = "__none__";

const emptyRule: CommercialPriceRuleInput = {
  buyer_scope: "partner",
  partner_id: null,
  customer_id: null,
  plan_id: null,
  product_id: null,
  microrganismo_id: null,
  unit_type: "hectare",
  volume_ml: null,
  pricing_mode: "fixed_item_price",
  condition_price: null,
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: null,
  active: true,
  motivo: null,
};

const modeLabel: Record<string, string> = {
  fixed_item_price: "Preço fixo",
  discount_from_base: "Desconto sobre base",
  quote_only: "Sob consulta",
};

export function MatrizPrecosTab() {
  const { data: rules = [], isLoading } = useCommercialPriceRules();
  const { data: lookups } = usePriceRuleLookups();
  const { data: plans = [] } = useAllCommercialPaymentPlans();
  const save = useSavePriceRule();
  const toggle = useTogglePriceRuleActive();
  const del = useDeletePriceRule();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CommercialPriceRuleInput>(emptyRule);

  const partnerName = useMemo(() => {
    const map = new Map<string, string>();
    (lookups?.partners ?? []).forEach((p) => map.set(p.id, p.nome_fantasia || p.razao_social));
    return map;
  }, [lookups]);
  const itemName = useMemo(() => {
    const map = new Map<string, string>();
    (lookups?.produtos ?? []).forEach((p) => map.set(p.id, p.nome));
    (lookups?.microrganismos ?? []).forEach((m) => map.set(m.id, m.nome));
    return map;
  }, [lookups]);
  const planName = useMemo(() => {
    const map = new Map<string, string>();
    plans.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [plans]);

  const selectedPlan = plans.find((p) => p.id === form.plan_id);

  function openNew() {
    setForm(emptyRule);
    setOpen(true);
  }

  function openEdit(rule: CommercialPriceRule) {
    setForm({ ...rule });
    setOpen(true);
  }

  function submit() {
    if (!form.product_id && !form.microrganismo_id) {
      toast.error("Selecione um produto ou um microrganismo");
      return;
    }
    if (form.product_id && form.microrganismo_id) {
      toast.error("Escolha apenas produto OU microrganismo");
      return;
    }
    if (form.buyer_scope === "partner" && !form.partner_id) {
      toast.error("Selecione o parceiro do escopo");
      return;
    }
    if (form.pricing_mode === "fixed_item_price" && !(Number(form.condition_price) > 0)) {
      toast.error("Informe o preço fixo da condição");
      return;
    }
    if (form.unit_type === "volume" && !(Number(form.volume_ml) > 0)) {
      toast.error("Informe o volume (ml) da regra");
      return;
    }
    if (form.valid_until && form.valid_until < form.valid_from) {
      toast.error("Vigência final anterior à inicial");
      return;
    }
    save.mutate(form, {
      onSuccess: () => {
        toast.success(form.id ? "Regra atualizada" : "Regra criada");
        setOpen(false);
      },
      onError: (e: Error) => toast.error(e.message),
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Excluir esta regra de preço? Pedidos já criados mantêm o snapshot.")) return;
    del.mutate(id, {
      onSuccess: () => toast.success("Regra excluída"),
      onError: (e: Error) => toast.error(e.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Matriz de preços por condição</h2>
          <p className="text-sm text-muted-foreground">
            Regras canônicas consumidas pelo resolvedor do servidor
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nova regra</Button>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Precedência de preço: <strong>P1</strong> regra por cliente → <strong>P2</strong> regra por parceiro →{" "}
          <strong>P3</strong> tabela do parceiro → <strong>P4</strong> catálogo base. Condições em
          modo <em>preço fixo</em> exigem regra; sem regra o item não é precificado. Condições
          <em> sob consulta</em> nunca precificam — o pedido vai para cotação comercial.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Regras cadastradas</CardTitle>
          <CardDescription>{rules.length} regra(s)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : rules.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma regra cadastrada.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      {r.buyer_scope === "partner" ? "Parceiro" : "Cliente"}
                      <div className="text-muted-foreground">
                        {r.partner_id ? partnerName.get(r.partner_id) ?? "—" : r.customer_id ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{r.plan_id ? planName.get(r.plan_id) ?? "—" : "Todas"}</TableCell>
                    <TableCell className="text-xs">
                      {itemName.get(r.product_id ?? r.microrganismo_id ?? "") ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.unit_type}
                      {r.volume_ml ? ` · ${r.volume_ml} ml` : ""}
                    </TableCell>
                    <TableCell><Badge variant="outline">{modeLabel[r.pricing_mode] ?? r.pricing_mode}</Badge></TableCell>
                    <TableCell className="text-right">
                      {r.condition_price != null ? brl(Number(r.condition_price)) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDateDisplay(r.valid_from)}
                      {r.valid_until ? ` → ${formatDateDisplay(r.valid_until)}` : " → aberto"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.active}
                        onCheckedChange={(active) =>
                          toggle.mutate({ id: r.id, active }, {
                            onSuccess: () => toast.success(active ? "Regra ativada" : "Regra inativada"),
                            onError: (e: Error) => toast.error(e.message),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar regra de preço" : "Nova regra de preço"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Escopo</Label>
                <Select
                  value={form.buyer_scope}
                  onValueChange={(v: "partner" | "customer") =>
                    setForm({ ...form, buyer_scope: v, partner_id: null, customer_id: null })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="partner">Parceiro B2B</SelectItem>
                    <SelectItem value="customer">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{form.buyer_scope === "partner" ? "Parceiro" : "Cliente (ID)"}</Label>
                {form.buyer_scope === "partner" ? (
                  <Select
                    value={form.partner_id ?? NONE}
                    onValueChange={(v) => setForm({ ...form, partner_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(lookups?.partners ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.customer_id ?? ""}
                    onChange={(e) => setForm({ ...form, customer_id: e.target.value || null })}
                    placeholder="UUID do cliente"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Condição de pagamento</Label>
                <Select
                  value={form.plan_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, plan_id: v === NONE ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Todas as condições</SelectItem>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPlan && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Modo da condição: {modeLabel[(selectedPlan as any).pricing_mode ?? "discount_from_base"]}
                  </p>
                )}
              </div>
              <div>
                <Label>Modo de precificação</Label>
                <Select
                  value={form.pricing_mode}
                  onValueChange={(v: CommercialPriceRuleInput["pricing_mode"]) =>
                    setForm({ ...form, pricing_mode: v, condition_price: v === "fixed_item_price" ? form.condition_price : null })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_item_price">Preço fixo</SelectItem>
                    <SelectItem value="discount_from_base">Desconto sobre base</SelectItem>
                    <SelectItem value="quote_only">Sob consulta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Produto</Label>
                <Select
                  value={form.product_id ?? NONE}
                  onValueChange={(v) =>
                    setForm({ ...form, product_id: v === NONE ? null : v, microrganismo_id: null })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(lookups?.produtos ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Microrganismo</Label>
                <Select
                  value={form.microrganismo_id ?? NONE}
                  onValueChange={(v) =>
                    setForm({ ...form, microrganismo_id: v === NONE ? null : v, product_id: null })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(lookups?.microrganismos ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Unidade</Label>
                <Select
                  value={form.unit_type}
                  onValueChange={(v) => setForm({ ...form, unit_type: v, volume_ml: v === "volume" ? form.volume_ml : null })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hectare">Hectare</SelectItem>
                    <SelectItem value="litro">Litro</SelectItem>
                    <SelectItem value="dose">Dose</SelectItem>
                    <SelectItem value="volume">Volume (ml)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Volume (ml)</Label>
                <Input
                  type="number"
                  disabled={form.unit_type !== "volume"}
                  value={form.volume_ml ?? ""}
                  onChange={(e) => setForm({ ...form, volume_ml: e.target.value ? +e.target.value : null })}
                />
              </div>
              <div>
                <Label>Preço fixo (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  disabled={form.pricing_mode !== "fixed_item_price"}
                  value={form.condition_price ?? ""}
                  onChange={(e) => setForm({ ...form, condition_price: e.target.value ? +e.target.value : null })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vigência inicial</Label>
                <Input
                  type="date"
                  value={form.valid_from}
                  onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                />
              </div>
              <div>
                <Label>Vigência final (opcional)</Label>
                <Input
                  type="date"
                  value={form.valid_until ?? ""}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value || null })}
                />
              </div>
            </div>

            <div>
              <Label>Motivo / justificativa</Label>
              <Textarea
                rows={2}
                value={form.motivo ?? ""}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Regra ativa</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
