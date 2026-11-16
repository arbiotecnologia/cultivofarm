import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLooseLabels, EMPTY_LOOSE_LABEL } from '@/lib/etiquetaAvulsa';
import { LabelScene, labelLayout } from '@/lib/etiquetasLayout';

const base = { ...EMPTY_LOOSE_LABEL, company: 'AR Bio', product: 'Bacillus subtilis', lot: 'LT-2026-0001', volume: '20', manufactured: '01/11/2026', bottled: '02/11/2026', client: 'Fazenda Exemplo', farm: 'Talhão 1', order: 'PED-1' };
const TOX = 'Advertência conforme ficha técnica aprovada FT-12';
const formats = ['100x150', '100x100', '80x50'] as const;
const prod = { origin: 'producao' as const, productionKey: 'OS-12' };

describe('Toxicidade na etiqueta avulsa', () => {
  for (const format of formats) for (const mode of [{ origin: 'manual' as const }, prod]) {
    it(`${format} ${mode.origin}: texto informado aparece exatamente, no bloco técnico`, () => {
      const l = createLooseLabels({ ...base, ...mode, format, toxicity: TOX, approved: true })[0]!;
      const layout = labelLayout(l, format);
      expect(layout.lines.join(' ')).toContain('TOXICIDADE');
      expect(layout.lines.join(' ').replace(/\s+/g, ' ')).toContain(TOX);
      const svg = renderToStaticMarkup(<LabelScene label={l} format={format} origin="http://localhost" />);
      expect(svg).toContain('TOXICIDADE');
    });
    it(`${format} ${mode.origin}: sem valor mostra "não informada" e nunca infere classificação`, () => {
      const layout = labelLayout(createLooseLabels({ ...base, ...mode, format })[0]!, format);
      const all = layout.lines.join(' ').toLowerCase();
      expect(all).toContain('não informada — consultar ficha técnica');
      for (const word of ['atóxico', 'não tóxico', 'isento', 'não classificado']) expect(all).not.toContain(word);
    });
  }
  it('exige declaração de conferência técnica quando há texto de toxicidade', () => {
    expect(() => createLooseLabels({ ...base, toxicity: TOX })).toThrow(/aprovados/);
  });
  it('rejeita texto acima de 200 caracteres e caracteres de marcação', () => {
    expect(() => createLooseLabels({ ...base, toxicity: 'x'.repeat(201), approved: true })).toThrow();
    expect(() => createLooseLabels({ ...base, toxicity: '<script>', approved: true })).toThrow();
  });
  it('texto longo quebra linhas em 100x150 e bloqueia 80x50 sem truncar', () => {
    const long = 'Advertência aprovada extensa '.repeat(6).trim();
    const big = labelLayout(createLooseLabels({ ...base, format: '100x150', toxicity: long, approved: true })[0]!, '100x150');
    const block = big.blocks.find(b => b.lines.join(' ').startsWith('Advertência'))!;
    expect(block.lines.length).toBeGreaterThan(1);
    expect(block.lines.join(' ')).toBe(long);
    expect(() => labelLayout(createLooseLabels({ ...base, format: '80x50', toxicity: long, conservation: 'Conservar conforme ficha técnica aprovada', notes: 'Alerta aprovado', approved: true })[0]!, '80x50')).toThrow(/excede/);
  });
  it('separa o bloco técnico com régua própria', () => {
    const plain = labelLayout(createLooseLabels({ ...base, format: '100x150' })[0]!, '100x150');
    expect(plain.rules.length).toBeGreaterThanOrEqual(4);
  });
});
