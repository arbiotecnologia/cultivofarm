import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";


/**
 * Renderização unificada da célula "Produto" para itens de pedidos e simulações B2B.
 * Usado em telas comercial, parceiro e produtor — garante que nome, concentração,
 * código e composições apareçam de forma idêntica em todos os escopos.
 *
 * Aceita qualquer shape de item que exponha (opcionalmente):
 *  - nome / produto_nome_snapshot / produtos.nome / microrganismos.nome
 *  - codigo / produto_codigo_snapshot / produtos.codigo / microrganismos.codigo
 *  - item_tipo ("microrganismo" | "produto")
 *  - microrganismos: { nome, concentracao_label, funcao_agronomica }
 *  - produtos: { nome, codigo, funcao_completa, modo_acao, modo_aplicacao,
 *                formulacoes: [{ microrganismos: { nome, concentracao_label } }] }
 */
export interface PedidoItemProdutoInfoProps {
  item: any;
  /** Renderiza rótulo de tipo (Produto / Microrganismo) — usado nas tabelas ricas. */
  showTipoBadge?: boolean;
  /** Slot para inserir um badge após o nome (ex.: aviso de inconsistência). */
  afterName?: ReactNode;
}

export function PedidoItemProdutoInfo({
  item: it,
  showTipoBadge = false,
  afterName,
}: PedidoItemProdutoInfoProps) {
  const isMicro =
    it.item_tipo === "microrganismo" || (!!it.microrganismos && !it.produtos);
  const info = it.produtos ?? it.microrganismos ?? {};
  const nome =
    it.produto_nome_snapshot ?? info.nome ?? it.nome ?? "Item";
  const codigo =
    it.produto_codigo_snapshot ?? info.codigo ?? it.codigo;
  const concentracao =
    it.microrganismos?.concentracao_label ??
    (isMicro ? info.concentracao_label : null);
  const formulacoes: any[] = Array.isArray(it.produtos?.formulacoes)
    ? it.produtos.formulacoes
    : [];
  const funcao =
    it.produtos?.funcao_completa ??
    it.produtos?.modo_acao ??
    it.microrganismos?.funcao_agronomica;
  const modoAplic = it.produtos?.modo_aplicacao;
  const meta = [funcao, modoAplic].filter(Boolean) as string[];

  return (
    <>
      <div className="flex items-start gap-1.5 flex-wrap">
        <span className="font-medium">
          {nome}
          {concentracao && (
            <span className="ml-1 font-normal text-muted-foreground whitespace-nowrap">
              {concentracao}
            </span>
          )}
        </span>
        {afterName}
      </div>
      {(codigo || showTipoBadge) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          {codigo && (
            <span className="text-[11px] text-muted-foreground font-mono">
              {codigo}
            </span>
          )}
          {showTipoBadge && (
            <Badge variant="outline" className="text-[10px] py-0">
              {isMicro ? "Microrganismo" : "Produto"}
            </Badge>
          )}
        </div>
      )}
      {formulacoes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {formulacoes.map((f: any, i: number) => {
            const mNome = f.microrganismos?.nome;
            if (!mNome) return null;
            const conc = f.microrganismos?.concentracao_label;
            return (
              <li key={i} className="text-[11px] text-muted-foreground">
                <span>{mNome}</span>
                {conc && <span className="ml-1">· {conc}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {meta.length > 0 && (
        <div
          className="text-[11px] text-muted-foreground mt-0.5"
          title={meta.join(" · ")}
        >
          {meta.join(" · ")}
        </div>
      )}
    </>
  );
}
