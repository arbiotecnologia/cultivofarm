# Continuidade efetiva P0 — pacote executável offline

## Entrega e estado

**PASS para regressão local estrita; NO-GO para implantação, remediação histórica e ativação financeira/entrega.** Esta fase adiciona execução reproduzível, não apenas diagnóstico. Nenhum consumidor runtime, política comercial, título histórico ou pacote anterior foi modificado. Sem SQL hosted mutante, GRANT, migração, sessão/fixture real, publicação, cobrança ou fiscal.

Fontes: `escritores-saldo-canonico-20261028.md` e plano B2B original. Histórico Git inspecionado antes das edições; havia alterações de `package.json`/`bun.lock` do ambiente, preservadas sem revert ou edição. Resultados históricos 122/17/8/1 não foram sobrescritos ou somados à rodada atual.

## Catálogo canônico e recursão

Conexão confirmada `swzpzcwiasxmjutrmvkm`; quatro capturas **SELECT exclusivamente de metadados**, iniciadas em 29/10 13:47:57 UTC. `receivable-recursive-live-20261029.json` contém 1.267 funções SQL/PLpgSQL de public/platform_private/auth, 343 relações, colunas/defaults, enums, índices, ACL/owners/RLS/policies, constraints/FKs, triggers e definições de views; complemento inclui pg_rewrite e pg_policy. Capturas sequenciais não são snapshot transacional único: recaptura atômica será obrigatória no PRE futuro.

SHA256 do manifesto: `33bbe2abe605544b38c56cef50ac05ebc6ee035b4d02c0daf1da1b295d3ad56d`.

`audit-receivable-recursive.py` chega a ponto fixo conservador: **57 raízes, 454 funções, 150 relações, 5.826 arestas e 13 candidatos dinâmicos**. `dependency-edges.csv` discrimina PG_DEPEND, PG_TRIGGER, FK, expressão de view/policy e referência lexical. `object-pins.csv` registra OID/assinatura/MD5/owner/ACL/DEFINER. Comparação com os 59 corpos da captura de writers anterior: zero drift, conforme `drift.json`.

Ponto fixo **não é fechamento semântico**: nomes em comentários/strings e overloads são candidatos; PLpgSQL nem sempre registra chamadas em pg_depend; SQL montado, importadores externos, schemas/extensões/jobs e ramos condicionais não estão provados. Não executar a captura inteira como migrations: é manifesto de auditoria, não instalador.

| Corpo central | MD5 capturado |
|---|---|
| fn_generate_receivable_installments() | f632f15c9f46cb9889082fc533a27ea1 |
| generate_b2b_receivable_secure(uuid) | c49cc7ccedbcb28cba9b816b7e47c521 |
| generate_b2b_receivable_secure_impl(uuid) | 1bdac7fae6d702fb42d3a30539e9c9c3 |
| rpc_register_receivable_payment(uuid,jsonb) | db41f7e2cfcb196ef64536f62746f365 |
| fn_reverse_payment(uuid,text,text) | 9f2bfe6b1291cfeaa4814ee67c103be6 |
| fn_fin_aging(text) | 495aa7b0ff5bf32f362b763a2a3f0f07 |
| fn_fin_cashflow(date,date,text,text) | 197ffcc5735bcab0454e2936f1b76642 |

## Red/green executado — não dar PASS comercial ao baseline

`test-receivable-red-green.py` importa o harness monetário existente, sem módulo financeiro paralelo. PostgreSQL temporário socket-only em /tmp. Reutiliza corpos/trigger de geração, recálculo, pagamento, estorno, append-only e snapshot; substitui helpers permissivos anteriores pelos **nove corpos capturados Auth/ready/H15/RBAC**, sobre tabelas de identidade mínimas e sintéticas. Request claims locais não são JWT verificado. Inclui FKs monetárias exatas para pais AR/parcelas/eventos, organizações, métodos/contas e reversão; demais FKs e triggers tenant/SaaS/risco/identidade continuam excluídos explicitamente. Não emite ticket nem remove guard para alcançar sucesso B2B.

- **RED:** expectativa contratual inicial10.300 falha com10.600; replay pós-baixa que deveria manter7.550 falha com7.750. O teste estrito exige essas duas violações para provar reprodução; não as classifica como saldo correto.
- **GREEN somente sandbox:** duas substituições textuais com contagem fail-closed: geração externa grava ajuste operacional zero; loop do impl deriva juros de SUM(eventos). Original/net e schedule permanecem inalterados. Loop não é execução positiva completa do impl.
- Parcial3.000 + encargo100 + multa200 − desconto50 →7.550; segunda baixa1.000→6.550; estorno primeira→9.300. Snapshot juros iniciais300 permanece; alteração de original é negada atomicamente; ledger remanescente1.000.
- ACK perdido/replay mantém UUID e estado; estorno replay idempotente; green repetido não altera encargos. Mudança real da organização no perfil sintético e perfil inativo negam a baixa pelos helpers capturados.
- Wrapper e impl inteiros são instalados na sandbox; **somente caminho anônimo do wrapper foi executado**, negando auth_required sem efeitos. Caminho positivo inteiro permanece BLOCKED, não há origem/ticket/atestado inventado.

**Resultados atuais:** 37 assertions PG PASS, zero regressões inesperadas FAIL; duas violações contratuais RED esperadas, zero GREEN neste recorte. Matriz suplementar: **37 PASS / 0 FAIL / 6 BLOCKED / 1 NOT RUN**. Não converter essas assertions em37provasJWT ou aprovação de contabilidade. Runner sai nonzero em falha inesperada.

