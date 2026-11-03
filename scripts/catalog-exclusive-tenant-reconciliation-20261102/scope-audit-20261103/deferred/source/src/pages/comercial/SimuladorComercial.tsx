import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSimulateB2BPaymentPlan, type SimulateResult } from '@/hooks/useSimulateB2BPaymentPlan';
import { useCommercialPaymentPlans } from '@/hooks/useCommercialPaymentPlans';
import { conditionErrorMessage, usePlanAssignments } from '@/hooks/useCommercialConditions';
import { useCatalogoUnificado } from '@/hooks/useCatalogoUnificado';
import { validateSimulation, assignmentApplies, type SimulationForm } from '@/lib/comercial/validation';
import { PaymentSimulationSummary } from '@/components/comercial/PaymentSimulationSummary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { brl } from '@/lib/financial/format';
import { catalogFamilyLabel } from '@/lib/catalogo/catalogFamilyRead';
import { PAYMENT_METHODS, requirePaymentChoice, paymentPlanAvailable, type PaymentMethod } from '@/lib/comercial/paymentContract';
import { usePaymentConditionCapability } from '@/hooks/usePaymentConditionCapability';

export default function SimuladorComercial() {
  const sim = useSimulateB2BPaymentPlan();
  const plans = useCommercialPaymentPlans();
  const assignments = usePlanAssignments('published');
  const catalog = useCatalogoUnificado('interno');
  const partners = useQuery({ queryKey: ['partner-accounts-active-sim'], queryFn: async () => {
    const { data, error } = await supabase.from('partner_accounts').select('id, razao_social').eq('ativo', true).order('razao_social');
    if (error) throw error;
    return data ?? [];
  }});
  const [form, setForm] = useState<SimulationForm>({ partner: '', plan: '', item: '', unit: 'hectare', quantity: '1', volume: '', due: '' });
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [failure, setFailure] = useState('');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const capability = usePaymentConditionCapability(form.partner || null, Boolean(form.partner));
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  const busy = useRef(false);
  const availablePlans = (plans.data ?? []).filter(p => (assignments.data ?? []).some(a => a.plan_id === p.id && assignmentApplies(a, form.partner)));
  const plan = availablePlans.find(p => p.id === form.plan);
  let paymentChoice = null;
  if (capability.data && !capability.isError && plan?.payment_contract === 'B2B_PAYMENT_CONDITION_V1' && method && plan.payment_methods?.includes(method) && plan.pricing_mode && paymentPlanAvailable({...plan,pricing_mode:plan.pricing_mode,payment_method:method})) {
    try { paymentChoice = requirePaymentChoice({payment_method:method,payment_condition_version:plan.version,payment_deadline_days:plan.payment_deadline_days}); } catch { /* no configured choice */ }
  }
  const items = (catalog.data ?? []).filter(i => i.ativo && i.b2b_enabled);
  const item = items.find(i => `${i.tipo}:${i.id}` === form.item);
  const needsDate = Boolean(plan && plan.max_days > 0 && plan.pricing_mode !== 'quote_only');
  const errors = validateSimulation(form, needsDate);
  if (form.plan && !plan) errors.plan = 'Esta condição não está disponível para o parceiro.';
  if (form.item && (!item || item.ficha_status !== 'aprovado')) errors.item = 'O item não possui ficha técnica aprovada.';
  if (form.partner && !partners.data?.some(p => p.id === form.partner)) errors.partner = 'Parceiro indisponível.';
  const queries = [partners, plans, assignments, catalog];
  const loading = queries.some(q => q.isLoading);
  const loadError = queries.find(q => q.isError)?.error;
  function change<K extends keyof SimulationForm>(key: K, value: SimulationForm[K]) {
    revision.current += 1;
    setResult(null); setFailure(''); sim.reset();
    setForm(f => ({ ...f, [key]: value, ...(key === 'partner' ? { plan: '', due: '' } : {}), ...(key === 'plan' ? { due: '' } : {}) }));
  }
  async function simulate() {
    if (busy.current || loading || loadError || Object.keys(errors).length || !item || !plan || !paymentChoice) return;
    busy.current = true; setPending(true); setResult(null); setFailure('');
    const requestRevision = revision.current;
    try {
      const data = await sim.mutateAsync({ partner_id: form.partner, payment_plan_id: form.plan,
        payment_choice: paymentChoice,
        items: [{ item_id: item.id, item_tipo: item.tipo, quantidade: Number(form.quantity), unidade_medida: form.unit, volume_ml: form.unit === 'unidade' ? Number(form.volume) : null }],
        first_due_date: needsDate ? form.due : null });
      if (requestRevision === revision.current) setResult(data);
    } catch (e) {
      const raw = e && typeof e === 'object' && 'message' in e ? String(e.message) : '';
      const mapped = conditionErrorMessage(raw);
      if (requestRevision === revision.current) setFailure(mapped !== raw ? mapped : 'Não foi possível simular. Revise os parâmetros e tente novamente.');
    } finally { busy.current = false; setPending(false); }
  }
  const errorFor = (key: string) => errors[key] ? <p id={`sim-${key}-error`} role="alert" className="text-sm text-destructive">{errors[key]}</p> : null;
  return <main className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
    <h1 className="text-2xl font-bold">Simulador Comercial</h1>
    {loading && <p role="status">Carregando opções…</p>}
    {loadError && <div role="alert"><p>Não foi possível carregar as opções da simulação.</p><Button variant="outline" onClick={() => queries.forEach(q => void q.refetch())}>Tentar novamente</Button></div>}
    {!loading && !loadError && <form onSubmit={e => { e.preventDefault(); void simulate(); }} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div><Label htmlFor="sim-partner">Parceiro</Label><Select value={form.partner} onValueChange={v => change('partner', v)}><SelectTrigger id="sim-partner" aria-invalid={!!errors.partner} aria-describedby="sim-partner-error"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{partners.data?.map(p => <SelectItem key={p.id} value={p.id}>{p.razao_social}</SelectItem>)}</SelectContent></Select>{errorFor('partner')}{!partners.data?.length && <p>Nenhum parceiro ativo.</p>}</div>
        <div><Label htmlFor="sim-plan">Condição de pagamento</Label><Select value={form.plan} onValueChange={v => change('plan', v)} disabled={!form.partner}><SelectTrigger id="sim-plan" aria-invalid={!!errors.plan} aria-describedby="sim-plan-error"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{availablePlans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>{errorFor('plan')}{form.partner && !availablePlans.length && <p>Nenhuma condição publicada e vigente para este parceiro.</p>}</div>
        <div className="md:col-span-2"><Label htmlFor="sim-item">Produto ou microrganismo</Label><Select value={form.item} onValueChange={v => change('item', v)}><SelectTrigger id="sim-item" aria-invalid={!!errors.item} aria-describedby="sim-item-error"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{items.map(i => <SelectItem key={`${i.tipo}:${i.id}`} value={`${i.tipo}:${i.id}`} disabled={i.ficha_status !== 'aprovado'}>{i.nome} · {catalogFamilyLabel(i)}{i.ficha_status !== 'aprovado' ? ' — ficha não aprovada' : ''}</SelectItem>)}</SelectContent></Select>{errorFor('item')}{!items.length && <p>Nenhum item B2B ativo.</p>}</div>
        <div><Label htmlFor="sim-unit">Unidade</Label><Select value={form.unit} onValueChange={v => change('unit', v as SimulationForm['unit'])}><SelectTrigger id="sim-unit"><SelectValue /></SelectTrigger><SelectContent>{(['hectare', 'litro', 'dose', 'unidade'] as const).map(u => <SelectItem key={u} value={u}>{u === 'unidade' ? 'Volume comercial' : u}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="sim-quantity">Quantidade</Label><Input id="sim-quantity" type="number" step="any" value={form.quantity} aria-invalid={!!errors.quantity} aria-describedby="sim-quantity-error" onChange={e => change('quantity', e.target.value)} />{errorFor('quantity')}</div>
        {form.unit === 'unidade' && <div><Label htmlFor="sim-volume">Volume (mL)</Label><Input id="sim-volume" type="number" step="any" value={form.volume} aria-invalid={!!errors.volume} aria-describedby="sim-volume-error" onChange={e => change('volume', e.target.value)} />{errorFor('volume')}</div>}
        {needsDate && <div><Label htmlFor="sim-due">Primeiro vencimento</Label><Input id="sim-due" type="date" value={form.due} aria-invalid={!!errors.due} aria-describedby="sim-due-error" onChange={e => change('due', e.target.value)} />{errorFor('due')}</div>}
      </div>
      {plan?.pricing_mode === 'quote_only' && <p role="status">Sob consulta — esta condição exige cotação.</p>}
      <div><Label htmlFor="simulation-payment-method">Forma de pagamento</Label><Select value={method ?? ''} onValueChange={v=>{revision.current++;setResult(null);setMethod(v as PaymentMethod);}} disabled={!capability.data || capability.isError}><SelectTrigger id="simulation-payment-method"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_METHODS).map(([value,label])=><SelectItem key={value} value={value} disabled={!plan?.payment_methods?.includes(value as PaymentMethod)}>{label}</SelectItem>)}</SelectContent></Select></div>
      {!capability.data || capability.isError ? <p role="status">Condições de pagamento indisponíveis neste ambiente.</p> : null}
      <Button type="submit" disabled={pending || !paymentChoice || Object.keys(errors).length > 0}>{pending ? 'Calculando…' : 'Simular'}</Button>
    </form>}
    {failure && <p role="alert" className="text-destructive">{failure}</p>}
    {result && <section aria-label="Resultado" className="space-y-3 border-t pt-4">
      <h2 className="text-lg font-semibold">Resultado</h2>
      {result.items?.map((line, index) => <div key={`${line.item_tipo}:${line.item_id}:${index}`} className="border-b py-2 text-sm space-y-1">
        <p className="font-medium">{line.nome || item?.nome || line.item_id} · {line.quantidade} {line.unidade_medida}</p>
        <p>Origem: {line.price_source ?? 'Sob consulta'} · Modo: {line.pricing_mode ?? 'Sob consulta'}</p>
        {line.quote_required ? <p>Sob consulta — exige cotação.</p> : <p>Unitário: {line.unit_price == null ? '—' : brl(line.unit_price)} · Subtotal: {line.subtotal == null ? '—' : brl(line.subtotal)}</p>}
        {line.reason_code && <p>{line.reason_code}</p>}
      </div>)}
      <PaymentSimulationSummary simulation={result} />
      {!result.quote_required && <p className="font-semibold">Total final: {brl(result.amounts.final_amount)}</p>}
    </section>}
  </main>;
}
