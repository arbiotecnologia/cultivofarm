import { describe, it, expect } from "vitest";
import { fetchAllRows, TAMANHO_PAGINA_LEITURA } from "@/lib/configuracoes/fetchAllRows";

function fonte(total: number, falharEm?: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  let chamadas = 0;
  const carregar = async (from: number, to: number) => {
    chamadas++;
    if (falharEm !== undefined && chamadas === falharEm) return { data: null, error: { message: "falha de rede" } };
    return { data: linhas.slice(from, to + 1), error: null };
  };
  return { carregar, chamadas: () => chamadas };
}

describe("fetchAllRows", () => {
  it("lê mais de 1000 registros em várias páginas", async () => {
    const f = fonte(2345);
    const todos = await fetchAllRows<{ id: number }>(f.carregar, TAMANHO_PAGINA_LEITURA);
    expect(todos).toHaveLength(2345);
    expect(todos[0].id).toBe(0);
    expect(todos[2344].id).toBe(2344);
    expect(f.chamadas()).toBe(3);
  });

  it("falha em página intermediária vira erro, não coleção parcial", async () => {
    const f = fonte(2345, 2);
    await expect(fetchAllRows<{ id: number }>(f.carregar, TAMANHO_PAGINA_LEITURA)).rejects.toBeTruthy();
  });

  it("falha na primeira página propaga erro", async () => {
    const f = fonte(10, 1);
    await expect(fetchAllRows(f.carregar, 5)).rejects.toBeTruthy();
  });

  it("lista vazia devolve array vazio", async () => {
    const f = fonte(0);
    expect(await fetchAllRows(f.carregar, 100)).toEqual([]);
  });

  it("interrompe se a fonte nunca encerrar (guarda de páginas)", async () => {
    const carregar = async () => ({ data: [{ id: 1 }, { id: 2 }], error: null });
    await expect(fetchAllRows(carregar, 2)).rejects.toThrow(/limite de páginas/i);
  });
});
