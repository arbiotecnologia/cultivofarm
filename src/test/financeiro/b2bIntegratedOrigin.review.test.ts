import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readProvenReceivables, MONEY_ORIGIN_MESSAGE } from '@/lib/financeiro/receivableOrigin';
import { saldoParcela } from '@/lib/financeiro/contasReceber';

const client = (data: unknown) => ({ rpc: async () => ({ data, error: null }) });
describe.each(['pg-final', 'continuacao-1259/pg-final-v2'])('projeções PG %s no consumidor real — transporte simulado', folder => {
  const root = `docs/correcoes-origem-parcial-servidor-20261101-evidencias/${folder}`;
  const legacy = JSON.parse(readFileSync(`${root}/legacy-projection.json`, 'utf8')).rows;
  const allocation = JSON.parse(readFileSync(`${root}/allocation-projection.json`, 'utf8'));
  it('legado comprovado mantém 10300, sem somar 300 financiados novamente', async () => {
    const rows = await readProvenReceivables(client(legacy), legacy[0].receivable_id);
    expect(saldoParcela(rows[0])).toBe(10300);
  });
  it('parcial mantém principal e financiamento do título sem duplicação', async () => {
    const rows = await readProvenReceivables(client(allocation), allocation[0].receivable_id);
    expect(rows.reduce((sum, row) => sum + Math.round(saldoParcela(row) * 100), 0)).toBe(2072428);
  });
  it('mistura KPI mantém identidades distintas e não reinterpreta fontes', async () => {
    expect(await readProvenReceivables(client([...legacy, ...allocation]), null)).toHaveLength(4);
  });
  it.each(['organization_id', 'order_id', 'schedule_id'])('nega origem legada sem %s', async field => {
    const row = structuredClone(legacy[0]); delete row.monetary_origin[field];
    await expect(readProvenReceivables(client([row]), row.receivable_id)).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
  });
  it('nega documento ausente e título ou tenant trocado', async () => {
    const row = structuredClone(allocation[0]); row.monetary_origin.organization_id = 'foreign';
    await expect(readProvenReceivables(client([row]), row.receivable_id)).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
    await expect(readProvenReceivables(client(allocation), 'another-title')).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
    row.monetary_origin.organization_id = row.organization_id; delete row.monetary_origin.document_id;
    await expect(readProvenReceivables(client([row]), row.receivable_id)).rejects.toThrow(MONEY_ORIGIN_MESSAGE);
  });
});