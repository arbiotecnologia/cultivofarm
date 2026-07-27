// Concurrency helper — bounded parallelism, deterministic, no Promise.all irrestrito.
// Puro, sem dependências Deno. Importado pelo webhook e por testes Node.
//
// Executa `items` aplicando `worker(item, index)` com no máximo `limit`
// promises em voo simultaneamente. Preserva a ordem dos resultados no
// array de saída. NÃO usa Promise.all sobre a lista inteira; usa um pool
// de trabalhadores. Se algum worker rejeitar, aguarda os já em voo
// concluírem e então rejeita com o primeiro erro observado (fail-fast lógico).

export const DEFAULT_WEBHOOK_CONCURRENCY = 8;
export const MAX_WEBHOOK_CONCURRENCY = 8;

export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const results: R[] = new Array(n);
  if (n === 0) return results;
  const bound = Math.max(1, Math.min(limit | 0, MAX_WEBHOOK_CONCURRENCY));
  let cursor = 0;
  let firstError: unknown = null;

  async function runner(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= n) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        if (firstError === null) firstError = err;
        // Continua o pool para drenar; não dispara mais itens novos.
        cursor = n;
        return;
      }
    }
  }

  const runners: Promise<void>[] = [];
  const parallel = Math.min(bound, n);
  for (let k = 0; k < parallel; k++) runners.push(runner());
  await Promise.all(runners);
  if (firstError !== null) throw firstError;
  return results;
}
