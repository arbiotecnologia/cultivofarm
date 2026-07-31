import { useMemo, useState } from "react";
import {
  useAdminCommercialPlans,
  useCreateCommercialPlan,
  useVersionCommercialPlan,
  useUpdatePlanMetadata,
  useSetPlanActive,
  useSetDefaultPlan,
  planErrorMessage,
  type AdminCommercialPlanRow,
  type PaymentPlanPayload,
} from "@/hooks/useCommercialPaymentPlansAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatrizPrecosTab } from "@/components/comercial/MatrizPrecosTab";
import { AtribuicoesPlanosTab } from "@/components/comercial/AtribuicoesPlanosTab";
import { MatrizConfiguravelTab } from "@/components/comercial/MatrizConfiguravelTab";
import { AlertCircle, Plus, Pencil, GitBranch, Star, Loader2 } from "lucide-react";
import { useTabParam } from "@/lib/navigation/useTabParam";

const PAGE_SIZE = 20;

const empty: PaymentPlanPayload = {
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
  pricing_mode: "discount_from_base",
  minimum_order_amount: null,
  requires_credit_approval: false,
  requires_guarantee: false,
  requires_financial_approval: false,
  active: true,
  sort_order: 0,
  valid_from: null,
  valid_until: null,
  motivo: "",
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

function preview(form: PaymentPlanPayload, base = 100000) {
  const liquido = base * (1 - (Number(form.discount_percent) || 0) / 100);
  const meses = Number(form.months_count) || 0;
  const taxa = (Number(form.monthly_interest_percent) || 0) / 100;
  let final = liquido;
  if (form.interest_type === "compound") final = liquido * Math.pow(1 + taxa, meses);
  else if (form.interest_type === "simple") final = liquido * (1 + taxa * meses);
  const parcelas = Math.max(Number(form.installment_count) || 1, 1);
  return { liquido, final, juros: final - liquido, parcela: final / parcelas };
}

type Mode = "create" | "version" | "metadata";

export default function CommercialPaymentPlansPage() {
  const [tab, setTab] = useTabParam("tab", ["planos", "matriz", "atribuicoes", "condicoes"] as const, "planos");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, error } = useAdminCommercialPlans({
    search,
    status,
    page,
    pageSize: PAGE_SIZE,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const create = useCreateCommercialPlan();
  const version = useVersionCommercialPlan();
  const metadata = useUpdatePlanMetadata();
  const setActive = useSetPlanActive();
  const setDefault = useSetDefaultPlan();
  const saving = create.isPending || version.isPending || metadata.isPending;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [current, setCurrent] = useState<AdminCommercialPlanRow | null>(null);
  const [form, setForm] = useState<PaymentPlanPayload>(empty);

  const sim = useMemo(() => preview(form), [form]);
  const denied = isError && String((error as any)?.message ?? "").includes("not_authorized");

  function openCreate() {
    setMode("create");
    setCurrent(null);
    setForm({ ...empty, sort_order: (rows[rows.length - 1]?.sort_order ?? 0) + 10 });
    setOpen(true);
  }

  function openFor(p: AdminCommercialPlanRow, m: Mode) {
    setMode(m);
    setCurrent(p);
    setForm({
      name: p.name,
      code: p.code,
      description: p.description ?? "",
      plan_type: p.plan_type,
      max_days: p.max_days,
      months_count: Number(p.months_count),
      installment_count: p.installment_count,
      discount_percent: Number(p.discount_percent),
      monthly_interest_percent: Number(p.monthly_interest_percent),
      interest_type: p.interest_type,
      pricing_mode: p.pricing_mode,
      minimum_order_amount: p.minimum_order_amount,
      requires_credit_approval: p.requires_credit_approval,
      requires_guarantee: p.requires_guarantee,
      requires_financial_approval: p.requires_financial_approval,
      active: p.active,
      sort_order: p.sort_order,
      valid_from: null,
      valid_until: p.valid_until,
      motivo: "",
    });
    setOpen(true);
  }

  function submit() {
    if (saving) return;
    const onError = (e: unknown) => toast.error(planErrorMessage(e));
    if (mode === "create") {
      create.mutate(form, {
        onSuccess: () => {
          toast.success("Plano criado");
          setOpen(false);
        },
        onError,
      });
    } else if (mode === "version" && current) {
      version.mutate(
        { planId: current.id, payload: form, motivo: form.motivo },
        {
          onSuccess: () => {
            toast.success(`Nova versão criada (v${current.version + 1})`);
            setOpen(false);
          },
          onError,
        },
      );
    } else if (mode === "metadata" && current) {
      metadata.mutate(
        { planId: current.id, name: form.name, description: form.description, sortOrder: form.sort_order },
        {
          onSuccess: () => {
            toast.success("Metadados atualizados");
            setOpen(false);
          },
          onError,
        },
      );
    }
  }

  function toggleActive(p: AdminCommercialPlanRow, active: boolean) {
    if (!active && !confirm(`Desativar o plano ${p.code}? Pedidos existentes são preservados.`)) return;
    setActive.mutate(
      { id: p.id, active },
      {
        onSuccess: () => toast.success(active ? "Plano ativado" : "Plano desativado"),
        onError: (e) => toast.error(planErrorMessage(e)),
      },
    );
  }

  const statusBadge = (p: AdminCommercialPlanRow) =>
    p.superseded_by_id ? (
      <Badge variant="outline">Substituído</Badge>
    ) : p.selectable ? (
      <Badge>Vigente</Badge>
    ) : (
      <Badge variant="secondary">Indisponível</Badge>
    );

  if (denied) {
    return (
      <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para administrar planos comerciais. Fale com o administrador.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Motor Comercial B2B</h1>
        <p className="text-sm text-muted-foreground">
          Condições de pagamento versionadas e matriz canônica de preços
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="planos">Condições de pagamento</TabsTrigger>
          <TabsTrigger value="matriz">Matriz de preços</TabsTrigger>
          <TabsTrigger value="atribuicoes">Atribuições</TabsTrigger>
          <TabsTrigger value="condicoes">Matriz por condição</TabsTrigger>
        </TabsList>

        <TabsContent value="atribuicoes">
          <AtribuicoesPlanosTab />
        </TabsContent>

        <TabsContent value="condicoes">
          <MatrizConfiguravelTab />
        </TabsContent>

        <TabsContent value="matriz">
          <MatrizPrecosTab />
        </TabsContent>

        <TabsContent value="planos" className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Alterações financeiras em planos já utilizados exigem <strong>nova versão</strong>. Pedidos,
              simulações e recebíveis históricos mantêm o snapshot original.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="sm:w-64"
                placeholder="Buscar por nome ou código"
                value={search}
                onChange={(e) => {
                  setPage(0);
                  setSearch(e.target.value);
                }}
              />
              <Select
                value={status}
                onValueChange={(v: any) => {
                  setPage(0);
                  setStatus(v);
                }}
              >
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Novo plano
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Planos cadastrados</CardTitle>
              <CardDescription>{total} plano(s) encontrados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : isError ? (
                <Alert variant="destructive">
                  <AlertDescription>{planErrorMessage(error)}</AlertDescription>
                </Alert>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum plano encontrado com os filtros atuais.</p>
              ) : (
                <>
                  {/* Desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ordem</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Nome / versão</TableHead>
                          <TableHead>Vigência</TableHead>
                          <TableHead>Resumo</TableHead>
                          <TableHead>Padrão</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ativo</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{p.sort_order}</TableCell>
                            <TableCell className="font-mono text-xs">{p.code}</TableCell>
                            <TableCell>
                              {p.name} <Badge variant="outline">v{p.version}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmtDate(p.valid_from)} → {fmtDate(p.valid_until)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {p.max_days}d / {p.installment_count}x · -{p.discount_percent}% / +
                              {p.monthly_interest_percent}% a.m.
                            </TableCell>
                            <TableCell>
                              <Button
                                size="icon"
                                variant={p.is_default ? "default" : "ghost"}
                                aria-label="Definir como padrão"
                                onClick={() =>
                                  setDefault.mutate(p.id, {
                                    onSuccess: () => toast.success("Plano padrão atualizado"),
                                    onError: (e) => toast.error(planErrorMessage(e)),
                                  })
                                }
                              >
                                <Star className="h-4 w-4" />
                              </Button>
                            </TableCell>
                            <TableCell>{statusBadge(p)}</TableCell>
                            <TableCell>
                              <Switch
                                checked={p.active}
                                disabled={setActive.isPending}
                                onCheckedChange={(v) => toggleActive(p, v)}
                              />
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button size="icon" variant="ghost" aria-label="Editar metadados" onClick={() => openFor(p, "metadata")}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" aria-label="Criar nova versão" onClick={() => openFor(p, "version")}>
                                <GitBranch className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden space-y-3">
                    {rows.map((p) => (
                      <Card key={p.id}>
                        <CardContent className="pt-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {p.name} <Badge variant="outline">v{p.version}</Badge>
                              </p>
                              <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                            </div>
                            {statusBadge(p)}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {p.max_days}d / {p.installment_count}x · -{p.discount_percent}% / +
                            {p.monthly_interest_percent}% a.m.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Vigência: {fmtDate(p.valid_from)} → {fmtDate(p.valid_until)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Switch checked={p.active} onCheckedChange={(v) => toggleActive(p, v)} />
                            <Button size="sm" variant="outline" onClick={() => openFor(p, "metadata")}>
                              Editar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openFor(p, "version")}>
                              Nova versão
                            </Button>
                            <Button
                              size="sm"
                              variant={p.is_default ? "default" : "ghost"}
                              onClick={() =>
                                setDefault.mutate(p.id, {
                                  onSuccess: () => toast.success("Plano padrão atualizado"),
                                  onError: (e) => toast.error(planErrorMessage(e)),
                                })
                              }
                            >
                              Padrão
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      Página {page + 1} de {Math.max(Math.ceil(total / PAGE_SIZE), 1)}
                    </span>
                    <div className="space-x-2">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(page + 1) * PAGE_SIZE >= total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" && "Novo plano"}
              {mode === "version" && `Nova versão de ${current?.code}`}
              {mode === "metadata" && `Editar metadados de ${current?.code}`}
            </DialogTitle>
            <DialogDescription>
              {mode === "version"
                ? "A versão atual será encerrada e substituída. Pedidos e snapshots existentes permanecem inalterados."
                : mode === "metadata"
                  ? "Somente nome, descrição e ordem. Condições financeiras exigem nova versão."
                  : "Defina as condições comerciais do novo plano."}
            </DialogDescription>
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
                  <Input
                    value={form.code}
                    disabled={mode === "metadata"}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  rows={2}
                  value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={form.plan_type}
                    disabled={mode === "metadata"}
                    onValueChange={(v) => setForm({ ...form, plan_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">À vista</SelectItem>
                      <SelectItem value="short_term">Curto prazo</SelectItem>
                      <SelectItem value="medium_term">Médio prazo</SelectItem>
                      <SelectItem value="extended_term">Prazo estendido</SelectItem>
                      <SelectItem value="harvest">Safra</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Modo de precificação</Label>
                  <Select
                    value={form.pricing_mode}
                    disabled={mode === "metadata"}
                    onValueChange={(v) => setForm({ ...form, pricing_mode: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discount_from_base">Desconto sobre base</SelectItem>
                      <SelectItem value="fixed_item_price">Preço fixo por item</SelectItem>
                      <SelectItem value="quote_only">Somente cotação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Prazo (dias)</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={mode === "metadata"}
                    value={form.max_days}
                    onChange={(e) => setForm({ ...form, max_days: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Meses</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={mode === "metadata"}
                    value={form.months_count}
                    onChange={(e) => setForm({ ...form, months_count: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    disabled={mode === "metadata"}
                    value={form.installment_count}
                    onChange={(e) => setForm({ ...form, installment_count: Number(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Desconto (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    disabled={mode === "metadata"}
                    value={form.discount_percent}
                    onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Juros (% a.m.)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={mode === "metadata"}
                    value={form.monthly_interest_percent}
                    onChange={(e) =>
                      setForm({ ...form, monthly_interest_percent: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label>Tipo de juros</Label>
                  <Select
                    value={form.interest_type}
                    disabled={mode === "metadata"}
                    onValueChange={(v) => setForm({ ...form, interest_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem juros</SelectItem>
                      <SelectItem value="simple">Simples</SelectItem>
                      <SelectItem value="compound">Composto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Início da vigência</Label>
                  <Input
                    type="date"
                    disabled={mode === "metadata"}
                    value={form.valid_from?.slice(0, 10) ?? ""}
                    onChange={(e) => setForm({ ...form, valid_from: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label>Fim da vigência</Label>
                  <Input
                    type="date"
                    disabled={mode === "metadata"}
                    value={form.valid_until?.slice(0, 10) ?? ""}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value || null })}
                  />
                </div>
              </div>

              <div>
                <Label>Ordem de exibição</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sort_order ?? 0}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                />
              </div>

              {mode === "version" && (
                <div>
                  <Label>Motivo da nova versão</Label>
                  <Textarea
                    rows={2}
                    value={form.motivo ?? ""}
                    onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                  />
                </div>
              )}

              <div className="space-y-2 pt-1">
                {[
                  ["requires_financial_approval", "Exige aprovação financeira"],
                  ["requires_credit_approval", "Exige aprovação de crédito"],
                  ["requires_guarantee", "Exige garantia"],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-sm font-normal">{label}</Label>
                    <Switch
                      checked={Boolean((form as any)[key])}
                      disabled={mode === "metadata"}
                      onCheckedChange={(v) => setForm({ ...form, [key]: v } as PaymentPlanPayload)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preview do cronograma</CardTitle>
                  <CardDescription>Base de referência {brl(100000)} — não persiste pedido</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor líquido</span>
                    <span>{brl(sim.liquido)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Juros</span>
                    <span>{brl(sim.juros)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Total final</span>
                    <span>{brl(sim.final)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {form.installment_count}x de
                    </span>
                    <span>{brl(sim.parcela)}</span>
                  </div>
                </CardContent>
              </Card>

              {mode === "version" && current?.is_referenced && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Este plano já é referenciado por pedidos/regras. A nova versão passa a valer apenas para
                    novas simulações e pedidos.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "version" ? "Criar nova versão" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
