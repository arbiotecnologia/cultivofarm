# Inventário — teste real de entregas parciais (referência sintética). Substitui a seção do README raiz (2c1034c).

Nenhuma consulta remota foi feita nesta rodada; nada foi desbloqueado. Classificação:
**OBSERVADO** = relatado pelo proprietário em sessão real 10/11; **REPO** = consta em artefatos do repositório (não prova estado hospedado atual);
**A VALIDAR** = exige leitura PRE hospedada somente leitura antes do teste.

| # | Item | Classe | Situação |
|---|------|--------|----------|
| 1 | `/entregas` mostra "operação indisponível" | OBSERVADO | Causa exata (capacidade/feature/contenção de UI) A VALIDAR |
| 2 | Única entrega teste existente está cancelada | OBSERVADO | Não reaproveitar; nova referência sintética ARBio necessária |
| 3 | Contenção zero-dispatch no frontend (sem primeira mutação sem contrato atômico) | REPO (`mem://features/delivery-zero-dispatch-containment`) | Estado publicado A VALIDAR |
| 4 | Capacidades de grupo/cancelamento, envase, comprovantes, cancelamento de etiquetas | REPO (pacotes `delivery-*-20261030`, `label-cancel-closure-20261031`) | Instalação/ACL hospedada atual A VALIDAR; não declarar revogadas sem PRE |
| 5 | Confirmação parcial persiste com sucesso e pedido conclui só com cobertura integral | REPO (cadeia local; `mem://features/resale-partial-confirmation`) | Sem prova JWT/RLS/Storage real |
| 6 | `delivery_no_downstream` (MD5 `95e0e5a8…`) impede título/NF pela entrega | REPO (cadeia 57/57 + PRE B4 reportado) | Pin atual A VALIDAR na leitura PRE |
| 7 | Entrega → NF parcial → título → queda do residual | REPO (cadeia local, documento fiscal sintético) | Fiscal real pendente: NÃO EXECUTÁVEL em real |
| 8 | Contabilidade/produção/cobrança/comunicação | Regras do proprietário | Devem permanecer fechadas; nenhum passo do teste as abre |
| 9 | Fixtures proibidas `d7edc250…`, lote `5fa6d35b…`, OS `c909c862…` | Regras do proprietário | Não usar |

Pré-requisitos do teste real (para revisão, não executados): leitura PRE somente leitura dos itens 1, 3, 4 e 6; referência sintética ARBio nova com concessão exata curta;
sessões reais A/B; prova de que a entrega não cria título, NF ou mensagem.
