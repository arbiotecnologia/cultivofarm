/**
 * Fase B — Matriz configurável item x condição em rascunho.
 *
 * Fluxos: rascunho, validação de itens sem preço, publicação com confirmação,
 * cópia da tabela padrão, reajuste em massa com prévia, exceções, histórico e
 * simulação server-side. A publicação projeta a regra em `commercial_price_rules`,
 * que é a fonte consumida pelo carrinho.
 */
import { useMemo, useState } from "react";
import {
  useConditionItemPrices,
  useSaveItemPrice,
  useDeleteItemPrice,
  useValidateMatrix,
  usePublishItemPrices,
  useCopyDefaultTable,
  useBulkAdjustPreview,
  useBulkAdjustApply,
  useSimulateConditionPrice,
  useConditionHistory,
  conditionErrorMessage,
  type ItemPriceInput,
  type ConditionPricingMode,
  type ConditionScope,
  type ConditionUnitType,
  type BulkAdjustPreviewRow,
  type MatrixValidation,
} from "@/hooks/useCommercialConditions";
import { usePriceRuleLookups } from "@/hooks/useCommercialPriceRules";
import { useAllCommercialPaymentPlans } from "@/hooks/useCommercialPaymentPlansAdmin";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, Loader2, Plus, Trash2, CheckCircle2, Copy, Percent, FlaskConical, History } from "lucide-react";
import { brl } from "@/lib/financial/format";
import { formatDateDisplay } from "@/lib/date-utils";
import { SOB_CONSULTA_LABEL } from "@/lib/catalogo/unidades";

const NONE = "__none__";

const MODE_LABEL: Record<ConditionPricingMode, string> = {
  fixed_item_price: "Preço fixo",
  discount_from_base: "Desconto sobre base",
  quote_only: SOB_CONSULTA_LABEL,
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  published: "Publicado",
  archived: "Arquivado",
};

const emptyItem: ItemPriceInput = {
  assignment_id: null,
  plan_id: "",
  buyer_scope: "partner",
  partner_id: null,
  customer_id: null,
  product_id: null,
  microrganismo_id: null,
  unit_type: "hectare",
  volume_ml: null,
  min_quantity: 0,
  pricing_mode: "fixed_item_price",
  condition_price: null,
  discount_percent: null,
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: null,
  is_exception: false,
  motivo: null,
};

