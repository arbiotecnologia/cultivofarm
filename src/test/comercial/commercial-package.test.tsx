import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { assignmentApplies, validateSimulation, validatePlan } from '@/lib/comercial/validation';
const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), reset: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [{ id: 'partner', razao_social: 'Parceiro' }] }) }));
vi.mock('@/hooks/useSimulateB2BPaymentPlan', () => ({ useSimulateB2BPaymentPlan: () => mocks }));
vi.mock('@/hooks/useCommercialPaymentPlans', () => ({ useCommercialPaymentPlans: () => ({ data: [{ id: 'plan', name: 'Plano', max_days: 0 }] }) }));
vi.mock('@/hooks/useCommercialConditions', async importOriginal => ({ ...await importOriginal<typeof import('@/hooks/useCommercialConditions')>(), usePlanAssignments: () => ({ data: [{ id: 'assignment', plan_id: 'plan', status: 'published', buyer_scope: 'partner', partner_id: 'partner', valid_from: '2020-01-01' }] }) }));
vi.mock('@/hooks/useCatalogoUnificado', () => ({ useCatalogoUnificado: () => ({ data: [{ id: 'item', tipo: 'produto', nome: 'Produto', ativo: true, b2b_enabled: true, ficha_status: 'aprovado' }] }) }));
vi.mock('@/components/ui/select', () => ({
 Select: ({ children, value, onValueChange, disabled }: any) => <select aria-label="opção" value={value} onChange={e => onValueChange(e.target.value)} disabled={disabled}><option value="" />{children}</select>,
 SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: any) => <>{children}</>, SelectItem: ({ children, value, disabled }: any) => <option value={value} disabled={disabled}>{children}</option>,
}));
import Simulator from '@/pages/comercial/SimuladorComercial';
const form = { partner: 'p', plan: 'p', item: 'i', unit: 'hectare' as const, quantity: '1', volume: '', due: '' };
const plan = { name: 'n', code: 'c', plan_type: 'cash', interest_type: 'none', pricing_mode: 'discount_from_base', discount_percent: 0, monthly_interest_percent: 0, max_days: 0, months_count: 0, installment_count: 1, requires_credit_approval: false, requires_guarantee: false, requires_financial_approval: false };
const response = { quote_required: false, amounts: { table_amount: 10, discount_amount: 0, net_amount_after_discount: 10, financial_interest_amount: 0, final_amount: 10 }, schedule: [], warnings: [] };
function complete() { const selects = screen.getAllByRole('combobox'); ['partner', 'plan', 'produto:item'].forEach((v, i) => fireEvent.change(selects[i], { target: { value: v } })); }
beforeEach(() => vi.clearAllMocks());
describe('simulador', () => {
 it.each(['0', '-1', 'Infinity', 'NaN', ''])('rejeita quantidade %s', quantity => expect(validateSimulation({ ...form, quantity }).quantity).toBeTruthy());
 it('bloqueia envio incompleto', () => { render(<Simulator />); expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled(); });
 it('mostra erro de RPC', async () => { mocks.mutateAsync.mockRejectedValue({ message: 'regra ausente' }); render(<Simulator />); complete(); fireEvent.click(screen.getByRole('button', { name: 'Simular' })); expect(await screen.findByText(/Não foi possível simular/)).toBeInTheDocument(); expect(screen.queryByText(/regra ausente/)).toBeNull(); });
 it('invalida resultado e usa payload canônico', async () => { mocks.mutateAsync.mockResolvedValue(response); render(<Simulator />); complete(); fireEvent.click(screen.getByRole('button', { name: 'Simular' })); await screen.findByRole('region', { name: 'Resultado' }); expect(mocks.mutateAsync.mock.calls[0][0].items[0].quantidade).toBe(1); fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } }); expect(screen.queryByRole('region', { name: 'Resultado' })).toBeNull(); });
 it('descarta resposta atrasada após edição', async () => { let resolve: (x: any) => void = () => {}; mocks.mutateAsync.mockImplementation(() => new Promise(r => { resolve = r; })); render(<Simulator />); complete(); fireEvent.click(screen.getByRole('button', { name: 'Simular' })); fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } }); resolve(response); await waitFor(() => expect(screen.getByRole('button', { name: 'Simular' })).toBeEnabled()); expect(screen.queryByRole('region', { name: 'Resultado' })).toBeNull(); });
});
describe('validação de planos', () => {
 it('aceita plano válido', () => expect(validatePlan(plan)).toEqual({}));
 it.each([['name', ''], ['code', ' '], ['discount_percent', 101], ['monthly_interest_percent', -1], ['installment_count', 0], ['installment_count', 1.5], ['max_days', 1096], ['months_count', 61], ['minimum_order_amount', -1], ['valid_until', 'invalid']])('rejeita %s = %s', (key, value) => expect(validatePlan({ ...plan, [key]: value })[key]).toBeTruthy());
});
describe('contratos de segurança e paridade', () => {
 const read = (p: string) => readFileSync(p, 'utf8');
 it('usa somente motor canônico, sem custo fictício', () => { expect(read('src/hooks/useSimulateB2BPaymentPlan.ts')).toContain('"simulate_b2b_payment_plan_secure"'); const src = read('src/pages/comercial/SimuladorComercial.tsx') + read('src/hooks/useCommercial.ts'); expect(src).not.toMatch(/rpc_commercial_simulator|useCommercialSimulator|custo_estimado|0\.55|margem_pct/); });
 it('compartilha publicar e arquivar no mobile e desktop', () => { const src = read('src/components/comercial/AtribuicoesPlanosTab.tsx'); expect(src.match(/\{assignmentActions\(a\)\}/g)).toHaveLength(2); expect(src).toContain('confirm("Publicar esta atribuição?'); expect(src).toContain('Motivo do arquivamento:'); });
 it('seleção móvel e exclusão confirmada', () => { const src = read('src/components/comercial/MatrizConfiguravelTab.tsx'); expect(src).toContain('matrix-mobile-all'); expect(src).toContain('matrix-mobile-${i.id}'); expect(src.match(/deleteDraft\(i.id\)/g)).toHaveLength(2); expect(src).toContain('confirm("Excluir este rascunho?'); expect(src).toContain('confirm(`Publicar'); });
 it('migration revoga assinatura exata, não remove função/dados e verifica dependências', () => { const sql = read('supabase/migrations/20260912033537_commercial_simulator_hardening_v1.sql'); expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role;'); expect(sql).toContain('SET search_path = public, pg_temp;'); expect(sql).toContain('legacy_dependencies_present'); expect(sql).toContain('simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)'); expect(sql).not.toMatch(/^\s*(DROP|DELETE|UPDATE|INSERT|GRANT)\s/im); });
});

 describe('atribuições e acessibilidade finais', () => {
 const now = Date.parse('2026-09-12T12:00:00Z');
 const a = { id: 'a', plan_id: 'p', status: 'published' as const, buyer_scope: 'partner' as const, partner_id: 'p', customer_id: null, valid_from: '2026-09-01', valid_until: '2026-09-12', motivo: null, published_at: null, created_at: '' };
 it('inclui o último dia de vigência', () => expect(assignmentApplies(a, 'p', now)).toBe(true));
 it('aceita default publicado sem destinatário específico', () => expect(assignmentApplies({ ...a, buyer_scope: 'default', partner_id: null }, 'p', now)).toBe(true));
 it.each([{ status: 'draft' }, { status: 'archived' }, { partner_id: 'other' }, { customer_id: 'other' }, { valid_from: '2026-09-13' }, { valid_until: '2026-09-11' }, { valid_until: 'invalid' }, { valid_from: '2026-02-30' }, { buyer_scope: 'producer' }, { buyer_scope: 'default' }])('rejeita atribuição inelegível %j', patch => expect(assignmentApplies({ ...a, ...patch } as typeof a, 'p', now)).toBe(false));
 it('não aceita parceiro vazio', () => expect(assignmentApplies(a, '', now)).toBe(false));
 it('não bloqueia navegação e marca todos os erros', () => {
 const source = readFileSync('src/pages/comercial/SimuladorComercial.tsx', 'utf8');
 expect(source).not.toContain('useUnsavedChanges');
 for (const field of ['partner', 'plan', 'item', 'quantity', 'volume', 'due']) expect(source).toContain(`aria-invalid={!!errors.${field}}`);
 expect(source).toContain('assignmentApplies(a, form.partner)');
 });
 });
