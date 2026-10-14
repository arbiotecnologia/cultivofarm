# Plano — Composição de produtos para todas as famílias (REFINADO e implementado como candidato local)

Atualização 22:05 UTC: o refinamento aprovado mantém `formulacoes` como fonte canônica, sem cópia e sem recadastro, com rollback que só revoga o EXECUTE. Detalhes em docs/auditorias/catalogo-composicao-todas-familias.md. Histórico: a opção B original NÃO foi aprovada. Antes de qualquer implementação ela precisa de refinamento: não duplicar a fonte de verdade, não exigir recadastro do Bombarbio, e o rollback deve preservar os dados (sem DROP por padrão). Este requisito fica guardado para o próximo recorte.

Escopo desta rodada: análise e plano. Nada de código, DDL, dados ou publicação. A revisão/aplicação de 5c78f665 segue separada, feita pelo usuário. Composição completa para as três famílias **não está implementada**.

## 1. Inventário observado (leitura nesta rodada + dados informados pelo usuário)

Confirmado nesta rodada lendo o código:
- `src/lib/protocolos/composicaoSync.ts`: `ComposicaoItem.microrganismo_id: string | null`. Aceita linha só com `component_insumo_id`, deduplica por micro e fixa `unidade: "mL"`. **Divergência:** o inventário SQL confirmado externamente indica `formulacoes.microrganismo_id` NOT NULL, então uma linha só de insumo falharia no banco.
- `useProductProfile.ts`: busca `microrganismo_id, component_insumo_id, volume_ml, proporcao` e não traz `concentracao/unidade`.
- `fichaTecnicaProdutoPdf.ts`: imprime "X mL / Y%" e só para microrganismos (insumo some do PDF).
- `usePartnerOrders.ts`: traz `proporcao, volume_ml, concentracao, unidade`.
- Outros consumidores: `useCatalogoUnificado`, `usePartnerSimulations`, `ProdutosTab`, `RevisaoTecnicaPanel`, `PedidoItemProdutoInfo`, `beneficiosCombinados`, `ComposicaoProducaoCard` + `composicaoCalc` (normaliza para litros), `NovoPedido`, `SimuladorComercial`, `PlanejamentoProducaoDetalhe` (usam `volume_ml`), além do seed `seedCatalogoARBioV13`.
- Confirmado por inventário SQL externo (não executado por mim nesta rodada): colunas `concentracao, unidade, volume_ml, component_insumo_id (FK produtos), proporcao, e_volume_fixo` e `UNIQUE(produto_id, microrganismo_id)`.

Hoje `formulacoes` faz três papéis ao mesmo tempo: receita de produção (mL por 1 L, usada no planejamento e no cockpit), composição exibida na ficha/PDF/B2B e base de cálculo de pedidos. Por isso uma mudança direta nela tem impacto amplo.

## 2. Conceitos que precisam ficar separados

- **Composição declarada (informativa):** o que o produto contém, para catálogo, ficha e B2B.
- **Receita de produção:** volumes por lote/litro usados pelo planejamento. Hoje é `formulacoes`.
- **Teor garantido:** valor regulatório/rotulado, como UFC/mL ou g/kg. Nunca é calculado a partir da receita.
- **Dose:** recomendação de aplicação, que já fica em outros campos. Composição não é dose.
- Nenhuma conversão automática entre UFC, mL, g, kg e L. Não há densidade inferida.

## 3. Opções

A) **Estender `formulacoes`**: liberar `microrganismo_id` NULL e adicionar campos de componente químico ou mineral.
- Contra: mexe na receita de produção e no UNIQUE, afeta planejamento, cockpit e pedidos, e mistura informação com receita. Rollback difícil. Não recomendado.

B) **Nova tabela `produto_composicao_declarada`** (aditiva), com `formulacoes` intacta como receita.
- A favor: isolada, reversível com DROP, nenhum consumidor atual muda. Biológicos referenciam `microrganismos.id` sem copiar dados.
- Contra (motivo da pausa): a composição de biológicos fica em dois lugares (receita e declaração), o Bombarbio teria de ser recadastrado e o rollback por DROP apagaria dados. Precisa de refinamento, por exemplo um campo de natureza/unidade explícita sobre a fonte atual, ou uma visão única.

C) **Tabela genérica de componentes + catálogo de substâncias químicas/nutrientes.**
- Mais completa, mas grande demais para agora. Fica como fase futura.

**Recomendação: B**, com campos mínimos e um texto livre controlado para a identidade de componentes químicos ou minerais. Não haverá catálogo de ativos químicos nesta fase e nenhum organismo será inventado.

## 4. Modelo mínimo recomendado (candidato, não aplicar)

