# Cancelamento de parcela — autorização offline, 29/10/2026

**NO-GO para implantação/ativação.** Rodada restrita ao pacote existente; produção, runtime, histórico, política comercial e Entregas intocados. Nenhuma consulta hosted nova: fonte é o catálogo previamente capturado no ref `swzpzcwiasxmjutrmvkm`. Estado Git inicialmente limpo; histórico inspecionado, sem revert nem alteração de dependências.

## Resultado desta rodada, sem somar históricos

- PostgreSQL descartável: **55 assertions PASS / 0 FAIL inesperados**. Dessas, 35 caracterizam o capturado, **6 reproduzem o defeito de exposição de estado**, 14 verificam a transformação offline. PASS do teste RED não significa controle seguro.
- Matriz suplementar: **55 PASS / 0 FAIL / 1 BLOCKED / 1 NOT RUN**. O BLOCKED identifica o caminho B2B próprio integral; NOT RUN agrupa homologação JWT/RLS A/B e revogação durante espera.
- Vitest: **9/9 em 3 arquivos** (cancelamento, red/green monetário e semântica). Os 55 checks estão dentro de um teste Vitest, não somar contagens. O filtro adicional `saldoRecebivel.test.ts` não corresponde a arquivo existente e não executou testes.
- Não repetir taxas, não emitir SQL implantável. Transformação guardada por contagem textual somente em memória na sandbox, com diff não instalável.

## Causa e prova específica

Fonte `scripts/financial-installments-initial-20261024/receivable-recursive-live-20261029.json`, SHA256 `33bbe2abe605544b38c56cef50ac05ebc6ee035b4d02c0daf1da1b295d3ad56d`:

| Objeto | Referência no manifesto | Pino MD5 |
|---|---|---|
| RPC cancelamento, OID41873 | nome linha12336; corpo em12335 | `c7d30a08b1cbd00936cd83aa5bf3415c` |
| guard tenant, OID90690 | nome linha19606; corpo19605 | `d01a740c1e3e02407131d2b9228bf658` |
| trigger risco AR | nome3376; corpo3375 | `2d38119a0bb885471ba0112c300a4144` |
| recalc_partner_risk_score | nome11740; corpo11739 | MD5 registrado no catálogo original |

RPC DEFINER/postgres, EXECUTE authenticated/service_role/postgres, sem PUBLIC/anon. `is_financial_staff` usa Auth → uid-scope → has_role privado → perfil/readiness; H15 deriva empresa ativa do perfil, nunca do argumento de tenant. Claims locais são sintéticas, não JWT verificado.

SELECT FOR UPDATE por UUID **sem tenant**, antes de verificar status e pagamentos. RLS de parcelas protege o acesso direto, mas owner interno da RPC não fica sujeito a `force_rls=false`. O trigger INVOKER `tenant_organization_guard` mantém `auth.uid()` do cliente e nega UPDATE estrangeiro com `42501/tenant_scope_violation`. **Cancelamento estrangeiro OPEN não foi reproduzido como escrita indevida com guard ativo.** O achado anterior em harness sem esse trigger não é certificação de vulnerabilidade instalada.

**P0 de autorização residual reproduzido:** financeiro A distingue parcela estrangeira cancelada (“já cancelada”), com baixa ativa (“não estornados”) e UUID inexistente (“não encontrada”), nos ramos payable/receivable. Respostas exatas em `cancel-authorization/results.json`. A linha estrangeira é selecionada/bloqueada antes do guard; duração/consequência concorrente do lock não foi medida.

Casos executados nos dois ramos: próprios A/B permitidos no recorte sem origem B2B; persistência CANCELED e auditoria única; foreign SELECT oculto; DML direto zero linhas; estrangeiro OPEN negado atomicamente; anon ACL fechado; identidade vazia/inexistente/malformada, perfil/papel revogados negados; empresa inativa nega no UPDATE; replay não insere auditoria extra; baixa ativa própria preservada. Empresa inativa não significa gate de entrada fechado para erros anteriores ao UPDATE.

