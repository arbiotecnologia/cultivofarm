# Continuidade efetiva P0 — pacote executável offline

## Entrega e estado

### Continuidade15:36 — partes confirmadas e limite explícito

Relatório `partes-credito-offline-20261029.md`; runner810PASS/0FAIL/1BLOCKED/1NOT RUN,14corridas e651checks anteriores preservados. Incremento159 separado:9RED/105GREEN/43contrato fiscal reduzido/2fragmento. Hipóteses offline corrigem prioridade tenantcomprador sobre credorowner e progressão com limitezero; exposição13.500 testada, original10.300/evento1.000 preservados. Próximo gate exato PAYMENT_TERMS_NOT_DEFINED; não seedado. Monetário37PASS/proveniência42PASS1BLOCKED/Vitest10PASS, evidências1536;68arquivoshistóricos intactos. ARvende/emite/recebe, FSFcompra; limite finito obrigatório decidido, valorreal/calendário/parcelas/gatilho ainda ausentes. Fiscal/contabilidade/origem/JWTreal NO-GO, sem runtime/produção.

### Continuidade15:03 — cadastro separado do financeiro, sandbox

Decisão recebida implementada offline; relatório `cadastro-financeiro-diferido-offline-20261029.md`.651PGPASS/0FAIL/1BLOCKED/1NOT RUN,288GREENdiferidos/9RED/8consumidorinativo;NULL e14corridas preservados. CadastroA/B sem settings/tickets, updaterCAS explícito onzevalores/método; riscoFKresolvida, ausente/incompleto impede financeiro no recorte. Contabilidade/origem seguem negadas mesmo após configurar. Monetário37PASS/proveniência42PASS1BLOCKED/Vitest10PASSsem erros, fontes e evidências rodada1503. Sem runtime/SQLimplantável/produção. Não aguarda contrato cadastro; calendário/parcelamento, contabilidade/origem/fiscal/BIproveniência e JWT/RLSreal continuam pendentes.

### Continuidade14:50 — risco composto, cadastro bloqueado legitimamente

Runner existente+`cancel-risk-composition.py`:263PASS/0FAIL inesperados/1BLOCKED/1NOT RUN; cinco tabelas e20corpos capturados,25checksmetadados, calcA/B atingeFKparceiro23503, cadastroA/B negaC2P1_SETTINGS_WRITE_CLOSED atomicamente sem ticket. Menor decisão humana: cadastro com settings ausentes e configuração posterior ou inicialização transacional de11valores/método explícitos? Caminho direto e updater existente não compõem cadastro atual. Não contornar. Proveniência42PASS/0FAIL/1BLOCKED:14trechos=1EXECUTE/4textformat/9literais; alvosOS/onfarm finitos resolvidos sem operação,17fingerprints source-only. Monetário37PASS(18RED/19GREEN), Vitest10/10em4arquivos;14corridas reexecutadas. Evidências novas revisão1450, históricos preservados/hashes28OK/7MISMATCH/4MISSING explicitados; detalhes no relatório cancelamento. Sem SQL implantável/runtime/produção; NO-GO integral.

### Revisão14:28 — autorização pós-lock somente offline

Nova pasta `cancel-authorization-revision-1428`:189assertionsPGPASS/0FAIL inesperados,1BLOCKED/1NOT RUN; Vitest9/9em3arquivos.14corridas locais com PID exato do holder; RED papel revogado ainda cancela, GREEN rechecagem separada com helpers STABLE intactos nega emREAD COMMITTED; contraprovaREPEATABLE READ retém snapshot, hipótese nega isolamento diferente. Foreign PARTIAL com evento1.000 retorna42501/mensagem exata como inexistente e não toma lock estrangeiro no ensaio. Detalhes/limites no relatório específico. Histórico antes:21hashesOK/1divergente(red-green.json)/4logs ausentes, preservados sem reparo silencioso; fontes do runner evoluem com hashes novos. Produção/runtime intactos e NO-GO integral mantido.

### Rodada adicional — cancelamento entre empresas, 29/10

Relatório específico `cancelamento-parcela-autorizacao-20261029.md`; evidências em `evidencias-cadeia-financeira-20261029/cancel-authorization/`. **55 assertions PG PASS/0 FAIL inesperados, 1 BLOCKED/1 NOT RUN na matriz; Vitest9/9em3arquivos**, sem somar históricos. Guard tenant capturado nega escrita estrangeira OPEN; seis checks RED reproduzem exposição de status/pagamento antes do UPDATE nos dois ramos. Transformação mínima somente sandbox uniformiza alvo fora do tenant. Próprio MANUAL positivo não certifica B2B: criação de fixture B2B bloqueia em recalc_partner_risk_score, sem guard/ticket inventado. NO-GO e demais gates preservados; sem runtime/produção/SQL implantável.

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

