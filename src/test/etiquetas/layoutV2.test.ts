import { describe, expect, it } from 'vitest';
import { formatForVolumeMl, resolveOperationalTemplates, validateRecipientV2, approvedDate, outputFormat } from '@/lib/etiquetasRecipientes';
import { createRecipientLabelsPdf, labelLayout } from '@/lib/etiquetasLayout';
import { qaLabel } from './layoutV2.fixtures';
describe('Layout recipiente-v2 homolog', () => {
  it.each([[20000,'100x150',100,150],[5000,'100x100',100,100],[1000,'80x50',80,50]] as const)('%i mL usa mídia canônica %s', (volume,format,width,height) => {
    expect(formatForVolumeMl(volume)).toBe(format);
    const layout = labelLayout(qaLabel(volume), format);
    expect([layout.width,layout.height]).toEqual([width,height]);
    expect(validateRecipientV2(qaLabel(volume), format).validity).toBe('31/12/2099');
    expect(layout.qr).toBeGreaterThanOrEqual(20);
    expect(layout.toxicityY).toBeGreaterThan(layout.qrY + layout.qr);
  });
  it.each([20000,5000,1000])('%i mL recusa validade ausente independentemente da toxicidade', volume => {
    const label=qaLabel(volume); delete label.snapshot.validade_em;
    expect(() => labelLayout(label,formatForVolumeMl(volume))).toThrow(/Validade/);
  });
  it.each([20000,5000,1000])('%i mL recusa toxicidade ausente independentemente da validade', volume => {
    const label=qaLabel(volume); delete label.snapshot.toxicidade;
    expect(() => labelLayout(label,formatForVolumeMl(volume))).toThrow(/Toxicidade/);
  });
  it('recusa legado antes de saída', () => { const l=qaLabel(1000); delete l.snapshot.layout_versao; expect(() => labelLayout(l,'80x50')).toThrow(/legada/); });
  it('exportador recusa legado oficial antes de gerar imagem', async () => { const l=qaLabel(1000); l.tipo_etiqueta='principal'; delete l.snapshot.layout_versao; await expect(createRecipientLabelsPdf([l],'80x50','termica','https://homolog.example')).rejects.toThrow(/legada/); });
  it('exportador valida toda seleção antes de produzir páginas', async () => { const l=qaLabel(5000); delete l.snapshot.toxicidade; await expect(createRecipientLabelsPdf([qaLabel(20000),l],'100x150','termica','https://homolog.example')).rejects.toThrow(/Toxicidade/); });
  it('recusa datas impossíveis sem normalização', () => expect(() => approvedDate('2099-02-31')).toThrow());
  it('recusa overflow sem cortar toxicidade', () => { const l=qaLabel(1000); l.snapshot.toxicidade='Obrigatório '.repeat(300); expect(() => labelLayout(l,'80x50')).toThrow(/excede/); });
  it('recusa modelo maior para recipiente de 1 L', () => expect(() => labelLayout(qaLabel(1000),'100x150')).toThrow(/incompatível/));
  it('lote misto resolve modelos cadastrados independentemente de ordem', () => {
    const catalog=[{ativo:true,codigo:'C20',largura_mm:100,altura_mm:150},{ativo:true,codigo:'C5',largura_mm:100,altura_mm:100},{ativo:true,codigo:'C1',largura_mm:80,altura_mm:50}];
    expect(resolveOperationalTemplates([1000,20000,5000,1000],catalog)).toEqual([{format:'100x150',codigo:'C20'},{format:'100x100',codigo:'C5'},{format:'80x50',codigo:'C1'}]);
    expect(outputFormat(qaLabel(1000),'100x150')).toBe('80x50');
  });
  it('não inventa código ausente nem escolhe código ambíguo', () => {
    expect(() => resolveOperationalTemplates([1000],[])).toThrow(/ausente/);
    expect(() => resolveOperationalTemplates([1000],[{ativo:true,codigo:'A',largura_mm:80,altura_mm:50},{ativo:true,codigo:'B',largura_mm:80,altura_mm:50}])).toThrow(/ambíguo/);
  });
  it('não aceita volume total ou não aprovado', () => expect(() => formatForVolumeMl(6000)).toThrow());
});
