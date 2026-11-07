# Reconciliação B4 útil sobre o B3 atual — revisões 458b6012, 4097d4e2 e manual-null-1813

**INATIVO, BLOQUEADO E NÃO APROVADO.** Nenhuma operação hospedada, NF/cobrança/aprovação contábil real, envio, publicação ou subagente. B3 e os 63 testes históricos não foram reabertos nem promovidos a E2E. O candidato mínimo da equipe vendedora permanece separado.

## Revisão atual

A evidência vigente é `review-458b6012/final-credit-terms-1833/`. A revisão de limite zero reproduziu **107/112 (cinco falhas)** e terminou **112/112**, com manifesto **61/61** e reteste fiscal **177/177**, exits finais 0 e sem soma entre suítes. `credit_limit=0` é configuração válida de limite zero: exposição positiva usa limite excedido; somente NULL é não definido, e negativo/NaN continuam fechados. O diff contém apenas `b2b_credit_config_block` e `fn_b2b_credit_exposure`; nenhuma configuração LIVE foi alterada.

O manifesto cobre **56 alterações**, incluindo funções, relações, coluna/FK, constraints, índices, gatilhos, owners e ACLs. Novos objetos exigem ausência; substituições exigem corpo/owner/ACL capturados e conferência LIVE independente.

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

`platform_private.b2b_allocate_document(uuid)` exige quantidade/unidade comercial e tributável, reconcilia kg↔g ou L↔ml pelo snapshot, rejeita fração de embalagem inteira e nunca converte peso em volume. `packaging_peso_liquido_kg_snapshot` é sempre kg; `packaging_unidade_conteudo_snapshot='g'` é apenas a unidade de exibição. O reteste cobre 2×25 kg, apresentação real de 500 g gravada como 0,500 kg, 1 UN=500 g=0,5 kg, negação de 1 UN/0,5 g, líquido sem pack por `volume_ml`, parciais, replay e excesso, sem documento ou cobrança real. Evidências específicas: `review-458b6012/fiscal-units-grams-1f4073/`.

Price B3, crédito total, snapshots, primeiro vencimento pela NF e calendário selado foram preservados. Calendário fora da cobertura falha fechado. Nenhum feriado ou regra comercial foi inventado.

## Pendências para o auditor

1. Revisar o resolvedor e a decisão de bloqueio projetada para os cinco títulos LIVE; nenhum deles foi alterado ou cancelado.
2. Medir READONLY demais títulos, ambiguidades, conflitos, owners e duplicidades antes de propor release.
3. Reconciliar MANUAL de parceiro sem apagar histórico, inventar origem/backfill ou abrir writers.
4. Conferir independentemente todos os corpos, overloads, owners, ACLs e relações LIVE.
5. Manter instalação e operação separadas; fiscal, contabilidade, recebíveis reais e comunicação continuam fechados.
6. JWT/RLS/Storage/PostgREST/browser e homologação real permanecem NOT_RUN.

Candidato SHA256: `7dde7f07bca49f6d89ca995f1b6eacfdbb84b0694565e2a4121b1a7bec4dc59f`.
Instalação revisável SHA256: `88e4d394b8719ddd0ddaed3a323a0be8ce89e62c7cc89834c48aaced066ecb5f`.
Nenhum PASS local autoriza implantação, publicação, emissão, cobrança ou envio.