Revisão independente dos17consumidores preservada em `consumers-prior-inventory.json`; fingerprints atuais em `consumers-current.json`:17comparações, zero drift. Não é certificação dos17fluxosUI. Saldo exigível proposto conserva total financiado em original e soma somente eventos; LIVE ainda não garante isso. `calcularSaldoRecebivel`/`saldoParcela` são aditivos, drawer/KPIs herdam o conflito. **Nenhuma troca unilateral de frontend** ou dedução automática dos juros históricos.

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

Novos: manifesto recursivo, auditor recursivo, runner red/green, teste Vitest, este relatório e evidências. Aditivos: plano original, roadmap e regra no AGENTS do pacote. Nenhuma edição em Entregas, consumidores runtime, DRAFT ou dependências. Revisões independentes confirmam limite lexical/loop/identidade sintética e NO-GO; lacuna de views/policies incorporada por pg_rewrite/pg_policy. Revisão final reexecutou37assertions e conferiu hashes; ressalva ADD CONSTRAINT não idempotente em schema arbitrário não se aplica ao schema sempre novo do runner (não instalador). Evidência em `independent-review.md`. SHA256SUMS conferido; git diff --check sem erros; build automático observado OK às14:04:18UTC. A aprovação final do pacote não autoriza promoção comercial/jurídica ou operacional.
## Complemento 18:36 — método padrão BOLETO BANCÁRIO (decisão humana 2026-10-29)
- Registrado em `active_candidate.default_payment_method` (decision `BOLETO_BANCARIO`); removido de `undefined`. Emissão, integração bancária, conta e credenciais: NÃO autorizadas.
- Catálogo capturado (`hosted-capture.json`): `public.payment_methods(id,name,active,created_at)`, sem coluna código e **sem linhas capturadas**. Resolução real: BLOCKED `PAYMENT_METHOD_CATALOG_ROWS_NOT_CAPTURED` — exige captura read-only autorizada das linhas para confirmar exatamente um registro ativo de nome "Boleto Bancário". Nenhum UUID inventado/ativado.
- `resolve_payment_method`: nome normalizado exato (sem fuzzy), ausente/inativo/ambíguo/sem decisão rejeitados; fixture sintética marcada. Motor 374/0 FAIL (PAYMENT_METHOD 12 PASS); PG gerador 189/0 sem mudança; Vitest priceScheduleOffline 1/1. Evidência `payment-method-boleto-1836/`.

## Revisão 18:45 — gerador Price (candidato anterior 1f85d817 → `1fcb1dca…`), PG descartável apenas
- **Serialização por devedor:** advisory lock `price-debtor|org|cliente` após o lock da chave (ordem fixa chave→devedor para todos); reautoriza sessão/staff/tenant depois da espera; exposição lida após o lock em snapshot fresco de READ COMMITTED. REPEATABLE READ/SERIALIZABLE recusados antes de qualquer lock/escrita (`PRICE_ISOLATION_READ_COMMITTED_REQUIRED`, 0A000).
- **Corrida provada:** atores U/U2, chaves diferentes, mesmo devedor; cada pedido (R$20.000 financiado) cabe isolado, soma excede: espera confirmada por `pg_blocking_pids`, exatamente 1 sucesso + 1 `LIMIT_EXCEEDED_BLOCK`, 1 título/recibo. Outro devedor não serializa. Staff revogado durante a espera → negado após o lock, estado inalterado. Seam de revogação sintético (`test_staff_revoked`).
- **Recibos:** trigger BEFORE TRUNCATE adicionado; DELETE/TRUNCATE testados.
- **d51_5:** corpo capturado (md5) e triggers em 4 tabelas compostos sobre fixture sintética `clientes(id,tenant)`; cliente estrangeiro e parcela re-apontada negados. Não é prova de RLS real.
- **Teto numérico:** limite agora 999.999.999.999,99 (numeric(14,2)); 1e12, 1e20 e 26 dígitos rejeitados com `TABLE_AMOUNT_INVALID`, sem overflow; no RPC o teto cai em `LIMIT_EXCEEDED_BLOCK` antes de qualquer escrita.
- **Correção de relato:** "10300 com baixa 7550, saldo 2750" é só verificação de preservação de fixture, não a regressão P0. Os testes P0 ORIGINAIS foram reexecutados sem alteração: RED 10600/7550/7750, GREEN 10300/7550/7550 — 37 PASS/0 FAIL.
- Resultados: PG gerador 217/0 FAIL. Exposição/settings/NF/contabilidade continuam deny-only, com stubs SINTÉTICOS. Evidência `price-generator-pg-review-1845/`. Não é E2E nem homologação.

