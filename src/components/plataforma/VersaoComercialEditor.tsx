import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FilePenLine, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const [limits, setLimits] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const saveKey = useRef(crypto.randomUUID());
  const publishKey = useRef(crypto.randomUUID());

  const plan = planos.data?.find((item) => item.key === planKey);
  const draft = versoes.data?.find((item) => item.plan_id === plan?.id && item.status === "DRAFT");
  const availableFeatures = useMemo(() => {
    if (!plan) return [];
    const allowed = new Set((catalogo.data?.links ?? []).filter((link) => link.plan_id === plan.id && link.enabled).map((link) => link.feature_id));
    return (catalogo.data?.features ?? []).filter((feature) => feature.active && allowed.has(feature.id));
  }, [catalogo.data, plan]);

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
    setLimits(draft ? JSON.stringify(draft.limits_snapshot, null, 2) : "");
    const enabledIds = new Set((draft?.features_snapshot ?? []).filter((item) => item.enabled !== false).map((item) => item.feature_id));
    setFeatures(availableFeatures.filter((feature) => enabledIds.has(feature.id)).map((feature) => feature.key));
    setReason("");
    setConfirmation("");
  }, [availableFeatures, draft, planKey]);

  let parsedLimits: Record<string, unknown> | null = null;
  try {
    const value = limits.trim() ? JSON.parse(limits) : null;
    if (value && typeof value === "object" && !Array.isArray(value)) parsedLimits = value as Record<string, unknown>;
  } catch { parsedLimits = null; }

  const missing = [
    priceCents === null || priceCents <= 0 ? "preço" : null, !cycle ? "ciclo" : null,
    !trialDays ? "período de teste" : null, !effectiveFrom ? "início da vigência" : null,
    !parsedLimits ? "limites" : null, features.length === 0 ? "funcionalidades" : null,
    reason.trim().length < 5 ? "motivo" : null,
  ].filter((item): item is string => Boolean(item));

  const salvarRascunho = () => {
    if (!planKey || reason.trim().length < 5) return;
    salvar.mutate({
      draftId, planKey, priceAmount: priceCents === null ? null : centsToDecimal(priceCents), currency,
      billingCycle: cycle || null, trialDays: trialDays === "" ? null : Number(trialDays),
      limits: parsedLimits ?? {}, effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
      features: features.map((featureKey) => ({ feature_key: featureKey, enabled: true })), reason: reason.trim(),
      idempotencyKey: saveKey.current,
    }, {
      onSuccess: (id) => { setDraftId(id); saveKey.current = crypto.randomUUID(); toast.success("Rascunho comercial salvo e auditado."); },
      onError: (error) => toast.error(mensagemErroPlataforma(error)),
    });
  };

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
        <div className="space-y-2"><Label>Plano *</Label><Select value={planKey} onValueChange={setPlanKey}><SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger><SelectContent>{planos.data?.filter((item) => item.active).map((item) => <SelectItem key={item.id} value={item.key}>{item.name}</SelectItem>)}</SelectContent></Select></div>
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
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="versao-limites">Limites de uso do plano *</Label>
          <p id="versao-limites-ajuda" className="text-xs text-muted-foreground">Defina os limites incluídos no plano, como quantidade de usuários, unidades ou recursos.</p>
          <Textarea id="versao-limites" value={limits} onChange={(event) => setLimits(event.target.value)} placeholder={'{"usuarios": 10, "unidades": 2}'} aria-invalid={limits.trim().length > 0 && !parsedLimits} aria-describedby="versao-limites-ajuda versao-limites-erro" />
          {limits.trim().length > 0 && !parsedLimits && <p id="versao-limites-erro" className="text-xs text-destructive">Confira o formato dos limites de uso.</p>}
        </div>
        <fieldset className="space-y-3 sm:col-span-2"><legend className="text-sm font-medium">Funcionalidades incluídas *</legend>{availableFeatures.length === 0 ? <p className="text-sm text-muted-foreground">Selecione um plano com funcionalidades cadastradas.</p> : <div className="grid gap-2 sm:grid-cols-2">{availableFeatures.map((feature) => <label key={feature.id} className="flex items-center gap-2 rounded-md border p-3 text-sm"><Checkbox checked={features.includes(feature.key)} onCheckedChange={(checked) => setFeatures((current) => checked ? [...current, feature.key] : current.filter((key) => key !== feature.key))} /><span>{feature.name}</span></label>)}</div>}</fieldset>
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