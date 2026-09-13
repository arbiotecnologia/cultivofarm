import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { traduzErroCockpit } from '@/hooks/useEsteiraLaboratorio';

const dialog = readFileSync('src/components/cockpit/GerarLoteDialog.tsx', 'utf8');
const hook = readFileSync('src/hooks/useEsteiraLaboratorio.ts', 'utf8');
const sql = readFileSync('restoration/lotes/sql/20260913040000_lotes_codigo_canonico.sql', 'utf8');

describe('Geração canônica de código de lote — frontend', () => {
  it('não existe gerador de código no navegador', () => {
    expect(dialog).not.toMatch(/generateLotCode/);
    expect(dialog).not.toMatch(/LOT-\$\{/);
  });
  it('o diálogo não mantém nem edita codigo_lote', () => {
    expect(dialog).not.toMatch(/codigo_lote/);
  });
  it('o diálogo informa que o código vem do servidor', () => {
    expect(dialog).toContain('gerado automaticamente pelo sistema');
    expect(dialog).toContain('LT-AAAA-0000');
  });
  it('mantém trava contra clique duplo', () => {
    expect(dialog).toContain('if (saving) return;');
    expect(dialog).toContain('disabled={saving}');
  });
  it('a RPC é chamada sem codigo_lote', () => {
    const trecho = hook.slice(hook.indexOf('rpc_cockpit_gerar_lote_v1'), hook.indexOf('rpc_cockpit_gerar_lote_v1') + 900);
    expect(trecho).not.toMatch(/codigo_lote:/);
    expect(trecho).toContain('produto_id: loteData.produto_id');
  });
  it('usa exclusivamente o código devolvido pelo servidor', () => {
    expect(hook).toContain("codigo_lote: data?.codigo_lote");
  });
  it('idempotência: replay não é tratado como novo lote', () => {
    expect(hook).toContain('if (data?.replay)');
  });
  it('traduz conflito, recusa de código e permissão', () => {
    expect(traduzErroCockpit('COCKPIT_LOTE_CODIGO_CONFLITO')).toMatch(/ao mesmo tempo/);
    expect(traduzErroCockpit('COCKPIT_LOTE_CODIGO_NAO_ACEITO')).toMatch(/definido pelo servidor/);
    expect(traduzErroCockpit('COCKPIT_FORBIDDEN')).toMatch(/autorização/);
  });
  it('erro desconhecido não é silenciado', () => {
    expect(traduzErroCockpit('falha de rede')).toBe('falha de rede');
  });
});

describe('Contrato SQL preparado (não aplicado)', () => {
  it('é transacional e não destrutivo', () => {
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
    const executavel = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(executavel).not.toMatch(/CASCADE|TRUNCATE|DROP\s+(TABLE|FUNCTION|POLICY)/i);
    expect(executavel).not.toMatch(/\bDELETE FROM\b|\bUPDATE public\./i);
  });
  it('exige confirmação explícita do destino canônico', () => {
    expect(sql).toContain("app.audit_target_ref");
    expect(sql).toContain('swzpzcwiasxmjutrmvkm');
    expect(sql).toContain('lotes_target_not_confirmed');
  });
  it('aborta sem pré-condições estruturais', () => {
    for (const codigo of ['lotes_tabela_ausente', 'lotes_funcao_codigo_ausente', 'lotes_rpc_assinatura_divergente', 'lotes_unique_codigo_ausente']) {
      expect(sql).toContain(codigo);
    }
  });
  it('usa advisory lock por ano antes do cálculo sequencial', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.gerar_codigo_lote'), sql.indexOf('REVOKE ALL ON FUNCTION public.gerar_codigo_lote'));
    expect(fn.indexOf("pg_advisory_xact_lock(hashtext('gerar_codigo_lote:")).toBeGreaterThan(-1);
    expect(fn.indexOf('pg_advisory_xact_lock')).toBeLessThan(fn.indexOf('SELECT COALESCE(MAX'));
    expect(fn).toContain("'LT-' || _ano::text || '-'");
    expect(fn).toContain("lpad(v_next::text, 4, '0')");
  });
  it('rejeita código vindo do cliente e preserva trava/idempotência por programação', () => {
    expect(sql).toContain('COCKPIT_LOTE_CODIGO_NAO_ACEITO');
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('cockpit_lote:");
    expect(sql).toContain("'replay', true");
    expect(sql).toContain('fn_cockpit_assert_operador_origem');
    expect(sql).toContain('COCKPIT_LOTE_CODIGO_CONFLITO');
  });
  it('mantém search_path fixo e grants mínimos', () => {
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.gerar_codigo_lote(integer) FROM PUBLIC, anon;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon;');
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
