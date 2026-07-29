import { useState, useMemo } from "react";
import { useAllCommercialPaymentPlans, useSavePaymentPlan, useTogglePaymentPlanActive, useDeletePaymentPlan, type PaymentPlanInput } from "@/hooks/useCommercialPaymentPlansAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, Plus, Pencil, Trash2 } from "lucide-react";

const empty: PaymentPlanInput = {
  name: "",
  code: "",
  description: "",
  plan_type: "short_term",
  max_days: 30,
  months_count: 1,
  installment_count: 1,
  discount_percent: 0,
  monthly_interest_percent: 0,
  interest_type: "compound",
  minimum_order_amount: null,
  requires_financial_approval: false,
  requires_credit_approval: false,
  requires_guarantee: false,
  active: true,
  sort_order: 0,
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function calcExample(form: PaymentPlanInput, base = 100000) {
  const liquido = base * (1 - (form.discount_percent || 0) / 100);
  const meses = form.months_count || 0;
  const taxa = (form.monthly_interest_percent || 0) / 100;
  let final = liquido;
  if (form.interest_type === "compound") final = liquido * Math.pow(1 + taxa, meses);
  else if (form.interest_type === "simple") final = liquido * (1 + taxa * meses);
  const juros = final - liquido;
  const parcela = form.installment_count > 0 ? final / form.installment_count : final;
  return { liquido, final, juros, parcela };
}

export default function CommercialPaymentPlansPage() {
  const { data: plans = [], isLoading } = useAllCommercialPaymentPlans();
  const save = useSavePaymentPlan();
  const toggle = useTogglePaymentPlanActive();
  const del = useDeletePaymentPlan();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PaymentPlanInput>(empty);

  const example = useMemo(() => calcExample(form), [form]);

  function openNew() {
    setForm({ ...empty, sort_order: (plans[plans.length - 1]?.sort_order ?? 0) + 10 });
    setOpen(true);
  }

  function openEdit(p: any) {
    setForm({ ...p });
    setOpen(true);
  }

  function submit() {
    if (!form.name || !form.code) {
      toast.error("Nome e código são obrigatórios");
      return;
    }
    save.mutate(form, {
      onSuccess: () => {
        toast.success(form.id ? "Plano atualizado" : "Plano criado");
        setOpen(false);
      },
      onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Excluir este plano? A ação é irreversível.")) return;
    del.mutate(id, {
      onSuccess: () => toast.success("Plano excluído"),
      onError: (e: any) => {
        if (e.message === "plan_in_use") {
          toast.error("Plano já usado em pedidos. Inative-o em vez de excluir.");
        } else {
          toast.error(e.message ?? "Erro ao excluir");
        }
      },
    });
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Condições de Pagamento</h1>
          <p className="text-sm text-muted-foreground">Planos comerciais B2B configuráveis</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo plano</Button>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Alterações nos planos <strong>não alteram pedidos já criados</strong>, pois os pedidos mantêm snapshot financeiro.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Planos cadastrados</CardTitle>
          <CardDescription>{plans.length} plano(s)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="text-muted-foreground text-sm">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Desc/Juros</TableHead>
                  <TableHead>Requisitos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.sort_order}</TableCell>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.max_days}d / {p.installment_count}x</TableCell>
                    <TableCell>-{p.discount_percent}% / +{p.monthly_interest_percent}%a.m.</TableCell>
                    <TableCell className="space-x-1">
                      {p.requires_financial_approval && <Badge variant="outline">Fin</Badge>}
                      {p.requires_credit_approval && <Badge variant="outline">Crédito</Badge>}
                      {p.requires_guarantee && <Badge variant="outline">Garantia</Badge>}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.active}
                        onCheckedChange={(active) =>
                          toggle.mutate({ id: p.id, active }, {
                            onSuccess: () => toast.success(active ? "Ativado" : "Inativado"),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)}>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar plano" : "Novo plano"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label>Código</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.plan_type} onValueChange={(v: any) => setForm({ ...form, plan_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">À vista</SelectItem>
                      <SelectItem value="short_term">Curto prazo</SelectItem>
                      <SelectItem value="medium_term">Médio prazo</SelectItem>
                      <SelectItem value="extended_term">Prazo estendido</SelectItem>
                      <SelectItem value="harvest">Safra</SelectItem>
                      <SelectItem value="custom">Customizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de juros</Label>
                  <Select value={form.interest_type} onValueChange={(v: any) => setForm({ ...form, interest_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem juros</SelectItem>
                      <SelectItem value="simple">Simples</SelectItem>
                      <SelectItem value="compound">Composto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Modo de precificação</Label>
                <Select
                  value={form.pricing_mode ?? "discount_from_base"}
                  onValueChange={(v: any) => setForm({ ...form, pricing_mode: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount_from_base">Desconto sobre preço base</SelectItem>
                    <SelectItem value="fixed_item_price">Preço fixo por item (exige regra na matriz)</SelectItem>
                    <SelectItem value="quote_only">Sob consulta (pedido vai para cotação)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Define como o resolvedor do servidor precifica itens desta condição.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Prazo máx (dias)</Label>
                  <Input type="number" value={form.max_days} onChange={(e) => setForm({ ...form, max_days: +e.target.value })} />
                </div>
                <div>
                  <Label>Meses (cálculo)</Label>
                  <Input type="number" value={form.months_count} onChange={(e) => setForm({ ...form, months_count: +e.target.value })} />
                </div>
                <div>
                  <Label>Parcelas</Label>
                  <Input type="number" value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: +e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Desconto %</Label>
                  <Input type="number" step="0.01" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: +e.target.value })} />
                </div>
                <div>
                  <Label>Juros mensal %</Label>
                  <Input type="number" step="0.01" value={form.monthly_interest_percent} onChange={(e) => setForm({ ...form, monthly_interest_percent: +e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor mínimo do pedido</Label>
                  <Input type="number" step="0.01" value={form.minimum_order_amount ?? ""} onChange={(e) => setForm({ ...form, minimum_order_amount: e.target.value ? +e.target.value : null })} />
                </div>
                <div>
                  <Label>Ordem de exibição</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: +e.target.value })} />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label>Exige aprovação financeira</Label>
                  <Switch checked={form.requires_financial_approval} onCheckedChange={(v) => setForm({ ...form, requires_financial_approval: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Exige aprovação de crédito</Label>
                  <Switch checked={form.requires_credit_approval} onCheckedChange={(v) => setForm({ ...form, requires_credit_approval: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Exige garantia</Label>
                  <Switch checked={form.requires_guarantee} onCheckedChange={(v) => setForm({ ...form, requires_guarantee: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Ativo</Label>
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                </div>
              </div>
            </div>

            <div>
              <Card className="sticky top-0">
                <CardHeader>
                  <CardTitle className="text-base">Exemplo de cálculo</CardTitle>
                  <CardDescription>Base fictícia de {brl(100000)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Valor de tabela</span><span>{brl(100000)}</span></div>
                  <div className="flex justify-between"><span>Desconto ({form.discount_percent}%)</span><span>-{brl(100000 - example.liquido)}</span></div>
                  <div className="flex justify-between font-medium"><span>Líquido</span><span>{brl(example.liquido)}</span></div>
                  <div className="flex justify-between"><span>Juros ({form.months_count}m × {form.monthly_interest_percent}%)</span><span>+{brl(example.juros)}</span></div>
                  <div className="flex justify-between text-base font-semibold border-t pt-2"><span>Valor final</span><span>{brl(example.final)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Parcela ({form.installment_count}x)</span><span>{brl(example.parcela)}</span></div>
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
