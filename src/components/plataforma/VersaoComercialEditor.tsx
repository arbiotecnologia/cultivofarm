import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FilePenLine, Search, Send } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseStructuredLimits, serializeStructuredLimits, type LimitState, type StructuredLimitValue } from "./commercialLimits";
import {
  centsFromDecimal,
  centsToDecimal,
  COMMERCIAL_CURRENCIES,
  editableCommercialMoney,
  formatCommercialMoney,
  parseCommercialMoney,
  type CommercialCurrency,
} from "./commercialMoney";
import {
  mensagemErroPlataforma,
  useCatalogoPlanosSaaS,
  usePlanosSaaS,
  usePublicarRascunhoPlano,
  useSalvarRascunhoPlano,
  useVersoesPlanosSaaS,
} from "@/hooks/usePlataformaSaaS";

const CICLOS = [
  ["monthly", "Mensal"], ["quarterly", "Trimestral"], ["semiannual", "Semestral"],
  ["annual", "Anual"], ["custom", "Personalizado"],
] as const;

export function VersaoComercialEditor() {
  const planos = usePlanosSaaS();
  const versoes = useVersoesPlanosSaaS();
  const catalogo = useCatalogoPlanosSaaS();
  const salvar = useSalvarRascunhoPlano();
  const publicar = usePublicarRascunhoPlano();
  const [planKey, setPlanKey] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [priceDisplay, setPriceDisplay] = useState("");
  const [priceFocused, setPriceFocused] = useState(false);
  const [currency, setCurrency] = useState<CommercialCurrency>("BRL");
  const [cycle, setCycle] = useState("");
  const [trialDays, setTrialDays] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [limits, setLimits] = useState<Record<string, StructuredLimitValue>>({});
  const [legacyLimits, setLegacyLimits] = useState<Record<string, unknown>>({});
  const [features, setFeatures] = useState<string[]>([]);
  const [featureSearch, setFeatureSearch] = useState("");
  const [limitSearch, setLimitSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const saveKey = useRef(crypto.randomUUID());
  const publishKey = useRef(crypto.randomUUID());

  const plan = planos.data?.find((item) => item.key === planKey);
  const draft = versoes.data?.find((item) => item.plan_id === plan?.id && item.status === "DRAFT");
  const availableFeatures = useMemo(() => {
    if (!plan) return [];
    const allowed = new Set((catalogo.data?.links ?? []).filter((link) => link.plan_id === plan.id && link.enabled).map((link) => link.feature_id));
    return (catalogo.data?.features ?? []).filter((feature) => feature.active && feature.commercializable && allowed.has(feature.id));
  }, [catalogo.data, plan]);
  const modules = catalogo.data?.modules ?? [];
  const limitDefinitions = useMemo(() => {
    const selectedIds = new Set(availableFeatures.filter((feature) => features.includes(feature.key)).map((feature) => feature.id));
    const allowed = new Set((catalogo.data?.featureLimits ?? []).filter((link) => selectedIds.has(link.feature_id)).map((link) => link.limit_definition_id));
    return (catalogo.data?.limits ?? []).filter((limit) => limit.active && allowed.has(limit.id));
  }, [availableFeatures, catalogo.data, features]);
  const groupedFeatures = useMemo(() => modules.map((module) => ({
    module,
    features: availableFeatures.filter((feature) => feature.module_id === module.id)
      .filter((feature) => !featureSearch.trim() || `${feature.name} ${feature.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(featureSearch.trim().toLocaleLowerCase("pt-BR")))
      .filter((feature) => !onlySelected || features.includes(feature.key)),
  })).filter((group) => group.features.length > 0), [availableFeatures, featureSearch, features, modules, onlySelected]);

  useEffect(() => {
    setDraftId(draft?.id ?? null);
    const nextCurrency = COMMERCIAL_CURRENCIES.some((item) => item.value === draft?.currency)
      ? draft?.currency as CommercialCurrency
      : "BRL";
    const nextPriceCents = centsFromDecimal(draft?.price_amount);
    setPriceCents(nextPriceCents);
    setPriceDisplay(nextPriceCents === null ? "" : formatCommercialMoney(nextPriceCents, nextCurrency));
    setPriceFocused(false);
    setCurrency(nextCurrency);
    setCycle(draft?.billing_cycle ?? "");
    setTrialDays(draft?.trial_days === null || draft?.trial_days === undefined ? "" : String(draft.trial_days));
    setEffectiveFrom(draft?.effective_from ? draft.effective_from.slice(0, 16) : "");
    const parsed = parseStructuredLimits(draft?.limits_snapshot ?? {});
    setLimits(parsed.parsed);
    setLegacyLimits(parsed.legacy);
    const enabledIds = new Set((draft?.features_snapshot ?? []).filter((item) => item.enabled !== false).map((item) => item.feature_id));
    setFeatures(availableFeatures.filter((feature) => enabledIds.has(feature.id)).map((feature) => feature.key));
    setReason("");
    setConfirmation("");
  }, [availableFeatures, draft, planKey]);

  const serializedLimits = serializeStructuredLimits(limits);
  const invalidLimited = Object.values(limits).some((value) => value.state === "limited" &&
    (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0));
  const unknownLegacyLimits = Object.keys(legacyLimits).length > 0;

  const missing = [
    priceCents === null || priceCents <= 0 ? "preço" : null, !cycle ? "ciclo" : null,
    !trialDays ? "período de teste" : null, !effectiveFrom ? "início da vigência" : null,
    invalidLimited || unknownLegacyLimits ? "revisão dos limites" : null, features.length === 0 ? "funcionalidades" : null,
    reason.trim().length < 5 ? "motivo" : null,
  ].filter((item): item is string => Boolean(item));

  const salvarRascunho = () => {
    if (!planKey || reason.trim().length < 5) return;
    salvar.mutate({
      draftId, planKey, priceAmount: priceCents === null ? null : centsToDecimal(priceCents), currency,
      billingCycle: cycle || null, trialDays: trialDays === "" ? null : Number(trialDays),
      limits: serializedLimits, effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
      features: features.map((featureKey) => ({ feature_key: featureKey, enabled: true })), reason: reason.trim(),
      idempotencyKey: saveKey.current,
    }, {
      onSuccess: (id) => { setDraftId(id); saveKey.current = crypto.randomUUID(); toast.success("Rascunho comercial salvo e auditado."); },
      onError: (error) => toast.error(mensagemErroPlataforma(error)),
    });
  };

  const toggleFeature = (featureKey: string, checked: boolean) => {
    if (!checked) {
      const selectedIds = new Set(availableFeatures.filter((feature) => features.includes(feature.key)).map((feature) => feature.id));
      const featureId = availableFeatures.find((feature) => feature.key === featureKey)?.id;
      const dependents = (catalogo.data?.dependencies ?? []).filter((dependency) => dependency.depends_on_feature_id === featureId && selectedIds.has(dependency.feature_id));
      if (dependents.length > 0) return toast.error("Remova primeiro as funcionalidades que dependem desta opção.");
      setFeatures((current) => current.filter((key) => key !== featureKey));
      return;
    }
    const feature = availableFeatures.find((item) => item.key === featureKey);
    const requiredIds = new Set((catalogo.data?.dependencies ?? []).filter((item) => item.feature_id === feature?.id).map((item) => item.depends_on_feature_id));
    const requiredKeys = availableFeatures.filter((item) => requiredIds.has(item.id)).map((item) => item.key);
    setFeatures((current) => [...new Set([...current, featureKey, ...requiredKeys])]);
  };

  const toggleModule = (moduleId: string, checked: boolean) => {
    const keys = availableFeatures.filter((feature) => feature.module_id === moduleId).map((feature) => feature.key);
    setFeatures((current) => checked ? [...new Set([...current, ...keys])] : current.filter((key) => !keys.includes(key)));
  };

  const setLimitState = (key: string, state: LimitState) => setLimits((current) => ({
    ...current,
    [key]: state === "limited" ? { state, value: current[key]?.value } : { state },
  }));

  const atualizarPreco = (value: string) => {
    const parsed = parseCommercialMoney(value);
    if (parsed.kind === "invalid") return;
    setPriceCents(parsed.cents);
    setPriceDisplay(value);
  };

  const focarPreco = () => {
    setPriceFocused(true);
    setPriceDisplay(priceCents === null ? "" : editableCommercialMoney(priceCents, currency));
  };

  const desfocarPreco = () => {
    setPriceFocused(false);
    setPriceDisplay(priceCents === null ? "" : formatCommercialMoney(priceCents, currency));
  };

  const trocarMoeda = (value: CommercialCurrency) => {
    setCurrency(value);
    if (priceCents !== null) {
      setPriceDisplay(priceFocused ? editableCommercialMoney(priceCents, value) : formatCommercialMoney(priceCents, value));
    }
  };

  const publicarRascunho = () => {
    if (!draftId || missing.length > 0 || confirmation !== "PUBLICAR") return;
    publicar.mutate({ draftId, reason: reason.trim(), confirmation, idempotencyKey: publishKey.current }, {
      onSuccess: () => { publishKey.current = crypto.randomUUID(); toast.success("Versão comercial publicada."); setConfirmation(""); },
      onError: (error) => toast.error(mensagemErroPlataforma(error)),
    });
  };

  return (
    <section className="space-y-5" aria-labelledby="versao-editor-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="versao-editor-titulo" className="font-semibold">Preparar versão comercial</h3><p className="text-sm text-muted-foreground">O rascunho não libera funcionalidades nem altera assinaturas.</p></div>
        <Badge variant={draftId ? "secondary" : "outline"}>{draftId ? "Rascunho em edição" : "Novo rascunho"}</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="versao-plano">Plano *</Label><Select value={planKey} onValueChange={setPlanKey}><SelectTrigger id="versao-plano"><SelectValue placeholder="Selecione o plano" /></SelectTrigger><SelectContent>{planos.data?.filter((item) => item.active).map((item) => <SelectItem key={item.id} value={item.key}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2">
          <Label htmlFor="versao-preco">Preço *</Label>
          <Input
            id="versao-preco"
            inputMode="decimal"
            autoComplete="off"
            value={priceDisplay}
            onChange={(event) => atualizarPreco(event.target.value)}
            onFocus={focarPreco}
            onBlur={desfocarPreco}
            placeholder={formatCommercialMoney(5990, currency)}
            aria-invalid={priceCents !== null && priceCents <= 0}
            aria-describedby="versao-preco-ajuda"
          />
          <p id="versao-preco-ajuda" className="text-xs text-muted-foreground">
            {priceCents !== null && priceCents <= 0 ? "Informe um preço maior que zero." : "Use vírgula ou ponto e até duas casas decimais."}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="versao-moeda">Moeda *</Label>
          <Select value={currency} onValueChange={(value) => trocarMoeda(value as CommercialCurrency)}>
            <SelectTrigger id="versao-moeda"><SelectValue /></SelectTrigger>
            <SelectContent>{COMMERCIAL_CURRENCIES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Ciclo *</Label><Select value={cycle} onValueChange={setCycle}><SelectTrigger><SelectValue placeholder="Selecione o ciclo" /></SelectTrigger><SelectContent>{CICLOS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="versao-trial">Dias de teste *</Label><Input id="versao-trial" type="number" min="1" max="365" value={trialDays} onChange={(event) => setTrialDays(event.target.value)} placeholder="Informe o período" /></div>
        <div className="space-y-2"><Label htmlFor="versao-vigencia">Início da vigência *</Label><Input id="versao-vigencia" type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></div>
        <fieldset className="space-y-3 sm:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><legend className="text-sm font-medium">Funcionalidades incluídas *</legend><p className="text-xs text-muted-foreground">{features.length} selecionadas de {availableFeatures.length} disponíveis</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={!availableFeatures.length} onClick={() => setFeatures(availableFeatures.map((feature) => feature.key))}>Selecionar todas</Button><Button type="button" size="sm" variant="ghost" disabled={!features.length} onClick={() => setFeatures([])}>Limpar</Button></div></div>
          <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar funcionalidades" value={featureSearch} onChange={(event) => setFeatureSearch(event.target.value)} placeholder="Buscar funcionalidades" className="pl-9" /></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={onlySelected} onCheckedChange={(checked) => setOnlySelected(checked === true)} />Somente selecionadas</label></div>
          {catalogo.isLoading ? <p className="text-sm text-muted-foreground">Carregando catálogo…</p> : availableFeatures.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma funcionalidade foi aprovada como comercializável para este plano.</p> : <Accordion type="multiple" className="border-y">{groupedFeatures.map(({ module, features: moduleFeatures }) => {
            const selected = moduleFeatures.filter((feature) => features.includes(feature.key)).length;
            const state = selected === 0 ? false : selected === moduleFeatures.length ? true : "indeterminate";
            return <AccordionItem key={module.id} value={module.id}><div className="flex items-center gap-3"><Checkbox aria-label={`Selecionar módulo ${module.name}`} checked={state} onCheckedChange={(checked) => toggleModule(module.id, checked === true)} /><AccordionTrigger className="text-left"><span>{module.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{selected}/{moduleFeatures.length}</span></span></AccordionTrigger></div><AccordionContent><p className="mb-3 text-xs text-muted-foreground">{module.description}</p><div className="grid gap-2 sm:grid-cols-2">{moduleFeatures.map((feature) => <label key={feature.id} className="flex items-start gap-2 rounded-md border p-3 text-sm"><Checkbox className="mt-0.5" checked={features.includes(feature.key)} onCheckedChange={(checked) => toggleFeature(feature.key, checked === true)} /><span><span className="block font-medium">{feature.name}</span>{feature.description && <span className="block text-xs text-muted-foreground">{feature.description}</span>}</span></label>)}</div></AccordionContent></AccordionItem>;
          })}</Accordion>}
        </fieldset>
        <fieldset className="space-y-3 sm:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><legend className="text-sm font-medium">Limites de uso do plano</legend><p className="text-xs text-muted-foreground">{Object.keys(limits).length} limites configurados</p></div><Button type="button" size="sm" variant="outline" disabled={limitDefinitions.length === 0}>Adicionar limite</Button></div>
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar limites" value={limitSearch} onChange={(event) => setLimitSearch(event.target.value)} placeholder="Buscar limites" className="pl-9" /></div>
          {limitDefinitions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma definição real de limite foi cadastrada. Nenhum valor padrão foi inventado.</p> : <div className="space-y-3">{limitDefinitions.filter((limit) => `${limit.name} ${limit.description} ${limit.category}`.toLocaleLowerCase("pt-BR").includes(limitSearch.toLocaleLowerCase("pt-BR"))).map((limit) => <div key={limit.id} className="grid gap-3 border-b pb-3 sm:grid-cols-[1fr_180px_140px]"><div><p className="text-sm font-medium">{limit.name}</p><p className="text-xs text-muted-foreground">{limit.description} · {limit.category} · {limit.unit} · {limit.application}</p></div><Select value={limits[limit.key]?.state ?? "not_included"} onValueChange={(value) => setLimitState(limit.key, value as LimitState)}><SelectTrigger aria-label={`Estado de ${limit.name}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_included">Não incluído</SelectItem><SelectItem value="limited">Incluído com limite</SelectItem><SelectItem value="unlimited">Ilimitado</SelectItem></SelectContent></Select>{limits[limit.key]?.state === "limited" && <Input aria-label={`Valor de ${limit.name}`} type="number" min="0" step={limit.value_type === "integer" ? "1" : "any"} value={limits[limit.key]?.value ?? ""} onChange={(event) => setLimits((current) => ({ ...current, [limit.key]: { state: "limited", value: event.target.value === "" ? undefined : Number(event.target.value) } }))} />}</div>)}</div>}
          {unknownLegacyLimits && <div className="rounded-md border border-destructive p-3"><p className="text-sm font-medium">Rascunho legado requer revisão</p><p className="text-xs text-muted-foreground">Há chaves sem definição no catálogo. Elas foram preservadas e bloqueiam a publicação até serem reconhecidas.</p></div>}
          <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Visualização técnica</summary><pre className="mt-3 max-h-64 overflow-auto text-xs">{JSON.stringify({ ...serializedLimits, ...legacyLimits }, null, 2)}</pre></details>
        </fieldset>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="versao-motivo">Motivo *</Label><Input id="versao-motivo" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo comercial desta revisão" /></div>
      </div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!planKey || reason.trim().length < 5 || salvar.isPending} onClick={salvarRascunho}><FilePenLine className="mr-2 h-4 w-4" />{salvar.isPending ? "Salvando…" : "Salvar rascunho"}</Button></div>
      <div className="border-t pt-5 space-y-3">
        <div className="flex items-start gap-2">{missing.length === 0 ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-muted-foreground" />}<p className="text-sm">{missing.length === 0 ? "Campos comerciais completos." : `Ainda falta: ${missing.join(", ")}.`}</p></div>
        <div className="max-w-sm space-y-2"><Label htmlFor="versao-confirmacao">Digite PUBLICAR para confirmar</Label><Input id="versao-confirmacao" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
        <Button disabled={!draftId || missing.length > 0 || confirmation !== "PUBLICAR" || publicar.isPending} onClick={publicarRascunho}><Send className="mr-2 h-4 w-4" />{publicar.isPending ? "Publicando…" : "Publicar versão"}</Button>
      </div>
    </section>
  );
}