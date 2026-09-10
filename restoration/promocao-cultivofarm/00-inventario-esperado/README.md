# Inventário esperado (contrato da homologação)

Esta pasta recebe os `.tsv` gerados por
`02-gerar-baseline-estrutural.sh`, que por sua vez reutiliza
`restoration/promocao-producao/10-inventario-readonly.sh` contra a homologação
`ikaauvsflpmamgxmkhoq`.

Arquivos esperados após a geração:

| Arquivo | Conteúdo |
|---|---|
| `tables.tsv` | tabela, RLS ativa (0/1), número de policies |
| `functions.tsv` | assinatura, `SECURITY DEFINER` (0/1), `proconfig` |
| `triggers.tsv` | `tabela.trigger` |
| `indexes.tsv` | `tabela.indice` |
| `enums.tsv` | `enum=rótulos` |
| `buckets.tsv` | buckets (referência; objetos não migram) |
| `ledger.tsv` | versões do ledger da homologação (referência apenas) |
| `counts.tsv` | linhas vivas por tabela (deve ser 0 no CultivoFarm) |
| `resumo.tsv` | extensões, usuários Auth, objetos de Storage |

Estes arquivos são a base de comparação dos gates de paridade de
`04-postchecks.sql`. A pasta está vazia enquanto a sessão autenticada de
homologação não for renovada — o dump não pode ser gerado neste ambiente.