`public.produto_composicao_declarada`
- `id`, `produto_id` (FK produtos, ON DELETE RESTRICT), `ordem`
- `tipo_componente`: `microrganismo | ingrediente_ativo | nutriente | outro`
- `microrganismo_id` (FK microrganismos, nullable). Só pode ser preenchido quando `tipo_componente = microrganismo`.
- `componente_nome` (texto, obrigatório quando não há micro, proibido quando há). A identidade nunca fica ambígua.
- `quantidade numeric` (nullable, finita, > 0)
- `unidade` (enum fechado, por exemplo `UFC/mL, UFC/g, g/L, g/kg, mL/L, %m/m, %m/v, %v/v`). Não existe "padrão" implícito.
- `base_referencia` (`por_litro | por_kg | por_unidade | percentual`), sempre explícita
- `natureza` (`teor_garantido | composicao_informativa`)
- `status` (`rascunho | completo`). Rascunho aceita quantidade NULL e é exibido como "incompleto".
- `updated_at` monotônico via `platform_private.catalog_touch_version()`, `created_by`, `updated_by`

Constraints: CHECK com `IS TRUE` (sem brecha de NULL) para micro/nome/tipo; `quantidade` e `unidade` têm de vir juntas ou ambas NULL; `status = completo` exige quantidade+unidade+base; UNIQUE parcial `(produto_id, microrganismo_id)` onde o micro não é NULL; UNIQUE `(produto_id, lower(componente_nome))` onde o nome não é NULL. Coerência com a família (micro só em biológicos) validada no writer e não em CHECK entre tabelas. Produto sem família continua aceitando apenas rascunho.

Legado:
- **Solo / insumo sem micro**: as linhas atuais de `formulacoes` não migram. A leitura de compatibilidade mostra "Composição de produção (legado)" sem converter.
- **Bombarbio** 334/333/333 mL por 1 L continua em `formulacoes` sem nenhuma alteração. A composição declarada dele seria preenchida depois, pela UI do SA, se o usuário quiser. Sem backfill.
- Divergência do `composicaoSync` (insumo sem micro x NOT NULL): registrar como bug P2 separado. A correção de produção não entra nesta fase.

## 5. Segurança, RPC e RLS

- Tabela sem DML direto. Leitura via RPC INVOKER `platform_list_product_composition(produto_id)` para Superadmin ativo. A leitura do tenant fica para depois, junto com mostrar/ocultar global.
- Escrita: `platform_replace_product_composition(produto_id, itens jsonb, expected_updated_at, motivo, idempotency_key)`, com INVOKER público → DEFINER privado, guard Superadmin ativo, `search_path` fixo, EXECUTE revogado de PUBLIC/anon, CAS sobre `produtos.updated_at` (finito), ledger de idempotência, auditoria antes/depois, lock por produto e substituição atômica do conjunto. Não toca em nenhuma outra coluna de `produtos` (preço, ativo, B2B, tipo, família) nem em `formulacoes`.
- Grants: SELECT/DML apenas para `service_role` e funções. Nada para `authenticated`/anon diretamente.
- B2B: `get_partner_catalog_secure` e o técnico não mudam nesta fase. A exibição para o parceiro (somente `status = completo` e com ficha aprovada) fica em fase própria.

## 6. Impactos e o que não muda

- Produção/planejamento/cockpit/`composicaoCalc`/NovoPedido/Simulador: sem mudança (continuam em `formulacoes.volume_ml`).
- Ficha/PDF: fase posterior adiciona a seção "Composição declarada" separada da de produção. Histórico e snapshots de pedidos/simulações não são recalculados.
- Cache: chave `["platform","composicao", scope, produtoId]`. Uma gravação invalida essa chave e a lista da aba e fecha o editor.
- Concorrência: o diálogo usa fence/epoch por `product.id + updated_at + scope + live`, igual aos diálogos de família e B2B.
- Sem bloqueio retroativo: produtos sem composição continuam ativos, com B2B e vendáveis, e mostram apenas o aviso "composição pendente".

## 7. Fases

```text
C0  Preflight SQL read-only: confirmar colunas/NOT NULL/UNIQUE de formulacoes,
    contagem de linhas sem micro e com insumo, e checar se Bombarbio está intacto.
C1  SQL candidato + rollback (DROP das funções/tabela) + runtime em rollback
    (matriz de CHECKs, NULLs, família x tipo, CAS, replay, não-SA negado,
    produtos/formulacoes inalterados). Não aplicar.
C2  UI SA nas 4 abas: editor com seletor de micro do catálogo (só biológicos),
    nome livre para químico/fertilizante, unidade/base obrigatórias, motivo,
    confirmação, rascunho visível. Testes de fences, cache e validação.
C3  Leitura na ficha/PDF (seção separada) + exibição B2B condicionada.
C4  (separado) tenant mostrar/ocultar e CRUD próprio; catálogo de ativos/nutrientes.
```

## 8. Testes previstos

Pure (validação de linha e matriz de unidade/base), diálogo (fences, escopo A→B, versão, resposta tardia), regressão dos testes atuais de `composicaoSync`, `composicaoCalc`, `produtoComposicao.flow`, ficha cat09/cat10 e B2B, além de typecheck, lint, scanner e build. Runtime SQL só em rollback. JWT, navegador e produção ficam UNVERIFIED até haver evidência própria.

## 9. Decisões pendentes do usuário

1. Confirmar a opção B (tabela declarada separada) em vez de estender `formulacoes`.
2. Lista inicial de unidades/bases aceitas.
3. Se o parceiro B2B deve ver a composição declarada já na C3 ou só depois da ficha aprovada.
