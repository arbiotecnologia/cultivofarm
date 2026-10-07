import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261007131828_9007da9a-6dad-4793-a0b3-b02e73c03d15.sql', 'utf8');
const proof = readFileSync('supabase/tests/certificacao-b2b-fase1/01-abc-rollback.sql', 'utf8');

describe('Fase 1 B2B — crédito usa escopo canônico', () => {
  it.each(['rpc_b2b_partner_credit', 'rpc_b2b_credit_exposure'])('%s autoriza antes do cálculo', (name) => {
    const start = sql.indexOf(`FUNCTION public.${name}`);
    const body = sql.slice(start, sql.indexOf('$function$;', start));
    expect(body).toContain('SET search_path = public, pg_temp');
    expect(body.indexOf('assert_b2b_partner_scope')).toBeLessThan(body.indexOf('RETURN public.fn_b2b_credit_exposure'));
    expect(body).not.toContain('v_ok');
  });
  it('fecha o helper direto para usuário e anônimo', () => {
    expect(sql).toContain('public.fn_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('public.fn_b2b_credit_exposure(uuid,numeric,uuid) TO service_role');
  });
  it('valida valor e vínculo do pedido excluído no servidor', () => {
    expect(sql).toContain('p_new_order_amount < 0');
    expect(sql).toContain("('NaN','Infinity','-Infinity')");
    expect(sql).toContain('po.id=p_exclude_order_id AND po.partner_id=p_partner_id');
  });
  it('prova A/B/C desfaz tudo e não consome sequências nem transmite documentos', () => {
    expect(proof).toContain("RAISE EXCEPTION 'CERT_B2B_F1_ROLLBACK:%'");
    expect(proof).toContain('SET LOCAL ROLE authenticated');
    expect(proof).toContain("'A_cross_partner'");
    expect(proof).toContain("'B_cross_partner'");
    expect(proof).toContain("'C_exposure'");
    expect(proof).not.toMatch(/PERFORM public\.(create_partner_order_secure|publish_planning_to_lab)/);
  });
});