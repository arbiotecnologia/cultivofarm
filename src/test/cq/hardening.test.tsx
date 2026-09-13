import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { validarPeriodo, avaliarFaixa, avaliarMinimo, selecionarReferencia } from '@/lib/cq/consulta';
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
vi.mock('@/components/AuxiliaryScreenBanner', () => ({ AuxiliaryScreenBanner: () => null }));
import ControleQualidade from '@/pages/ControleQualidade';
const sql = readFileSync('restoration/controle-qualidade/sql/20260913050000_cq_hardening.sql', 'utf8');
describe('CQ hardening local — sem banco', () => {
  it.each([['','',true],['2026-09-13','2026-09-13',true],['2026-09-14','2026-09-13',false],['2026-02-30','',false]])('período %s / %s', (a,b,ok) => expect(validarPeriodo(a,b).valido).toBe(ok));
  it('erro imediato associado aos campos, sem vazio enganoso nem nova consulta', async () => {
    from.mockImplementation(() => { const q: any = {}; for (const k of ['select','order','range','eq']) q[k] = () => q; q.abortSignal = () => Promise.resolve({data:[],error:null}); return q; });
    render(<MemoryRouter><ControleQualidade /></MemoryRouter>);
    await screen.findByText(/Nenhuma análise encontrada/);
    const count = from.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Análise a partir de'), {target:{value:'2026-09-14'}});
    fireEvent.change(screen.getByLabelText('Análise até'), {target:{value:'2026-09-13'}});
    expect(screen.getByRole('alert').textContent).toContain('posterior');
    expect(screen.getByLabelText('Análise até').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText(/Nenhuma análise encontrada/)).toBeNull();
    expect(screen.queryByLabelText('Paginação de análises')).toBeNull();
    expect(from.mock.calls.length).toBe(count);
    fireEvent.change(screen.getByLabelText('Análise até'), {target:{value:'2026-09-14'}});
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText(/Nenhuma referência ativa acessível/)).toBeTruthy();
  });
  it('zero e limites inclusivos; ausência de referência nunca conforme', () => {
    expect(avaliarFaixa(0,0,14)).toBe('conforme'); expect(avaliarFaixa(14,0,14)).toBe('conforme');
    expect(avaliarMinimo(0,0)).toBe('conforme'); expect(selecionarReferencia([], 'm','p')).toBeNull();
    expect(avaliarMinimo(0,null)).toBe('indeterminado');
  });
  it('ACL mínima, invoker e ordenação mantida, sem alterar RLS', () => {
    expect(sql).toContain('REVOKE TRUNCATE, TRIGGER, REFERENCES');
    expect(sql).toContain('ALTER FUNCTION public.fn_cq_ultimo_resultado(uuid) SECURITY INVOKER');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.fn_validate_envase_cq() FROM PUBLIC, anon, authenticated');
    expect(sql).not.toMatch(/DISABLE ROW LEVEL|ENABLE ROW LEVEL|DROP POLICY|CREATE POLICY|ALTER POLICY/);
    const canonical = readFileSync('supabase/migrations/20260901000000_cq_ordem_canonica.sql','utf8');
    expect(canonical).toContain('ORDER BY cq.created_at DESC, cq.seq DESC');
  });
  it('SQL aplicavel NAO cria a regra de reanalise (NO-GO) e nao traz metacomandos psql', () => {
    expect(sql).not.toMatch(/fn_cq_bloquear_reanalise_liberada/);
    expect(sql).not.toMatch(/trg_cq_bloquear_reanalise_liberada/);
    expect(sql).not.toMatch(/CQ_REANALISE_BLOQUEADA/);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
    expect(sql).not.toMatch(/CREATE TRIGGER/i);
    expect(sql).not.toMatch(/^\\(set|pset|o)\b/m);
    expect(sql).not.toMatch(/current_setting\('lovable\.project_ref'/);
    expect(sql).toContain('swzpzcwiasxmjutrmvkm');
  });
  it('idempotente, sem DML e com pos-check explicito', () => {
    expect(sql.replace(/--[^\n]*/g, '')).not.toMatch(/(?:^|;)\s*(INSERT|DELETE|TRUNCATE|UPDATE)\b/im);
    expect(sql).toContain('IF NOT EXISTS (SELECT 1 FROM pg_constraint');
    expect(sql).toContain('dangerous_grants_remaining');
    expect(sql).toContain('CQ_RLS_ALTERADA');
    expect(sql).toContain('has_table_privilege');
    expect(sql).toContain('tgenabled');
  });
  it('checks finitos, pré/pós e definição homônima verificada', () => {
    expect(sql).toContain("NOT IN ('NaN','Infinity','-Infinity')");
    expect(sql).toContain('ph BETWEEN 0 AND 14'); expect(sql).toContain('concentracao >= 0');
    expect(sql).toContain('ph_min <= ph_max'); expect(sql).toContain('concentracao_min_ufc_ml >= 0');
    expect(sql).toContain('ph_min BETWEEN 0 AND 14');
    expect(sql).toContain('pg_get_constraintdef');
    expect(sql).toContain('CQ_CHECK_DEFINICAO_DIVERGENTE');
    expect(sql).toContain('CQ_HELPER_AUTHENTICATED_ACL');
  });
});