**Vitest:188/188 em11arquivos**, incluindo um teste que executa o PG; essas37assertions são internas a esse teste, não somar188+37 como testes independentes. Regressões: saldo/baixa/estorno/drawer/caixa/DRE/reconciliação/consumidor real de Entregas/confirmação contida. Warning de dimensões Recharts e Router/Dialog não representa falha; sem browser autenticado. Logs e hashes em `evidencias-cadeia-financeira-20261029/`.

Execução reproduzível:
```text
python3 scripts/financial-installments-initial-20261024/audit-receivable-recursive.py
python3 scripts/financial-installments-initial-20261024/test-receivable-red-green.py
bun run test src/test/financeiro/receivableRedGreenPostgres.test.ts
```

## Consumidores, aliases e BI: não mostrar títulos incorretos

Revisão independente dos17consumidores preservada em `consumers-prior-inventory.json`; não é certificação dos17fluxosUI. Saldo exigível proposto conserva total financiado em original e soma somente eventos; LIVE ainda não garante isso. `calcularSaldoRecebivel`/`saldoParcela` são aditivos, drawer/KPIs herdam o conflito. **Nenhuma troca unilateral de frontend** ou dedução automática dos juros históricos.

`balance`/`saldo` são projeções, não prova de campo canônico; AR usa received_amount/amount_received, AP usa amount_paid. Caixa realizado = eventos; caixa projetado aditivo; aging usa original−recebido−desconto e omite ajustes; DRE/competência/exposição/crédito requerem definição por métrica, não igualdade universal. Exportação/portal e dispatch por nome permanecem dependências explícitas. P1: aprovar definições e provar cada consumidor contra a mesma proveniência antes de promover writer; títulos ambíguos exigem conciliação, nunca recalcular taxas atuais.

## Elos faltantes e provas específicas

1. **P0 cadeia positiva B2B:** `generate_b2b_receivable_secure` contém B2B_INTERNAL_DOWNSTREAM_UNVERIFIED/C2_ACCOUNTING_PENDING; impl usa c2_external_origin_assert, billing eligibility, fiscal/priceable e links. Corpos/arestas capturados no manifesto; origem canônica autorizada e fiscal legítimo ainda não reproduzidos integralmente.
2. **P0 integração de guards:** relations AR/parcelas/eventos/recibos no closure mostram tenant_organization_guard, d51_5_validate_tenant_links, SaaS, risco/status e ACL/RLS. Harness tem cobertura monetária parcial, não essas cadeias completas. Roles/owners completos e todas FKs de auth/catalog/parceiros/fiscal precisam composição fiel.
3. **P0 SQL dinâmico/importação:** `closure.json.dynamic_candidates`, incluindo linhas137/146 do impl, e referências por overload/exportador requerem resolução de alvos/ramos; não alegar inexistência de importadores/compensações externas.
4. **P0/P1 consumidores e proveniência:** aging/BI/crédito/portal/export não têm semântica única homologada; histórico com eventos não pode ser classificado por coincidência de valores. Ledger testado = receivable_payments, não razão contábil.
5. **P0 JWT/RLS/esperas:** nenhum A/B real, revogação após espera provada, ACL efetiva cliente, rollback em homologação ou grupo inteiro atômico. Cancelamento sem tenant e demais FAIL históricos permanecem abertos, não resolvidos por green monetário.
6. Calendário fracionário, parcelas e billing continuam pendentes. Taxas ARBio×FSF confirmadas preservadas, sem repetir cálculos aprovados ou recalcular histórico.

**Não emitidos novos *.sql.review/PRE/POST/containment**: requisito do proprietário não atendido para candidato implantável. Pinos são evidência, não PRE executável. SQL review históricos do pacote continuam inativos e não são a correção desteP0.

## Critério de promoção e rollback futuro

Fechar/resolver as arestas pendentes → reproduzir wrapper/impl/autotrigger com identidade, ACL/RLS/FKs/guards reais, origem legítima e sem bypass → aprovação contábil de semântica por métrica → gerar corpos mínimos preservando OIDs/ACL, PRE/POST transacionais com hash/owner/ACL/policies/triggers/índices e falha dePOSTatômica → revisão independente → autorização específica para homologaçãoJWT A/B.

Homologação deverá provar:10.300 e7.550, snapshots, eventos/estorno/ACK/idempotência concorrente, revogação durante locks observável, cross-tenant negativo, na_aprovacao/na_entrega sem duplicar e zero título para reprovação/CQ. Fluxo envase/entrega/B2B permanece gate separado.

Rollback controlado futuro deve ser **deny-only**, sem GRANT nem restauração do writer vulnerável, preservar histórico/eventos/documentos e consumidores já compatíveis. Ensaiar PRE errado/POST errado/containment ACL antes de execução autorizada. Remediação histórica separada: diagnóstico agregado existente, conciliação por termos/schedule/eventos/auditoria, aprovação contábil/jurídica e autorização específica; nunca UPDATE retroativo automático.

## Arquivos e revisão

Novos: manifesto recursivo, auditor recursivo, runner red/green, teste Vitest, este relatório e evidências. Aditivos: plano original, roadmap e regra no AGENTS do pacote. Nenhuma edição em Entregas, consumidores runtime, DRAFT ou dependências. Revisões independentes confirmam limite lexical/loop/identidade sintética e NO-GO; lacuna de views/policies incorporada por pg_rewrite/pg_policy. A aprovação final do pacote não autoriza promoção comercial/jurídica ou operacional.