## Complemento 18:41 — catálogo real de métodos (captura read-only do proprietário)
- Ref `swzpzcwiasxmjutrmvkm`, `BEGIN READ ONLY`, sem mutação: única linha ativa `AUDIT-AR-20260922 - Sem transferencia`. Cópia sanitizada (id por sha256) em `payment-methods-readonly-capture-20261029.json`.
- Blocker atualizado: `PAYMENT_METHOD_BOLETO_NOT_IN_CATALOG` (substitui ROWS_NOT_CAPTURED). Decisão BOLETO mantida; método AUDIT não reutilizado; nada criado/ativado; UUID real não usado como fixture.
- Motor 376/0 FAIL (PAYMENT_METHOD 14); Vitest 1/1; PG não reexecutado (lógica SQL inalterada). Evidência `payment-method-boleto-catalog-1841/`.

## Complemento 18:42 — aliases explícitos e captura de homologação
- Resolver aceita só aliases normalizados explícitos `Boleto` e `Boleto Bancário` (sem fuzzy: "Boleto Pix", "Boletos" etc. rejeitados), exige ambiente declarado (production `swzpzcwiasxmjutrmvkm` | homologation `vrlcdwmlytukrjezrrnf`) e exatamente um ativo; ambos aliases ativos → `PAYMENT_METHOD_BOLETO_AMBIGUOUS`.
- Homologação (captura read-only do proprietário): "Boleto" ativo resolve — evidência de leitura, NÃO configuração aplicada nem permissão de emitir/instalar; UUID sanitizado, nunca transferido para produção.
- Produção permanece `PAYMENT_METHOD_BOLETO_NOT_IN_CATALOG`. Motor 387/0 FAIL (PAYMENT_METHOD 25); Vitest 1/1; PG não reexecutado (SQL inalterado). Evidência `payment-method-aliases-homolog-1842/`.

## Revisão 18:43 — reautorização antes do replay (candidato `c25ae5ec…`)
- Após o lock da CHAVE e antes de ler/retornar recibo: sessão, staff (`IS NOT TRUE` nega NULL) e tenant revalidados; segunda revalidação após o lock do devedor mantida.
- Teste: replay legítimo idempotente; segunda sessão bloqueada na mesma chave (`pg_blocking_pids`), revogação commitada antes da liberação → negado, resultado antigo não exposto, estado inalterado; após nova concessão sintética, replay idempotente sem escrita.
- PG 221/0 FAIL (217 anteriores + 4); P0 originais 37 PASS/0 FAIL (10600/7550/7750 RED, 10300/7550/7550 GREEN). Evidência `price-generator-pg-replay-reauth-1843/` (manifesto novo verificado).
- Manifesto `price-generator-pg-review-1845/SHA256SUMS` conferido contra blobs do commit `eb6430b0…`: 5/5 OK.
- Limitações: revogação via seam sintético; exposição/settings/NF/contabilidade deny-only com stubs; sem JWT/RLS A/B real, PostgREST ou E2E; Boleto ausente em produção.

## Rodada 18:49 — referência de homologação e exposição canônica (candidato `961a9aea…`)
- **Homologação (captura read-only do proprietário, `vrlcdwmlytukrjezrrnf`):** 0 pedidos, 0 NF, 0 documentos; parceiro único sem `client_id`/proprietário comercial; fiscal NOT_CONFIGURED. Blocker `HOMOLOG_REFERENCE_ABSENT`; nada inventado.
- **Exposição:** candidato agora compõe o `fn_b2b_credit_exposure` capturado (md5 conferido) via parceiro único ativo do devedor sob o proprietário comercial (`CREDIT_PARTNER_LINK_REQUIRED/AMBIGUOUS`), mais títulos Price abertos do tenant+devedor que a função canônica não enxerga, contados uma vez. Bloqueia `OVERDUE_BLOCK`/`NO_LIMIT_DEFINED` e limite do parceiro ≠ 100.000.
- **Lock compartilhado:** após chave→devedor, o candidato toma a chave canônica `b2b_credit:<parceiro>` (a mesma de create/approve/quote/guard de crédito), reautoriza e lê exposição fresca.
- **Testes (sintéticos):** aberto 10.000−1.000=9.000; comprometido 2.000; pendente 1.500; excluídos gerado/vinculado/cancelado/rascunho/outro parceiro → 12.500. Corrida com writer B2B segurando `b2b_credit`: Price espera, pedido 50.000 commita, Price 40.000 recusado. Restante exato 37.500 aceito; +0,01 recusado. Gates de vínculo/limite e tenant B negados.
- **Risco reproduzido (promoção negada):** títulos Price não levam `partner_id` (o writer de título capturado não o aceita), então `fn_b2b_credit_exposure` dá `OK` para +1.000 com exposição real de 101.000. Na hipótese só no harness com `partner_id` gravado, o canônico bloqueia sem contagem dupla. Além disso, writers de recebível fora do B2B não usam o lock `b2b_credit`.
- PG 241/0 FAIL; P0 originais 37/0 (10600/7550/7750 RED, 10300/7550/7550 GREEN). Manifesto `price-generator-pg-replay-reauth-1843` × commit `04a31563…`: 5/5 OK. Evidência `price-generator-pg-canonical-exposure-1849/`, com 6 entradas no manifesto.
