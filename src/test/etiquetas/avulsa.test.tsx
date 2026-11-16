import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLooseLabels, EMPTY_LOOSE_LABEL, validLabelDate, maskLabelDate } from '@/lib/etiquetaAvulsa';
import { LabelScene, labelLayout } from '@/lib/etiquetasLayout';
import { canGenerateLooseLabel, parseLabelProductions } from '@/components/etiquetas/GerarEtiquetaAvulsa';

const draft = { ...EMPTY_LOOSE_LABEL, company: 'Empresa de teste', product: 'Bacillus subtilis', lot: 'LT-2026-0001', volume: '20,000' };
describe('Etiqueta avulsa operacional', () => {
  it('gera sem produção, estoque ou QR fictício', () => {
    const labels = createLooseLabels(draft);
    expect(labels).toHaveLength(1);
    expect(labels[0]?.trace_token).toBe('');
    const label = labels[0]; if (!label) throw new Error('missing');
    const svg = renderToStaticMarkup(<LabelScene label={label} format="100x150" origin="http://localhost:8080" />);
    expect(svg).not.toContain('recipient-label-qr');
  });
  it('não inventa validade e bloqueia datas inexistentes', () => {
    const label = createLooseLabels(draft)[0]; if (!label) throw new Error('missing');
    expect(labelLayout(label, '100x150').lines).toEqual(expect.arrayContaining(['VALIDADE', 'não informada']));
    expect(validLabelDate('31/02/2026')).toBe(false);
    expect(validLabelDate('29/02/2024')).toBe(true);
    expect(maskLabelDate('16112026')).toBe('16/11/2026');
    expect(() => createLooseLabels({ ...draft, expiry: '31/02/2026' })).toThrow();
  });
  it('numera recipientes a partir da sequência informada', () => {
    const labels = createLooseLabels({ ...draft, first: 4, quantity: 3, total: 6 });
    expect(labels.map(l => l.snapshot.recipiente)).toEqual([{ seq: 4, total: 6 }, { seq: 5, total: 6 }, { seq: 6, total: 6 }]);
    expect(() => createLooseLabels({ ...draft, first: 4, quantity: 4, total: 6 })).toThrow();
  });
  it.each(['0', '-1', 'NaN', '1e3', '1,0000'])('nega volume inválido %s', volume => expect(() => createLooseLabels({ ...draft, volume })).toThrow());
  it('exige referência na origem produção', () => expect(() => createLooseLabels({ ...draft, origin: 'producao' })).toThrow());
  it('exige aprovação de textos técnicos', () => {
    expect(() => createLooseLabels({ ...draft, conservation: 'Orientação aprovada' })).toThrow();
    expect(createLooseLabels({ ...draft, conservation: 'Orientação aprovada', approved: true })).toHaveLength(1);
  });
  it('nega sequência acima de 500', () => expect(() => createLooseLabels({ ...draft, quantity: 501, total: 501 })).toThrow());
  it('nega envase anterior à fabricação', () => expect(() => createLooseLabels({ ...draft, manufactured: '16/11/2026', bottled: '15/11/2026' })).toThrow());
  it('não corta conteúdo excedente', () => {
    const label = createLooseLabels({ ...draft, format: '80x50', notes: 'Texto aprovado extenso '.repeat(13), composition: 'Composição aprovada extensa '.repeat(10), conservation: 'Conservar refrigerado '.repeat(9), approved: true })[0];
    if (!label) throw new Error('missing');
    expect(() => labelLayout(label, '80x50')).toThrow(/excede/);
  });
  it('restringe ação a administrador, gestor e produção', () => {
    for (const role of ['administrador', 'gestor', 'producao']) expect(canGenerateLooseLabel([role])).toBe(true);
    for (const role of ['administrativo', 'financeiro', 'consultor_tecnico', 'operador_onfarm', 'parceiro_b2b']) expect(canGenerateLooseLabel([role])).toBe(false);
  });
  it('leitor rejeita envelope inválido e ignora produção cancelada', () => {
    expect(() => parseLabelProductions({ items: [], total_count: -1 })).toThrow();
    expect(parseLabelProductions({ items: [{ os_id: '11111111-1111-4111-8111-111111111111', origem_os: 'manual', numero_os: 'OS-1', produto_nome: 'Produto', status_os: 'cancelada' }], total_count: 1 }).items).toEqual([]);
  });
});