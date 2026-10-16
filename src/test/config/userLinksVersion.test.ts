import { describe, expect, it } from 'vitest';
import { parseVinculos } from '@/lib/configuracoes/userLinks';
const item = { user_id: '11111111-1111-4111-8111-111111111111', clientes: [], parceiro: null, parceiros_total: 0, fora_do_alcance: 0 };
describe('token CAS completo do leitor de vínculos', () => {
  it('preserva expected_version válido', () => {
    expect(parseVinculos({ items: [{ ...item, expected_version: 'a'.repeat(64) }] }).get(item.user_id)?.expected_version).toBe('a'.repeat(64));
  });
  it.each([null, 1, '', 'a'.repeat(63), 'G'.repeat(64)])('nega token malformado %j sem simular ausência', expected_version => {
    expect(() => parseVinculos({ items: [{ ...item, expected_version }] })).toThrow('Resposta de vínculos inválida.');
  });
  it('ausência não inventa token de versão', () => {
    expect(parseVinculos({ items: [item] }).get(item.user_id)?.expected_version).toBeUndefined();
  });
});