export function MatrizConfiguravelTab() {
  const { roles } = useAuth();
  const canPublish = roles.includes("administrador") || roles.includes("financeiro");

  const { data: plans = [] } = useAllCommercialPaymentPlans();
  const { data: lookups } = usePriceRuleLookups();

  const [planFilter, setPlanFilter] = useState<string>("");
  const [partnerFilter, setPartnerFilter] = useState<string>("");
  const { data: items = [], isLoading, isError, error } = useConditionItemPrices(planFilter || null);

  const save = useSaveItemPrice();
  const del = useDeleteItemPrice();
  const validate = useValidateMatrix();
  const publish = usePublishItemPrices();
  const copyDefault = useCopyDefaultTable();
  const previewAdjust = useBulkAdjustPreview();
  const applyAdjust = useBulkAdjustApply();
  const simulate = useSimulateConditionPrice();
  const { data: history = [] } = useConditionHistory();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ItemPriceInput>(emptyItem);
  const [selected, setSelected] = useState<string[]>([]);
  const [validation, setValidation] = useState<MatrixValidation | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustPercent, setAdjustPercent] = useState(0);
  const [adjustMotivo, setAdjustMotivo] = useState("");
  const [adjustPreview, setAdjustPreview] = useState<BulkAdjustPreviewRow[] | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const itemName = useMemo(() => {
    const m = new Map<string, string>();
    (lookups?.produtos ?? []).forEach((p) => m.set(p.id, p.nome));
    (lookups?.microrganismos ?? []).forEach((x) => m.set(x.id, x.nome));
    return m;
  }, [lookups]);
  const planName = useMemo(() => {
    const m = new Map<string, string>();
    plans.forEach((p) => m.set(p.id, `${p.code} — ${p.name}`));
    return m;
  }, [plans]);

  const visible = useMemo(
    () => (partnerFilter ? items.filter((i) => i.partner_id === partnerFilter) : items),
    [items, partnerFilter],
  );
  const draftIds = useMemo(
    () => visible.filter((i) => i.status === "draft" || i.status === "pending_approval").map((i) => i.id),
    [visible],
  );

  const denied = isError && String((error as Error)?.message ?? "").includes("permissão");

  function onError(e: unknown) {
    toast.error(conditionErrorMessage((e as Error)?.message));
  }

  function handleSave() {
    if (!form.plan_id) return toast.error("Selecione a condição de pagamento.");
    if (!form.product_id && !form.microrganismo_id) return toast.error("Selecione um produto ou microrganismo.");
    if (form.buyer_scope === "partner" && !form.partner_id) return toast.error("Selecione o parceiro.");
    save.mutate(form, {
      onSuccess: () => {
        toast.success("Preço salvo em rascunho — não elegível até publicação.");
        setOpen(false);
        setForm(emptyItem);
      },
      onError,
    });
  }

  function handleValidate() {
    if (!planFilter) return toast.error("Selecione uma condição para validar.");
    validate.mutate(
      {
        plan_id: planFilter,
        buyer_scope: partnerFilter ? "partner" : "default",
        partner_id: partnerFilter || null,
        customer_id: null,
      },
      { onSuccess: (v) => setValidation(v), onError },
    );
  }

  function handlePublish() {
    if (selected.length === 0) return toast.error("Selecione os preços a publicar.");
    if (!confirm(`Publicar ${selected.length} preço(s)? A partir daí o carrinho passa a usá-los.`)) return;
    publish.mutate(
      { ids: selected },
      {
        onSuccess: (r) => {
          toast.success(`${(r as { published: number }).published} preço(s) publicado(s).`);
          setSelected([]);
        },
        onError,
      },
    );
  }

  if (denied) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Você não tem permissão para administrar a matriz de condições.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Preços nascem em <strong>rascunho</strong> e não são elegíveis no carrinho. A publicação exige atribuição
          publicada e projeta a regra na matriz canônica consumida pelo pedido.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div>
            <Label className="text-xs">Condição</Label>
            <Select value={planFilter || NONE} onValueChange={(v) => setPlanFilter(v === NONE ? "" : v)}>
              <SelectTrigger className="sm:w-64"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Todas</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Parceiro</Label>
            <Select value={partnerFilter || NONE} onValueChange={(v) => setPartnerFilter(v === NONE ? "" : v)}>
              <SelectTrigger className="sm:w-56"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Todos</SelectItem>
                {(lookups?.partners ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleValidate} disabled={validate.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> Validar itens sem preço
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!planFilter || !partnerFilter) return toast.error("Escolha condição e parceiro de destino.");
              copyDefault.mutate(
                { plan_id: planFilter, target_scope: "partner", partner_id: partnerFilter, customer_id: null },
                { onSuccess: (r) => toast.success(`${(r as { copied: number }).copied} item(ns) copiado(s) em rascunho.`), onError },
              );
            }}
          >
            <Copy className="h-4 w-4 mr-1" /> Copiar tabela padrão
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selected.length === 0) return toast.error("Selecione os itens do reajuste.");
              setAdjustPreview(null);
              setAdjustOpen(true);
            }}
          >
            <Percent className="h-4 w-4 mr-1" /> Reajuste em massa
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSimResult(null); setSimOpen(true); }}>
            <FlaskConical className="h-4 w-4 mr-1" /> Simular
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1" /> Histórico
          </Button>
          {canPublish && (
            <Button size="sm" onClick={handlePublish} disabled={publish.isPending}>
              {publish.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Publicar selecionados
            </Button>
          )}
          <Button size="sm" onClick={() => { setForm({ ...emptyItem, plan_id: planFilter, partner_id: partnerFilter || null }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo preço
          </Button>
        </div>
      </div>

      {validation && (
        <Alert variant={validation.ok ? "default" : "destructive"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {validation.ok
              ? `Todos os itens ativos possuem preço. Rascunhos: ${validation.draft_count} · Sob consulta: ${validation.quote_only_count}.`
              : `${validation.missing_items.length} item(ns) sem preço: ${validation.missing_items.slice(0, 8).map((m) => m.nome).join(", ")}${validation.missing_items.length > 8 ? "…" : ""}`}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Matriz de condições</CardTitle>
          <CardDescription>
            {canPublish ? "Você pode publicar preços." : "Seu perfil prepara os preços; a publicação é do financeiro/administrador."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop — matriz */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.length > 0 && selected.length === draftIds.length}
                      onCheckedChange={(c) => setSelected(c ? draftIds : [])}
                      aria-label="Selecionar todos os rascunhos"
                    />
                  </TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Qtd. mín.</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
                  </TableCell></TableRow>
                )}
                {!isLoading && visible.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Nenhum preço cadastrado. Use "Novo preço" ou copie a tabela padrão.
                  </TableCell></TableRow>
                )}
                {visible.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Checkbox
                        disabled={i.status === "published" || i.status === "archived"}
                        checked={selected.includes(i.id)}
                        onCheckedChange={(c) =>
                          setSelected((s) => (c ? [...s, i.id] : s.filter((x) => x !== i.id)))
                        }
                        aria-label="Selecionar preço"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {itemName.get(i.product_id ?? i.microrganismo_id ?? "") ?? "—"}
                      {i.is_exception && <Badge variant="outline" className="ml-2">Exceção</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{planName.get(i.plan_id) ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {i.unit_type}{i.volume_ml ? ` · ${i.volume_ml} mL` : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm">{i.min_quantity}</TableCell>
                    <TableCell className="text-sm">{MODE_LABEL[i.pricing_mode]}</TableCell>
                    <TableCell className="text-right">
                      {i.pricing_mode === "fixed_item_price" && i.condition_price != null
                        ? brl(i.condition_price)
                        : i.pricing_mode === "discount_from_base" && i.discount_percent != null
                          ? `${i.discount_percent}%`
                          : SOB_CONSULTA_LABEL}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateDisplay(i.valid_from)} → {i.valid_until ? formatDateDisplay(i.valid_until) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={i.status === "published" ? "default" : "secondary"}>
                        {STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {i.status === "draft" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir rascunho"
                          onClick={() => del.mutate({ id: i.id }, { onSuccess: () => toast.success("Rascunho excluído"), onError })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile — cartões por condição */}
          <div className="md:hidden divide-y">
            {isLoading && <div className="p-4 text-center text-sm">Carregando…</div>}
            {!isLoading && visible.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">Nenhum preço cadastrado.</div>
            )}
            {visible.map((i) => (
              <div key={i.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">
                    {itemName.get(i.product_id ?? i.microrganismo_id ?? "") ?? "—"}
                  </span>
                  <Badge variant={i.status === "published" ? "default" : "secondary"}>
                    {STATUS_LABEL[i.status] ?? i.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{planName.get(i.plan_id)}</p>
                <p className="text-sm">
                  {MODE_LABEL[i.pricing_mode]} ·{" "}
                  {i.pricing_mode === "fixed_item_price" && i.condition_price != null
                    ? brl(i.condition_price)
                    : i.pricing_mode === "discount_from_base" && i.discount_percent != null
                      ? `${i.discount_percent}%`
                      : SOB_CONSULTA_LABEL}
                </p>
                <p className="text-xs text-muted-foreground">
                  {i.unit_type} · mín. {i.min_quantity} · desde {formatDateDisplay(i.valid_from)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog — novo/editar preço */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Preço da condição (rascunho)</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <Label>Condição de pagamento</Label>
              <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Escopo</Label>
              <Select
                value={form.buyer_scope}
                onValueChange={(v) => setForm({ ...form, buyer_scope: v as ConditionScope, partner_id: null, customer_id: null })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">Parceiro B2B</SelectItem>
                  <SelectItem value="default">Tabela padrão (modelo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.buyer_scope === "partner" && (
              <div>
                <Label>Parceiro</Label>
                <Select value={form.partner_id ?? ""} onValueChange={(v) => setForm({ ...form, partner_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.partners ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Produto</Label>
                <Select
                  value={form.product_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, product_id: v === NONE ? null : v, microrganismo_id: null })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(lookups?.produtos ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Microrganismo</Label>
                <Select
                  value={form.microrganismo_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, microrganismo_id: v === NONE ? null : v, product_id: null })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {(lookups?.microrganismos ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Unidade</Label>
                <Select value={form.unit_type} onValueChange={(v) => setForm({ ...form, unit_type: v as ConditionUnitType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hectare">Hectare</SelectItem>
                    <SelectItem value="dose">Dose</SelectItem>
                    <SelectItem value="litro">Litro</SelectItem>
                    <SelectItem value="unidade">Volume comercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Volume (mL)</Label>
                <Input
                  type="number"
                  value={form.volume_ml ?? ""}
                  onChange={(e) => setForm({ ...form, volume_ml: e.target.value ? Number(e.target.value) : null })}
                  disabled={form.unit_type !== "unidade"}
                />
              </div>
              <div>
                <Label>Qtd. mínima</Label>
                <Input
                  type="number"
                  value={form.min_quantity}
                  onChange={(e) => setForm({ ...form, min_quantity: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Modo</Label>
                <Select
                  value={form.pricing_mode}
                  onValueChange={(v) =>
                    setForm({ ...form, pricing_mode: v as ConditionPricingMode, condition_price: null, discount_percent: null })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_item_price">Preço fixo</SelectItem>
                    <SelectItem value="discount_from_base">Desconto sobre base</SelectItem>
                    <SelectItem value="quote_only">{SOB_CONSULTA_LABEL}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{form.pricing_mode === "discount_from_base" ? "Desconto (%)" : "Preço"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  disabled={form.pricing_mode === "quote_only"}
                  value={
                    form.pricing_mode === "discount_from_base"
                      ? form.discount_percent ?? ""
                      : form.condition_price ?? ""
                  }
                  onChange={(e) => {
                    const n = e.target.value ? Number(e.target.value) : null;
                    setForm(
                      form.pricing_mode === "discount_from_base"
                        ? { ...form, discount_percent: n }
                        : { ...form, condition_price: n },
                    );
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vigência inicial</Label>
                <Input type="date" value={form.valid_from ?? ""} onChange={(e) => setForm({ ...form, valid_from: e.target.value || null })} />
              </div>
              <div>
                <Label>Vigência final</Label>
                <Input type="date" value={form.valid_until ?? ""} onChange={(e) => setForm({ ...form, valid_until: e.target.value || null })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_exception} onCheckedChange={(c) => setForm({ ...form, is_exception: c })} id="exc" />
              <Label htmlFor="exc">Exceção comercial (exige motivo)</Label>
            </div>
            <div>
              <Label>Motivo</Label>
              <Textarea value={form.motivo ?? ""} onChange={(e) => setForm({ ...form, motivo: e.target.value || null })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — reajuste em massa */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reajuste em massa ({selected.length} itens)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Percentual (+/-)</Label>
              <Input type="number" step="0.01" value={adjustPercent} onChange={(e) => setAdjustPercent(Number(e.target.value) || 0)} />
            </div>
            <Button
              variant="outline"
              onClick={() =>
                previewAdjust.mutate({ ids: selected, percent: adjustPercent }, { onSuccess: setAdjustPreview, onError })
              }
            >
              Gerar prévia
            </Button>
            {adjustPreview && (
              <div className="max-h-48 overflow-y-auto text-sm border rounded-md p-2 space-y-1">
                {adjustPreview.map((r) => (
                  <div key={r.id} className="flex justify-between">
                    <span className="text-muted-foreground">{MODE_LABEL[r.pricing_mode]}</span>
                    <span>
                      {r.pricing_mode === "fixed_item_price"
                        ? `${brl(r.current_price ?? 0)} → ${brl(r.new_price ?? 0)}`
                        : `${r.current_discount ?? 0}% → ${r.new_discount ?? 0}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <Label>Motivo</Label>
              <Textarea value={adjustMotivo} onChange={(e) => setAdjustMotivo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button
              disabled={!adjustPreview || !adjustMotivo.trim() || applyAdjust.isPending}
              onClick={() =>
                applyAdjust.mutate(
                  { ids: selected, percent: adjustPercent, motivo: adjustMotivo },
                  {
                    onSuccess: (r) => {
                      toast.success(`${(r as { updated: number }).updated} rascunho(s) atualizado(s).`);
                      setAdjustOpen(false);
                      setAdjustPreview(null);
                    },
                    onError,
                  },
                )
              }
            >
              Aplicar aos rascunhos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — simulação server-side */}
      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Simulação de preço (servidor)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Usa o mesmo resolvedor do carrinho. Selecione condição e parceiro nos filtros e escolha um item.
            </p>
            <Select
              onValueChange={(v) => {
                if (!planFilter) return toast.error("Selecione a condição no filtro.");
                const isProduct = (lookups?.produtos ?? []).some((p) => p.id === v);
                simulate.mutate(
                  {
                    buyer_scope: partnerFilter ? "partner" : "default",
                    partner_id: partnerFilter || null,
                    customer_id: null,
                    plan_id: planFilter,
                    product_id: isProduct ? v : null,
                    microrganismo_id: isProduct ? null : v,
                    unit_type: "hectare",
                    volume_ml: null,
                  },
                  { onSuccess: (r) => setSimResult(r), onError },
                );
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione o item" /></SelectTrigger>
              <SelectContent>
                {(lookups?.produtos ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                {(lookups?.microrganismos ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {simulate.isPending && <p className="text-sm">Simulando…</p>}
            {simResult && (
              <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">
                {JSON.stringify(simResult, null, 2)}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — histórico */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Histórico de condições</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto text-sm divide-y">
            {history.length === 0 && <p className="text-muted-foreground py-4">Sem registros.</p>}
            {history.map((h) => (
              <div key={h.id} className="py-2">
                <div className="flex justify-between">
                  <span className="font-medium">{h.entity} · {h.action}</span>
                  <span className="text-xs text-muted-foreground">{formatDateDisplay(h.created_at)}</span>
                </div>
                {h.motivo && <p className="text-xs text-muted-foreground">{h.motivo}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
