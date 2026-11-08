# Revisão d6cd95c0 — baseline real de recebíveis

**INATIVO / NÃO APROVADO. Nenhuma operação hospedada, implantação, publicação, NF, cobrança ou envio.**

## Evidência independente relatada

PRE READ ONLY no ref canônico falhou em TABLE_ACL e TRIGGERS; diagnóstico separado com hashes atuais passou demais guardas, mas não aprova candidato. Produção relatada PG17.6. ACL MD5 `93490607307bc83e36605d2c0e7dc4ec`, sem MAINTAIN `216bbf30d36c321cce767475338cacd0`: divergência não atribuída apenas à versão. Permissões anon/authenticated DELETE/INSERT/MAINTAIN/SELECT/UPDATE; postgres/service_role incluem também REFERENCES/TRIGGER/TRUNCATE; grantor postgres, sem grantoption.

Dez gatilhos MD5 `7c65f3e7fed5e102fd6c8b96bc9fe8e0`, incluindo `a00_delivery_no_downstream`. A função real foi extraída integralmente de `scripts/delivery-atomic-hardening-20261030/candidate.sql.review`, não do texto abreviado do relato. Corpo restaurado medido MD5 `95e0e5a84ef511cd72d7807351f61cf4`; owner/ACL postgres-only pinados no PRE, POST e rollback. O instalador B4 **não cria, substitui ou remove** essa guarda: exige dependência já instalada.

## Reconciliação local

`current_receivable_baseline.py` compõe a captura histórica com ACL relatada e o décimo gatilho, validando o hash agregado. O gerador consome essa composição sem editar as capturas históricas. PRE exige os dez; POST exige os dez mais os três gatilhos B4; rollback exige POST e preserva o conjunto. ACL exata permanece inalterada pelo candidato e é exigida nos três caminhos.

No harness descartável, restauram-se o corpo canônico e as permissões exatas, com todos os gatilhos ativos. A tabela de contexto já existente é reutilizada; `IF NOT EXISTS` está restrito à preparação local, não à instalação candidata. Primeira tentativa falhou ao tentar recriar o contexto, preservada em `evidence/test.*`; segunda passou. Nenhum pin foi removido para obter PASS.

Resultados em PG17.11 local, socket /tmp sem TCP, encerrado ao fim:
- **116/116, exit 0:** PRE, instalação composta B3/B4, POST, rerun negado, crédito, documentos/recebíveis exclusivamente fictícios, saldos/concorrência e rollback.
- **61/61, exit 0:** manifesto determinístico, dez gatilhos/pins/ACL e contenções.
- Negativas próprias da guarda real: INSERT/UPDATE/DELETE com contexto de entrega negados por `DELIVERY_DOWNSTREAM_FORBIDDEN`, sem desabilitar gatilhos.

Instalação SHA256 `0d533f85731a782fa851868b41adf6e7f8e1bbfd729f156be7d6499ac6b6fee6`. Fontes canônicas receberam reconciliação; SQL e resultados antigos no diretório pai permanecem históricos. Novos SQL gerados e evidências estão nesta pasta. Não somar contagens antigas às novas.

## Impacto no piloto e limites

Relato atualizado: cinco títulos ativos ARBio, 4 OPEN/1 OVERDUE, todos MANUAL customer-only do cliente/parceiro de teste4, todos com parcelas, sem ambiguidade. A matriz local já reproduz cinco títulos customer-only com parceiro único e parcelas; a exposição/baixa permanece explicitamente bloqueada por `MONEY_ORIGIN_UNPROVEN`, sem omitir dívida, backfill, reclassificação ou apagar títulos. Valores locais são fictícios, não saldos LIVE. A solução operacional continua exigir reconciliação autorizada da origem monetária; não foi inventada autoridade fiscal.

Auth/claims/schema e adaptadores fiscais/contábeis são costuras locais declaradas; provas B4 não representam JWT/RLS/Storage/produção ou E2E pedido→entrega. Composição E2E continua bloqueada por `order-e2e/` ausente; esta revisão fornece o baseline real necessário, não substitui os artefatos perdidos. Todos candidatos ainda não aprovados e hosted fechado.