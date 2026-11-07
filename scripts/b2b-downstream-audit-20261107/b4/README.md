# Reconciliação B4 útil sobre o B3 atual — revisões 458b6012, 4097d4e2 e manual-null-1813

**INATIVO, BLOQUEADO E NÃO APROVADO.** Nenhuma operação hospedada, NF/cobrança/aprovação contábil real, envio, publicação ou subagente. B3 e os 63 testes históricos não foram reabertos nem promovidos a E2E. O candidato mínimo da equipe vendedora permanece separado.

## Revisão atual

A evidência vigente está em `review-458b6012/manual-null-1813/`. O manifesto cobre **56 alterações**, incluindo funções, relações, coluna/FK, constraints, índices, gatilhos, owners e ACLs. Novos objetos exigem ausência; substituições exigem corpo/owner/ACL capturados e conferência LIVE independente.

O auditor relatou que `public.rpc_receivable_money_projection_v1` não possui overloads LIVE. Por isso ela é tratada como **CREATE**, sem baseline inventada: o PRE exige zero overloads por `pg_proc`, e o POST exige um overload owner-only. Os MD5/owners/ACLs relatados dos writers e a definição de `ux_ar_one_active_per_b2b_order` foram confrontados com capturas locais.

`02-install.sql.review` contém PRE + corpo + POST em transação, sem `GRANT` e sem stub operacional. `platform_private.b2b_integration_dependencies` permanece always-deny; instalação não significa operação. O rollback é deny-only e preserva histórico.

## Reprodução da forma real MANUAL

O auditor relatou cinco títulos MANUAL ativos da ARBio: 4 OPEN/1 OVERDUE, todos `partner_id=NULL`, com clientes ligados a parceiros ativos do mesmo owner. O agente não consultou, alterou, cancelou nem atribuiu origem a esses títulos.

A fixture descartável criou cinco históricos na mesma forma **antes** do trigger compartilhado candidato, com os nove gatilhos capturados da tabela ativos. O teste anterior à correção terminou **86/100, 14 falhas, exit 1**:

- exposição retornou `saldo_em_aberto=0` e `saldo_vencido=0`;
- baixa e nova simulação foram permitidas sem origem monetária;
- o OVERDUE continuou omitido após cancelar somente os quatro OPEN locais;
- múltiplos parceiros no mesmo cliente e conflitos `partner_id`/`customer_id`/owner não tiveram reconciliação explícita.

A correção adiciona somente `platform_private.b2b_receivable_partner_scope(uuid)`, owner-only, e o reutiliza no crédito e na baixa. O crédito seleciona por `partner_id` **ou** cliente ativo do mesmo owner em um único SELECT, sem UNION/dupla contagem. Ambiguidade, conflito e owner divergente têm erros específicos; escopo válido sem origem continua `MONEY_ORIGIN_UNPROVEN`. Não há backfill, cancelamento, exclusão histórica nem grant novo.

## Resultados independentes — não somar

1. **59/59, exit 0:** manifesto estático e determinismo.
2. **100/100, exit 0:** mesma matriz descartável após a correção, com PRE/install/POST/rerun, cinco históricos, atraso, ambiguidade, conflitos, baixa, pedidos, concorrência e rollback.
3. **132/132, exit 0:** reteste de embalagem inteira e unidades fiscais.
4. **63/63 históricos:** preservados separadamente, sem soma ou reclassificação.

A fixture reproduz ACL/RLS, 35 colunas, 16 constraints, 13 índices e 9 gatilhos capturados de `accounts_receivable`; os 32 gatilhos B3 do harness permanecem habilitados. Isso continua sendo componente sintético, não prova JWT/RLS/Storage/PostgREST.

## Impacto compartilhado e reconciliação

- MANUAL não B2B sem parceiro preserva criação de parcela e baixa legadas, sem `monetary_origin` inventada.
- MANUAL com escopo de parceiro, inclusive `partner_id=NULL` + cliente único, exige origem comprovada para exposição e baixa.
- Múltiplos parceiros no mesmo cliente negam `CREDIT_PARTNER_LINK_AMBIGUOUS`; divergência parceiro/cliente nega `CREDIT_PARTNER_CONFLICT`; parceiro inativo ou de outro owner nega `CREDIT_PARTNER_OWNER_MISMATCH`.
- Título com `partner_id` e cliente apontando para o mesmo parceiro é contado uma única vez.
- Nova simulação do parceiro fica indisponível durante a inconsistência e não cria pedido; pedidos atuais da fixture mantêm estado/hash.
- Efeito projetado, **não executado LIVE**: os cinco títulos na forma relatada bloqueiam exposição/baixa/simulação até reconciliação revisada. Essa decisão de bloqueio ainda exige revisão independente.
- Crédito e residual legado usam resolvedor monetário interno na organização vendedora. A projeção pública conserva ator, papel financeiro e tenant; os resolvedores internos são owner-only.
- Pedido interno sintético e writer integral antigo permanecem contidos, sem título/alocação.

## Unidades fiscais e downstream

`platform_private.b2b_allocate_document(uuid)` exige quantidade/unidade comercial e tributável, reconcilia kg↔g ou L↔ml pelo snapshot, rejeita fração de embalagem inteira e nunca converte peso em volume. O reteste cobre 2×25 kg, parcial 1 UN=25 kg, 0,5 UN, 50 kg≠50 UN, divergências, L/ml, parciais, replay e excesso, sem documento ou cobrança real.

Price B3, crédito total, snapshots, primeiro vencimento pela NF e calendário selado foram preservados. Calendário fora da cobertura falha fechado. Nenhum feriado ou regra comercial foi inventado.

## Pendências para o auditor

1. Revisar o resolvedor e a decisão de bloqueio projetada para os cinco títulos LIVE; nenhum deles foi alterado ou cancelado.
2. Medir READONLY demais títulos, ambiguidades, conflitos, owners e duplicidades antes de propor release.
3. Reconciliar MANUAL de parceiro sem apagar histórico, inventar origem/backfill ou abrir writers.
4. Conferir independentemente todos os corpos, overloads, owners, ACLs e relações LIVE.
5. Manter instalação e operação separadas; fiscal, contabilidade, recebíveis reais e comunicação continuam fechados.
6. JWT/RLS/Storage/PostgREST/browser e homologação real permanecem NOT_RUN.

Candidato SHA256: `b84ee8bb21321a63711e90e3871f0984423589589d98d556db9d8151b4f0ee47`.
Instalação revisável SHA256: `c5b6bbb709d4b2606bb5e79ef04ffd00823b977923c5070dbe703214b93988a3`.
Nenhum PASS local autoriza implantação, publicação, emissão, cobrança ou envio.
