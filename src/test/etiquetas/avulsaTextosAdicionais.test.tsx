import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLooseLabels, EMPTY_LOOSE_LABEL, DEFAULT_LEGAL_TEXT } from '@/lib/etiquetaAvulsa';
import { labelLayout, LabelScene } from '@/lib/etiquetasLayout';

const base = { ...EMPTY_LOOSE_LABEL, company: 'AR Bio', product: 'Bacillus subtilis', lot: 'LT-2026-0001', volume: '20', client: 'Fazenda Exemplo', toxicity: 'Texto da ficha', approved: true };
const formats = ['100x150', '100x100', '80x50'] as const;
const modes = [{ origin: 'manual' as const }, { origin: 'producao' as const, productionKey: 'OS-12' }];
const text = (d: typeof base & Record<string, unknown>, f: typeof formats[number]) => { const l = createLooseLabels({ ...d, format: f })[0]!; return { all: labelLayout(l, f).blocks.flatMap(b => b.lines).join(' '), svg: renderToStaticMarkup(<LabelScene label={l} format={f} origin="http://localhost" />), layout: labelLayout(l, f) }; };

describe('Textos adicionais configuráveis', () => {
  for (const f of formats) for (const m of modes) for (const [o, g] of [[true, true], [false, false], [true, false], [false, true]] as const) {
    it(`${f} ${m.origin} origem=${o} aviso=${g}`, () => {
      const r = text({ ...base, ...m, showOrigin: o, showLegal: g }, f);
      expect(r.all.includes(m.origin === 'manual' ? 'NÃO VINCULADA' : 'PRODUÇÃO OS-12')).toBe(o);
      expect(r.all.includes('NÃO SUBSTITUI')).toBe(g);
      expect(r.svg.includes('NÃO SUBSTITUI')).toBe(g);
      expect(r.all).toContain('RECIPIENTE 01/01');
      expect(r.all).toContain('Texto da ficha');
    });
  }
  it('desativados liberam altura (sem lacuna reservada)', () => {
    const on = text({ ...base }, '80x50').layout; const off = text({ ...base, showOrigin: false, showLegal: false }, '80x50').layout;
    expect(off.rules.length).toBeLessThan(on.rules.length);
  });
  it('texto editado aparece exato e ambos padrões vêm preenchidos', () => {
    expect(text({ ...base }, '100x150').all).toContain('ETIQUETA OPERACIONAL PROVISÓRIA');
    expect(text({ ...base, originText: 'USO INTERNO · LAB', legalText: 'Uso interno; não substitui rótulo legal.' }, '100x150').all).toContain('USO INTERNO · LAB');
    expect(DEFAULT_LEGAL_TEXT).toContain('NÃO SUBSTITUI');
  });
  it('texto longo no limite: cabe em 100x150 ou bloqueia sem truncar', () => {
    const d = { ...base, originText: 'O'.repeat(80), legalText: 'Aviso interno '.repeat(11).slice(0, 160) };
    expect(text(d, '100x150').all.replace(/\s/g, '')).toContain('O'.repeat(80));
    try { text(d, '80x50'); } catch (e) { expect(String(e)).toMatch(/Conteúdo excede/); }
  });
  it('rejeita textos vazios habilitados, limites e caracteres proibidos', () => {
    expect(() => createLooseLabels({ ...base, originText: '' })).toThrow(/identificação de origem/);
    expect(() => createLooseLabels({ ...base, legalText: '  ' })).toThrow(/aviso de rotulagem/);
    expect(() => createLooseLabels({ ...base, legalText: 'x'.repeat(161) })).toThrow();
    expect(() => createLooseLabels({ ...base, originText: '<b>x</b>' })).toThrow();
    expect(() => createLooseLabels({ ...base, showOrigin: false, originText: '' })).not.toThrow();
  });
  it('produção não pode se declarar não vinculada', () => {
    expect(() => createLooseLabels({ ...base, origin: 'producao', productionKey: 'OS-12', originText: 'AVULSA · NÃO VINCULADA À PRODUÇÃO' })).toThrow(/não vinculada/);
  });
  it('nunca afirma conformidade, dispensa ou substituição; status provisório mantido', () => {
    for (const t of ['Rótulo oficial', 'Dispensa rotulagem legal', 'Substitui a rotulagem legal', 'Em conformidade com a legislação', 'Registrado no MAPA'])
      expect(() => createLooseLabels({ ...base, legalText: t })).toThrow(/conformidade/);
    const l = createLooseLabels({ ...base, showLegal: false, showOrigin: false })[0]!;
    expect(l.status).toBe('provisoria'); expect(l.snapshot.operational_provisional).toBe(true); expect(l.trace_token).toBe('');
    expect((l.snapshot.provisional_data as { showLegal: boolean }).showLegal).toBe(false);
  });
});
