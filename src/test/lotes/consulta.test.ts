import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { diaSP, dataLote, numeroValido, volumeL, resumoVolumes, normalizar, noPeriodo, cockpitLote } from '@/lib/lotes/consulta';
describe('Consulta segura de lotes', () => {
  it('normaliza busca', () => expect(normalizar('  Produção ')).toBe('producao'));
  it('preserva data civil', () => expect(dataLote('2026-09-13')).toBe('13/09/2026'));
  it('converte timestamp para SP', () => expect(diaSP('2026-09-13T01:00:00Z')).toBe('2026-09-12'));
  it('rejeita datas inválidas', () => { expect(diaSP('2026-02-30')).toBe(''); expect(dataLote('x')).toBe('—'); });
  it.each([null, undefined, -1, Infinity, NaN, '10'])('rejeita número inválido %s', n => expect(numeroValido(n)).toBeNull());
  it('preserva zero e pequenos volumes', () => { expect(volumeL(0)).toBe('0 L'); expect(volumeL(1)).toBe('0,001 L'); });
  it('não presume produção nula como zero', () => expect(resumoVolumes(null, []).saldo).toBeNull());
  it('ausência de envase é zero', () => expect(resumoVolumes(1000, [])).toMatchObject({ envasado: 0, saldo: 1000 }));
  it('soma envases', () => expect(resumoVolumes(3000, [{ quantidade: 2, volume_por_unidade: 1000 }]).saldo).toBe(1000));
  it('não apresenta excesso como completo', () => expect(resumoVolumes(1000, [{ quantidade: 2, volume_por_unidade: 1000 }])).toMatchObject({ saldo: null, inconsistente: true }));
  it('propaga envase desconhecido', () => expect(resumoVolumes(1000, [{ quantidade: null, volume_por_unidade: 1000 }]).envasado).toBeNull());
  it('rejeita unidades fracionárias', () => expect(resumoVolumes(1000, [{ quantidade: 0.5, volume_por_unidade: 1000 }]).envasado).toBeNull());
  it('filtra período inclusivo', () => { expect(noPeriodo('2026-09-13', '2026-09-13', '2026-09-13')).toBe(true); expect(noPeriodo('2026-09-12', '2026-09-13', '')).toBe(false); });
  it('codifica contexto de navegação', () => expect(cockpitLote('a&b')).toBe('/cockpit-laboratorio?os=a%26b'));
  it('mantém página somente leitura e sem truncamento silencioso', () => {
    const code = readFileSync('src/pages/Lotes.tsx', 'utf8');
    expect(code).not.toMatch(/\.update\(|\.insert\(|enviarParaCQ|\.rpc\(/);
    expect(code).toContain('.range(offset, offset + 199)');
    expect(code).toContain('current !== version.current');
    expect(code).toContain('result.error) throw result.error');
    expect(code).toContain('Tentar novamente');
    expect(code).toContain('Buscar lotes');
  });
});
