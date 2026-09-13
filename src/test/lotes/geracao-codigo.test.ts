import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { traduzErroCockpit } from '@/hooks/useEsteiraLaboratorio';

const dialog = readFileSync('src/components/cockpit/GerarLoteDialog.tsx', 'utf8');
const hook = readFileSync('src/hooks/useEsteiraLaboratorio.ts', 'utf8');
const sql = readFileSync('restoration/lotes/sql/20260913040000_lotes_codigo_canonico.sql', 'utf8');
const rpc = sql.slice(sql.indexOf('FUNCTION public.rpc_cockpit_gerar_lote_v1'));
const chamada = hook.slice(hook.indexOf('rpc_cockpit_gerar_lote_v1'), hook.indexOf('rpc_cockpit_gerar_lote_v1') + 900);

describe('Geração canônica de código de lote — frontend', () => {
  it('não existe gerador de código no navegador', () => {
    expect(dialog).not.toMatch(/generateLotCode/);
    expect(dialog).not.toMatch(/LOT-\$\{/);
  });
  it('o diálogo não mantém nem edita codigo_lote', () => {
    expect(dialog).not.toMatch(/codigo_lote/);
  });
  it('o diálogo não envia produto nem microrganismo', () => {
    expect(dialog).not.toMatch(/produto_id: target/);
    expect(dialog).not.toMatch(/microrganismo_id: target/);
  });
  it('o diálogo informa que o código vem do servidor', () => {
    expect(dialog).toContain('gerado automaticamente pelo sistema');
    expect(dialog).toContain('LT-AAAA-0000');
  });
  it('mantém trava contra clique duplo', () => {
    expect(dialog).toContain('if (saving) return;');
    expect(dialog).toContain('disabled={saving}');
  });
  it('a RPC é chamada sem codigo_lote, produto_id e microrganismo_id', () => {
    expect(chamada).not.toMatch(/codigo_lote:/);
    expect(chamada).not.toMatch(/produto_id:/);
    expect(chamada).not.toMatch(/microrganismo_id:/);
    expect(chamada).toContain('volume_produzido: volume');
  });
  it('valida volume antes de chamar o servidor', () => {
    expect(hook).toContain('!Number.isFinite(volume) || volume <= 0');
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
  it('traduz programação ausente, vínculo, item canônico e volume', () => {
    expect(traduzErroCockpit('COCKPIT_LOTE_PROGRAMACAO_NAO_ENCONTRADA')).toMatch(/não encontrada/);
    expect(traduzErroCockpit('COCKPIT_LOTE_VINCULO_INVALIDO')).toMatch(/não pertence/);
    expect(traduzErroCockpit('COCKPIT_LOTE_VINCULO_AMBIGUO')).toMatch(/ambíguo/);
    expect(traduzErroCockpit('COCKPIT_LOTE_ITEM_CANONICO_AUSENTE')).toMatch(/produto nem microrganismo/);
    expect(traduzErroCockpit('COCKPIT_LOTE_VOLUME_INVALIDO')).toMatch(/maior que zero/);
    expect(traduzErroCockpit('COCKPIT_LOTE_PAYLOAD_INVALIDO')).toMatch(/formato inválido/);
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
    for (const codigo of [
      'lotes_tabela_ausente',
      'lotes_programacao_tabela_ausente',
      'lotes_funcao_codigo_ausente',
      'lotes_rpc_assinatura_divergente',
      'lotes_unique_codigo_ausente',
      'lotes_unique_programacao_ausente',
    ]) {
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
  it('rejeita código vindo do cliente e valida o payload', () => {
    expect(rpc).toContain('COCKPIT_LOTE_CODIGO_NAO_ACEITO');
    expect(rpc).toContain("jsonb_typeof(p_lote) <> 'object'");
    expect(rpc).toContain('COCKPIT_LOTE_PAYLOAD_INVALIDO');
  });
  it('ordem: origem → lock → FOR UPDATE → vínculo → replay → código → insert/evento', () => {
    const i = (s: string) => rpc.indexOf(s);
    expect(i('fn_cockpit_assert_operador_origem')).toBeGreaterThan(-1);
    expect(i('fn_cockpit_assert_operador_origem')).toBeLessThan(i("pg_advisory_xact_lock(hashtext('cockpit_lote:"));
    expect(i("pg_advisory_xact_lock(hashtext('cockpit_lote:")).toBeLessThan(i('FOR UPDATE'));
    expect(i('FOR UPDATE')).toBeLessThan(i('COCKPIT_LOTE_VINCULO_INVALIDO'));
    expect(i('COCKPIT_LOTE_VINCULO_INVALIDO')).toBeLessThan(i("'replay', true"));
    expect(i("'replay', true")).toBeLessThan(i('public.gerar_codigo_lote(EXTRACT'));
    expect(i('public.gerar_codigo_lote(EXTRACT')).toBeLessThan(i('INSERT INTO public.lotes'));
    expect(i('INSERT INTO public.lotes')).toBeLessThan(i('laboratorio_esteira_eventos'));
  });
  it('valida vínculo por origem e falha em ambiguidade', () => {
    expect(rpc).toContain('COCKPIT_LOTE_PROGRAMACAO_NAO_ENCONTRADA');
    expect(rpc).toContain('COCKPIT_LOTE_VINCULO_AMBIGUO');
    expect(rpc).toContain("IF v_origem = 'onfarm' THEN");
    expect(rpc).toContain('v_prog.ordem_servico_onfarm_id IS DISTINCT FROM p_os_id');
    expect(rpc).toContain('v_prog.ordem_servico_id IS DISTINCT FROM p_os_id');
  });
  it('deriva item canônico da programação bloqueada', () => {
    expect(rpc).toContain('COCKPIT_LOTE_ITEM_CANONICO_AUSENTE');
    expect(rpc).toContain('v_prog.produto_id,');
    expect(rpc).toContain('v_prog.microrganismo_id,');
    expect(rpc).not.toContain("p_lote->>'produto_id'");
    expect(rpc).not.toContain("p_lote->>'microrganismo_id'");
  });
  it('valida volume estritamente positivo e finito', () => {
    expect(rpc).toContain('COCKPIT_LOTE_VOLUME_INVALIDO');
    expect(rpc).toContain("NOT (v_volume > 0)");
    expect(rpc).toContain('v_volume IS NULL');
  });
  it.each(['NaN', 'Infinity', '-Infinity'])('rejeita explicitamente %s no contrato SQL antes do insert', (valor) => {
    const executavel = rpc.split('\n').filter((linha) => !linha.trim().startsWith('--')).join('\n');
    const guarda = executavel.match(/IF v_volume IS NULL OR NOT \(v_volume > 0\) OR v_volume::text IN \(([^)]+)\) THEN\s+RAISE EXCEPTION 'COCKPIT_LOTE_VOLUME_INVALIDO';\s+END IF;/);
    expect(guarda).not.toBeNull();
    expect(guarda?.[1].split(',').map((item) => item.trim())).toContain(`'${valor}'`);
    expect(guarda?.index).toBeLessThan(executavel.indexOf('INSERT INTO public.lotes'));
  });
  it('diferencia constraints no unique_violation', () => {
    expect(rpc).toContain('GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME');
    expect(rpc).toContain("v_indexdef LIKE '%(programacao_id)%'");
    expect(rpc).toContain("v_indexdef LIKE '%(codigo_lote)%'");
    expect(rpc).toContain('COCKPIT_LOTE_CODIGO_CONFLITO');
    expect(rpc).toMatch(/ELSE\s+RAISE;/);
  });
  it('privilégio mínimo: gerador interno sem EXECUTE para papéis de aplicação', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.gerar_codigo_lote(integer) FROM PUBLIC;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.gerar_codigo_lote(integer) FROM anon;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.gerar_codigo_lote(integer) FROM authenticated;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.gerar_codigo_lote/);
  });
  it('mantém search_path fixo e grants mínimos na RPC', () => {
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) TO authenticated;');
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