## Transformação mínima — exclusivamente offline

Resolver H15 antes de acessar alvo; negar tenant ausente; adicionar `organization_id=v_org` aos dois SELECT FOR UPDATE; uniformizar inexistente/estrangeiro em `FINANCIAL_SCOPE_DENIED/42501`. Preservar motivo, tipos, ambos ramos, pagamentos, UPDATE, snapshots e auditoria. Guard tenant permanece intacto. Testes GREEN: estrangeiro OPEN/CANCELED/PARTIAL e inexistente retornam a mesma negação, próprios/replay/baixa ativa preservados.

Não há writer runtime alterado nem arquivo *.sql.review novo. Não demonstrada reautorização após espera: a hipótese não está pronta para promoção.

## Menor impedimento B2B e limites

**BLOCKED executável:** fixture B2B legítima com partner_id dispara a geração de parcela → `tg_recalc_risk_on_ar_change`, corpo linhas internas7–9 → chamada `recalc_partner_risk_score(uuid)`. Esta dependência capturada não está composta no harness. O teste exige a falha e estado integral inalterado; não atribui sucesso ao cancelamento que nem chegou a ser enviado. Não remover trigger, não deixar partner_id NULL para afirmar positivo B2B, não inventar ticket.

Para compor: recálculo exige partner_risk_scores, partner_financial_settings, partner_orders, partner_accounts e financial_governance_audit_log, com suas ACL/guards/FKs/origem. Criação B2B integral/origem/fiscal permanece gate separado. **Próprios MANUAL positivos não certificam B2B positivo.**

Todos triggers capturados das duas parcelas instalados; FKs das parcelas/organização/pais e audit→auth.users compostas. Políticas parceiro/produtor `ari_partner_select_own_b2b` e `ari_producer_read` omitidas explicitamente por helpers transitivos ausentes, sem permissão falsa; atores testados são financeiro exclusivo. Demais políticas das parcelas preservadas. ACL de funções recomposta por nome único; owners SQL públicos postgres e claims Auth capturados; owner Auth real supabase_auth_admin não reproduzido como ownership. Tabelas mínimas de identidade não equivalem a Auth real.

Preparação/inspeção de fixtures como owner separadas das chamadas: **RPC somente em conexões LOGIN authenticated/anon, NOSUPERUSER/NOBYPASSRLS/NOINHERIT, sem membership postgres.** Estado compara pais, parcelas, audit, receivable/payable payments, recibos e schedule. Estado de risco ausente, explicitamente não provado; cadeia de INSERT de pagamentos, RLS de pais/audit SELECT, identidade integral e triggers de criação não composta. Sem evidência browser/PostgREST.

## Arquivos e execução

Novos: runner `test-cancel-authorization.py`, regressão `src/test/financeiro/cancelAuthorizationPostgres.test.ts`, este relatório e subpasta `evidencias-cadeia-financeira-20261029/cancel-authorization/` (resultados, matriz, captura textual, diff, logs e SHA256SUMS). Aditivos: AGENTS do pacote, roadmap, relatório da cadeia e **plano original**. Revisão independente confirmou 55 checks e NO-GO; recomendação de ampliar comparação de estado incorporada antes da execução final.

```text
python3 scripts/financial-installments-initial-20261024/test-cancel-authorization.py
bun run test src/test/financeiro/cancelAuthorizationPostgres.test.ts src/test/financeiro/receivableRedGreenPostgres.test.ts src/test/financeiro/receivableSemantics.test.ts
```

Promoção futura: compor risco/identidade/ACL/RLS/FKs integrais, revisão independente, reautorização fresca pós-lock/concorrência, PRE/POST atômico e pinos atuais, autorização específica de JWT/RLS A/B. BI/proveniência/saldo e calendário/parcelas/billing seguem abertos. Containment futuro deny-only, sem restauração vulnerável; nenhuma remediação histórica automática. Financeiro, envase/B2B/entrega continuam OFF.