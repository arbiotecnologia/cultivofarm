# Ajuste pontual — editor de versão comercial

## Resultado
Atualizar somente o editor comercial para usar preço monetário acessível e seletor fixo de moeda, mantendo a RPC e o JSON de limites inalterados.

## Implementação
- Extrair funções pequenas e testáveis para converter entrada monetária em centavos, formatar BRL/USD/EUR e produzir a string decimal enviada à RPC.
- Substituir o preço numérico por campo textual com `inputMode="decimal"`, estados de foco/desfoque, colagem segura e validação de valor maior que zero.
- Substituir moeda livre por `Select` com BRL, USD e EUR; aplicar BRL somente em rascunho novo vazio e preservar a moeda salva na edição.
- Renomear e esclarecer o campo de limites, mantendo o JSON e o contrato atual.
- Adicionar testes focados para formatação, troca de moeda, normalização, colagem, seletor e textos de limites.

## Validação
- Testes focados.
- Typecheck.
- Lint apenas dos arquivos alterados.
- Build automático da prévia.

## Limites
Sem banco, migrations, RPCs, RLS, snapshots, dados comerciais, assinaturas ou publicação do aplicativo.
