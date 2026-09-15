/**
 * Leitura paginada real (sem truncar silenciosamente).
 * Percorre todas as páginas com ordem estável por chave primária.
 * Qualquer erro em qualquer página aborta a leitura — nunca devolve coleção parcial.
 */

export const TAMANHO_PAGINA_LEITURA = 1000;
/** Guarda de segurança: evita laço infinito caso a fonte devolva sempre página cheia. */
export const MAX_PAGINAS_LEITURA = 200;

export type PaginaResultado<T> = { data: T[] | null; error: unknown };

export async function fetchAllRows<T>(
  carregarPagina: (from: number, to: number) => PromiseLike<PaginaResultado<T>>,
  tamanho: number = TAMANHO_PAGINA_LEITURA,
): Promise<T[]> {
  const todos: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS_LEITURA; pagina++) {
    const from = pagina * tamanho;
    const { data, error } = await carregarPagina(from, from + tamanho - 1);
    if (error) throw error;
    const linhas = data ?? [];
    todos.push(...linhas);
    if (linhas.length < tamanho) return todos;
  }
  throw new Error(
    "Não foi possível carregar a lista completa (limite de páginas atingido). Refine os filtros e tente novamente.",
  );
}
