import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  avaliarFaixa, avaliarMinimo, avaliarTexto, cockpitCQ, dataCQ, dataHoraCQ, diaSP, divergencias,
  faixaTexto, formatNumero, noPeriodo, normalizar, numeroFinito, selecionarReferencia, statusCQ, vinculoOS,
} from '@/lib/cq/consulta';

const ref = (over: Partial<Parameters<typeof selecionarReferencia>[0][number]> = {}) => ({
  microrganismo_id: 'm1', produto_id: null, ph_min: null, ph_max: null, concentracao_min_ufc_ml: null,
  aparencia_esperada: null, odor_esperado: null, contaminacao_esperada: null, ativo: true, ...over,
});

describe('Consulta segura de Controle de Qualidade', () => {
  it('normaliza busca sem acento e caixa', () => expect(normalizar('  Análise ')).toBe('analise'));
  it('preserva data civil e converte timestamp para São Paulo', () => {
    expect(dataCQ('2026-09-13')).toBe('13/09/2026');
    expect(diaSP('2026-09-13T01:00:00Z')).toBe('2026-09-12');
    expect(dataHoraCQ('x')).toBe('—');
  });
  it('rejeita datas inválidas', () => { expect(diaSP('2026-02-30')).toBe(''); expect(dataCQ(null)).toBe('—'); });
  it.each([null, undefined, NaN, Infinity, -Infinity, '7'])('rejeita número inválido %s', v => expect(numeroFinito(v)).toBeNull());
  it('preserva zero e negativo sem transformar em vazio', () => {
    expect(numeroFinito(0)).toBe(0);
    expect(formatNumero(0)).toBe('0');
    expect(formatNumero(-1.5)).toBe('-1,5');
  });
  it('trata limites como inclusivos', () => {
    expect(avaliarFaixa(5, 5, 7)).toBe('conforme');
    expect(avaliarFaixa(7, 5, 7)).toBe('conforme');
    expect(avaliarFaixa(7.1, 5, 7)).toBe('nao_conforme');
    expect(avaliarMinimo(1e8, 1e8)).toBe('conforme');
    expect(avaliarMinimo(9e7, 1e8)).toBe('nao_conforme');
  });
  it('não declara conformidade sem valor ou sem limite', () => {
    expect(avaliarFaixa(null, 5, 7)).toBe('indeterminado');
    expect(avaliarFaixa(6, null, null)).toBe('indeterminado');
    expect(avaliarFaixa(6, 8, 5)).toBe('indeterminado');
    expect(avaliarMinimo(0, null)).toBe('indeterminado');
    expect(avaliarTexto('Ausente', '  ')).toBe('indeterminado');
  });
  it('compara texto ignorando acento e caixa', () => {
    expect(avaliarTexto('ausente', 'Ausente')).toBe('conforme');
    expect(avaliarTexto('Presente', 'Ausente')).toBe('nao_conforme');
  });
  it('escolhe referência mais específica e ignora inativa', () => {
    const lista = [ref({ produto_id: 'p1', ph_min: 5 }), ref({ ph_min: 4 })];
    expect(selecionarReferencia(lista, 'm1', 'p1')?.ph_min).toBe(5);
    expect(selecionarReferencia(lista, 'm1', 'p9')?.ph_min).toBe(4);
    expect(selecionarReferencia([ref({ ativo: false })], 'm1', null)).toBeNull();
    expect(selecionarReferencia(lista, null, 'p1')).toBeNull();
  });
  it('descreve faixa e ausência de limite', () => {
    expect(faixaTexto(5, 7)).toBe('5 a 7');
    expect(faixaTexto(5, null)).toBe('≥ 5');
    expect(faixaTexto(null, null)).toBe('Sem limite cadastrado');
  });
  it('classifica resultado ausente como pendente', () => {
    expect(statusCQ(null)).toBe('pendente');
    expect(statusCQ('aprovado')).toBe('aprovado');
    expect(statusCQ('qualquer')).toBe('pendente');
  });
  it('sinaliza incoerência entre parecer, parâmetros e lote', () => {
    expect(divergencias('aprovado', ['conforme', 'nao_conforme'])).toHaveLength(1);
    expect(divergencias('reprovado', ['conforme'])).toHaveLength(1);
    expect(divergencias(null, [])).toEqual(['Análise sem parecer final registrado.']);
    expect(divergencias('aprovado', ['conforme'], 'reprovado')).toHaveLength(1);
    expect(divergencias('aprovado', ['conforme'], 'aprovado')).toEqual([]);
    expect(divergencias('aprovado', [], 'em_producao')).toEqual([]);
  });
  it('bloqueia link contextual sem vínculo confiável', () => {
    expect(vinculoOS(null, false).aviso).toBe('Lote sem programação vinculada');
    expect(vinculoOS(undefined, true).aviso).toBe('Programação ausente ou indisponível');
    expect(vinculoOS({ ordem_servico_id: 'a', ordem_servico_onfarm_id: 'b' })).toMatchObject({ osId: null, aviso: 'Vínculo de OS ambíguo' });
    expect(vinculoOS({ ordem_servico_id: null, ordem_servico_onfarm_id: 'b' }).osId).toBe('b');
  });
  it('filtra período de forma inclusiva', () => {
    expect(noPeriodo('2026-09-13', '2026-09-13', '2026-09-13')).toBe(true);
    expect(noPeriodo('2026-09-12', '2026-09-13', '')).toBe(false);
    expect(noPeriodo(null, '2026-09-13', '')).toBe(false);
  });
  it('codifica navegação ao Cockpit', () => {
    expect(cockpitCQ('a&b')).toBe('/cockpit-laboratorio?os=a%26b');
    expect(cockpitCQ(null)).toBe('/cockpit-laboratorio');
  });
  it('mantém a página somente leitura, rotulada e sem truncamento silencioso', () => {
    const code = readFileSync('src/pages/ControleQualidade.tsx', 'utf8');
    expect(code).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(code).toContain('.range(offset, offset + 199)');
    expect(code).toContain('current !== version.current');
    expect(code).toContain('result.error) throw result.error');
    expect(code).toContain('Tentar novamente');
    expect(code).toContain('Buscar análises');
    expect(code).toContain('Paginação de análises');
    expect(code).toContain('@/integrations/supabase/client');
  });
});
