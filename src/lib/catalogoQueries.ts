export const CATALOGO_FONTES = [
  "Produtos", "Microrganismos", "Fichas de produtos", "Fichas de microrganismos",
  "Composição", "Fontes técnicas", "Alvos de microrganismos", "Alvos de produtos",
] as const;

export class CatalogoQueryError extends Error {
  constructor(public readonly fontes: string[]) {
    super(`Não foi possível carregar: ${fontes.join(", ")}.`);
    this.name = "CatalogoQueryError";
  }
}

/** Nunca agrega dados parciais nem propaga mensagens sensíveis do servidor. */
export async function consultarCatalogo(queries: PromiseLike<any>[]) {
  const results = await Promise.allSettled(queries);
  const fontes = results.flatMap((result, index) =>
    result.status === "rejected" || result.value.error
      ? [CATALOGO_FONTES[index] ?? "Catálogo"] : [],
  );
  if (fontes.length) throw new CatalogoQueryError(fontes);
  return results.map((result) => result.status === "fulfilled" ? result.value : undefined);
}