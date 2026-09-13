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
    expect(sql).not.toMatch(/DISABLE ROW LEVEL|DROP POLICY|CREATE POLICY/);
    const canonical = readFileSync('supabase/migrations/20260901000000_cq_ordem_canonica.sql','utf8');
    expect(canonical).toContain('ORDER BY cq.created_at DESC, cq.seq DESC');
  });
  it('contrato conservador: toda reanálise após aprovação aborta antes de qualquer escrita de status', () => {
    const body = sql.split('AS $fn$')[1].split('$fn$;')[0];
    expect(body).toContain('auth.uid() IS NULL'); expect(body).toContain('fn_onfarm_scope_lote(NEW.lote_id)');
    expect(body).toContain('LOCK TABLE public.controle_qualidade IN SHARE ROW EXCLUSIVE MODE');
    expect(body).toContain("resultado::text='aprovado'");
    expect(body).toContain("RAISE EXCEPTION 'CQ_REANALISE_BLOQUEADA");
    expect(body.indexOf('CQ_REANALISE_BLOQUEADA')).toBeLessThan(body.indexOf('RETURN NEW'));
    expect(body).not.toMatch(/UPDATE public\.|DELETE FROM|INSERT INTO/);
    expect(sql).toContain('BEFORE INSERT OR UPDATE');
  });
  it('checks finitos, pré/pós e rollback capturado', () => {
    expect(sql).toContain("NOT IN ('NaN','Infinity','-Infinity')");
    expect(sql).toContain('ph BETWEEN 0 AND 14'); expect(sql).toContain('concentracao >= 0');
    expect(sql).toContain('ph_min <= ph_max'); expect(sql).toContain('concentracao_min_ufc_ml >= 0');
    expect(sql).toContain('cq-hardening-rollback.sql'); expect(sql).toContain('pg_get_functiondef');
    expect(sql).toContain('has_table_privilege'); expect(sql).toContain('tgenabled');
  });
});
