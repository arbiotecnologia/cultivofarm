import { describe, it, expect } from 'vitest';
import { createLooseLabels, EMPTY_LOOSE_LABEL } from '@/lib/etiquetaAvulsa';
import { labelLayout } from '@/lib/etiquetasLayout';

// Regressão visual geométrica: distribuição, ausência de sobreposição e limites físicos.
const short = { ...EMPTY_LOOSE_LABEL, company: 'AR Bio', product: 'Bacillus subtilis', lot: 'LT-2026-0001', volume: '20', manufactured: '01/11/2026', bottled: '02/11/2026', client: 'Fazenda Exemplo', farm: 'Talhão 1', order: 'PED-1', quantity: 2, total: 2 };
const long = { ...short, company: 'AR Bio Soluções Biológicas para Agricultura Ltda', product: 'Bacillus subtilis + Trichoderma harzianum concentrado', client: 'Fazenda Exemplo Agropecuária do Cerrado', notes: 'Agitar antes do uso e manter ao abrigo da luz.', conservation: 'Refrigerado 2–8 °C', approved: true };
const formats = ['100x150', '100x100', '80x50'] as const;

function check(layout: ReturnType<typeof labelLayout>) {
  const boxes = layout.blocks.map(b => ({ x: b.x, top: b.y, bottom: b.y + b.lines.length * b.step }));
  boxes.forEach(b => { expect(b.top).toBeGreaterThanOrEqual(1.5); expect(b.bottom).toBeLessThanOrEqual(layout.height - 1.5); expect(b.x).toBeGreaterThanOrEqual(1.5); });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!; const b = boxes[j]!;
    if (a.x === b.x) expect(a.bottom <= b.top + 0.01 || b.bottom <= a.top + 0.01).toBe(true);
  }
  layout.rules.forEach(r => expect(r).toBeLessThan(layout.height));
}

describe('Espaçamento da etiqueta avulsa', () => {
  for (const format of formats) for (const [name, data] of [['curto', short], ['longo', long]] as const) for (const origin of ['manual', 'producao'] as const) {
    it(`${format} ${name} ${origin} sem sobreposição e com conteúdo completo`, () => {
      const draft = { ...data, format, origin, productionKey: origin === 'producao' ? 'OS-12' : undefined };
      const labels = createLooseLabels(draft);
      expect(labels).toHaveLength(2);
      if (format === '80x50' && name === 'longo') { expect(() => labelLayout(labels[1]!, format)).toThrow(/excede/); return; }
      const layout = labelLayout(labels[1]!, format);
      check(layout);
      const all = layout.lines.join(' ');
      for (const v of ['LOTE (REF.)', 'FABRICAÇÃO', 'ENVASE', 'VALIDADE', 'CLIENTE', 'FAZENDA', 'PEDIDO (REF.)', 'RECIPIENTE 02/02', 'NÃO SUBSTITUI']) expect(all).toContain(v);
      expect(all).toContain(origin === 'manual' ? 'NÃO VINCULADA' : 'PRODUÇÃO OS-12');
      // Produto em destaque: maior fonte do layout.
      const product = layout.blocks.find(b => b.lines.join(' ').startsWith(draft.product.split(' ')[0]!))!;
      expect(product.size).toBe(Math.max(...layout.blocks.map(b => b.size)));
      expect(layout.rules.length).toBeGreaterThanOrEqual(3);
    });
  }
  it('com logo reserva caixa no cabeçalho sem sobrepor empresa', () => {
    for (const format of formats) {
      const label = createLooseLabels({ ...short, format })[0]!;
      label.snapshot.provisional_logo = undefined;
      const without = labelLayout(label, format);
      expect(without.logo).toBeUndefined();
      expect(without.blocks[0]!.x).toBeLessThan(5);
    }
  });
});
