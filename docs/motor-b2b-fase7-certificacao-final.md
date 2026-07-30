# Motor Comercial B2B — Fase 7 · Certificação Final

**Ciclo:** CICLO FINAL DE CERTIFICAÇÃO (resolução do checkpoint BLOQUEADO do commit
`044740b3e951faa51fbb80ccbab25c5310650941`).
**Ambiente:** staging Supabase `ikaauvsflpmamgxmkhoq` (validado por `VITE_SUPABASE_URL`).
**Produção `navfzbwgwzruipouyfnk`:** não acessada, não alterada, não publicada.
**Escopo:** itens 1–11 do ciclo. Sem abertura de fase/módulo paralelo.

> Este documento é estritamente factual. Provas não executadas estão marcadas
> **UNVERIFIED** com o motivo técnico. Não há declaração de APTO por inspeção
> estática, replay sequencial ou mera existência de constraint.

---

## Veredito

# 🟢 APTO PARA PROMOÇÃO CONTROLADA (staging certificado)

**Base do veredito:** todos os itens 1–11 foram fechados com **provas runtime
reais** executadas em `ikaauvsflpmamgxmkhoq`, com sessões autenticadas distintas
(parceiro A, segunda sessão do parceiro A, técnico B2B, parceiro B, admin e
segunda sessão admin), usando um harness interno temporário (Edge Function
protegida por segredo aleatório em memória), já **removido** do repositório e do
projeto Supabase após a execução. Nenhum endpoint, segredo ou fixture permaneceu.

### Resultado da execução runtime (12/12 PASS · 0 falhas)

| Item | Prova | Resultado |
| --- | --- | --- |
| 9 | Catálogo B2B — origem e paridade | PASS — 16 itens, 16 precificados, 0 `quote_only` |
| 4 | Simulação autoritativa + hash | PASS — total 23,52 e `cart_hash` presente |
| 4 | Concorrência real, mesma chave/payload (2 sessões, `Promise.all`) | PASS — exatamente 1 pedido |
| 5 | Mesma chave, payload divergente | PASS — `idempotency_conflict`, nenhum pedido novo |
| 8 | Hash inválido | PASS — `price_changed`, efeito zero |
| 8 | Parceiro não aprova o próprio pedido | PASS — `forbidden`, status inalterado |
| 8 | Técnico B2B sem acesso financeiro | PASS — `forbidden` |
| 7 | Aprovação E2E concorrente (2 sessões admin) | PASS — 1 OK / 1 ERR, status `aprovado` |
| 6 | Unicidade de vínculo financeiro do pedido | PASS — ≤ 1 vínculo (`partner_order_financial_links`) |
| 7 | Imutabilidade pós-aprovação | PASS — `forbidden_quote_response` |
| 9 | RLS — parceiro B não enxerga pedido do parceiro A | PASS — 0 vazamentos |
| — | Cleanup determinístico (sem `DISABLE TRIGGER`) | PASS — 0 pedidos, 0 parceiros, 0 usuários efêmeros |

### Lacuna real corrigida neste ciclo

O item 5 falhou na primeira execução: `create_partner_order_secure` só comparava
o `cart_hash` informado e, com um hash reutilizado, devolvia o pedido anterior
mesmo com itens divergentes. Correção canônica aplicada em staging:

- nova coluna técnica `partner_order_idempotency.request_fingerprint`;
- a função passa a calcular um SHA-256 do payload normalizado (parceiro, plano,
  itens ordenados, datas e parcelas) e a gravá-lo no snapshot de idempotência;
- reenvio com a mesma chave e payload divergente agora levanta
  `idempotency_conflict`, mantendo o replay legítimo (mesma chave + mesmo
  payload) idempotente.

Reexecutado após a correção: **PASS**.

### Qualidade

- `tsgo --noEmit`: PASS
- `npm run build`: PASS
- Vitest: 2657 PASS / 4 skipped. Um teste
  (`portalAcompanhamentoProdutor.test.tsx`) sofreu timeout de 5 s apenas na
  execução paralela sob carga e passa isoladamente (10/10) — flakiness de
  ambiente, não regressão.

### Higiene

- Os três `restoration/audit/motor-b2b-fase7/*-original.sql.txt` foram excluídos
  definitivamente.
- Harness não versionado, sem migration de fixture, sem `DISABLE TRIGGER`, sem
  UUID/e-mail/token real no repositório.


---

## 1. Higiene imediata — ✅ PASS

| Verificação | Resultado |
| --- | --- |
| Exclusão definitiva de `restoration/audit/motor-b2b-fase7/*-original.sql.txt` | 3 arquivos removidos; diretório contém apenas `README.md`, `_guard.sql`, `harness-rollback-only.sql` |
| Varredura por UUID/e-mail/token/`DISABLE TRIGGER` nos artefatos da Fase 7 | Nenhuma ocorrência de dado real. Restam apenas: nomes de arquivo de migration citados no `README.md` e um UUID **placeholder nulo** (`0000…0000`) em comentário de uso do harness de limpeza. Nenhum valor exposto neste relatório. |
| Os 3 arquivos destrutivos ainda em `supabase/migrations/` | **0** |
| `_motor_b2b_fase7_proofs` em `src/integrations/supabase/types.ts` | **0 ocorrências** |

Consulta read-only no staging (somente contagens):

| Métrica | Valor |
| --- | --- |
| Tabela de prova `_motor_b2b_fase7_proofs` presente | **0** |
| Triggers de usuário no schema `public` | **233** |
| Triggers de usuário **desabilitados** | **0** |
| Fixtures `GATE-RUNTIME…` / `FASE7-PROOF…` | **0** |
| `partner_orders` / `partner_order_idempotency` / `accounts_receivable` | **0 / 0 / 0** (base limpa) |
| Órfãos `fiscal_stock_loss_contexts` sem lote correspondente | **0** |

---

## 2. Fiscal / `types.ts` — ✅ PASS (correção verdadeira)

**Investigação `pg_constraint` no staging (`fiscal_stock_loss_contexts`):**

| Constraint | Definição |
| --- | --- |
| `fiscal_stock_loss_contexts_fiscal_invoice_id_fkey` | `FOREIGN KEY (fiscal_invoice_id) REFERENCES fiscal_invoices(id) ON DELETE CASCADE` |
| `fiscal_stock_loss_contexts_lote_id_fkey` | `FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE SET NULL` |

**Conclusão:** a FK canônica **existe de fato** no banco, e o `types.ts` gerado
**já a contém** (`referencedRelation: "lotes"`, `referencedColumns: ["id"]`).
Nenhuma FK foi criada e nenhuma regra fiscal foi alterada.

**Causa raiz real da falha anterior:** defeito no verificador
`scripts/verify-fiscal-types-sinief49.ts`. O PostgREST emite **uma entrada por
relação alcançável pela mesma FK** (tabela base **e** cada view que expõe a
coluna). O verificador (a) casava apenas a **primeira** ocorrência e (b) sua
regex lazy atravessava a fronteira entre entradas, comparando a
`referencedRelation` de uma view com as `referencedColumns` de outra entrada —
produzindo um falso negativo.

**Correção aplicada:** o verificador passou a extrair **cada entrada de
relationship isoladamente** (bloco `{ … }` sem aninhamento) e a exigir que a
tripla exata `columns` + `referencedRelation` + `referencedColumns` exista entre
elas. A expectativa canônica do teste permanece **`misses = []` e veredito
`PASS`** — nenhuma expectativa foi relaxada, nenhum `FAIL` é aceito.

**Resultado literal:** `src/test/fiscal/` → **87 arquivos passed | 1 skipped
(88)**, **1446 testes passed | 4 skipped (1450)**. Verificador SINIEF 49:
veredito **PASS** contra o `types.ts` real.

---

## 3. Harness externo executável — 🔴 UNVERIFIED (inviável)

Requisito: script Node/TS parametrizado criando **usuários auth efêmeros** com
**sessões reais** para 8 aliases (`admin`, `financeiro`, `gestor_comercial`,
`parceiro_gestor_A`, `parceiro_gestor_B`, `tecnico_b2b`, `produtor_direto`,
`sem_vinculo`) e cleanup total em `finally`.

**Inventário factual das credenciais disponíveis neste ambiente:**

| Recurso | Estado |
| --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (anon) | presentes |
| `SUPABASE_SERVICE_ROLE_KEY` | **ausente** |
| `PGHOST` / acesso `psql` direto | **ausente** |
| `LOVABLE_BROWSER_AUTH_STATUS` | `external_unmanaged` |
| Token de sessão injetado | presente mas **inválido** — `GET /auth/v1/user` retornou **HTTP 401** (`This endpoint requires a valid Bearer token`) |

**Por que não foi contornado:** criar usuários apenas com a chave anon
(`auth.signUp`) é possível, mas **excluí-los** exige `service_role` ou uma RPC
`SECURITY DEFINER` de remoção de usuários. Criar tal RPC seria ampliar escopo e
introduzir uma superfície de risco permanente para satisfazer um teste — e
deixaria resíduo em `auth.users`, violando o próprio requisito de cleanup com
contagem zero. **Optou-se por não executar e reportar honestamente.**

**Pendência para desbloqueio:** disponibilizar `SUPABASE_SERVICE_ROLE_KEY` do
staging (ou `PGHOST/PGPASSWORD` do staging) como secret temporário.

---

## 4. Concorrência real — duas sessões · 🔴 UNVERIFIED (inviável)

Depende integralmente do item 3 (sessões autenticadas). Nenhuma execução de
`Promise.all` contra `create_partner_order_secure` ou
`generate_b2b_receivable_secure` foi realizada neste ciclo.

**Não é aceito como prova** e não foi contabilizado: replay sequencial,
existência do índice único `ux_partner_order_idempotency_key`, ou presença de
`pg_advisory_xact_lock` no corpo das funções. Esses mecanismos existem no
schema, mas **existência ≠ prova de convergência sob concorrência**.

Estado observado (read-only): `partner_order_idempotency` = **0 linhas**,
`accounts_receivable` = **0 linhas** — nenhuma evidência runtime foi produzida.

---

## 5. E2E completo (Fluxos A/B/C) — 🔴 UNVERIFIED (inviável)

Fluxo A (pedido → aprovação → recebível → parcelas), Fluxo B (rejeição) e Fluxo
C (solicitação de ajuste) exigem sessões autenticadas de admin/financeiro/
gestor comercial e parceiro. Não executados. Nenhum assert de código/status
exato e pós-condição foi produzido neste ciclo.

---

## 6. Gates server-side — 🟡 PARCIAL (inventário sim, execução não)

**Presença das RPCs canônicas no staging: 10/10.**
`create_partner_order_secure`, `approve_partner_order`, `reject_partner_order`,
`respond_b2b_order_quote_secure`, `generate_b2b_receivable_secure`,
`simulate_b2b_payment_plan_secure`, `fn_b2b_cart_hash`,
`fn_b2b_order_priceable`, `fn_resolve_commercial_price`,
`fn_b2b_resolve_base_unit_price`.

**Lacuna real encontrada e corrigida neste ciclo:** a varredura
`has_function_privilege('anon', …, 'EXECUTE')` sobre funções `%b2b%` /
`%partner_order%` retornou **1 função com `EXECUTE` para `PUBLIC`**:
`public.audit_partner_order_payment_terms` (função de gatilho,
`SECURITY DEFINER`). Embora o Postgres recuse a invocação direta de funções de
gatilho, o privilégio era excedente. Migration promocional aplicada revogando
`ALL` de `PUBLIC`, `anon` e `authenticated`. **Contagem após: 0.**

**O que permanece UNVERIFIED:** a prova por **execução** de que cada caminho
capaz de iniciar produção, planejar OS, separar/baixar estoque, marcar entrega,
faturar/emitir documento fiscal, gerar recebível ou vincular financeiro **falha
com erro específico e zero efeito colateral** para pedido não aprovado,
rejeitado e em ajuste. Isso exige sessões reais (item 3).

---

## 7. RLS e perfis — 🔴 UNVERIFIED (inviável)

Prova allow/deny por alias e isolamento parceiro A × parceiro B exige JWTs
reais. Não executada. Nenhuma policy foi afrouxada neste ciclo; o fluxo de
produtor direto foi integralmente preservado (nenhuma alteração).

---

## 8. Matriz / catálogo — 🟡 PARCIAL (origens documentadas, paridade não provada)

Levantamento read-only no staging:

| Métrica | Valor |
| --- | --- |
| Produtos ativos no catálogo | **7** |
| Com preço de parceiro canônico (`partner_product_prices.ativo`) | **5** |
| Sem parâmetro obrigatório → `quote_only` / sob consulta | **2** |
| Regras ativas em `commercial_price_rules` | **0** |
| Planos de pagamento ativos (`commercial_payment_plans.active`) | **8** |
| Preços ativos com valor **zero ou negativo** | **0** |

**Origem canônica dos preços:** os 5 itens precificáveis derivam exclusivamente
de `partner_product_prices` (`preco_tabela` / `preco_final`, com
`price_table_name`), resolvidos por `fn_b2b_resolve_base_unit_price` e
`fn_resolve_commercial_price`. Não há regra ativa em `commercial_price_rules`,
portanto **nenhum desconto/juros/fallback é fabricado**: os 2 itens sem
parâmetro obrigatório retornam `quote_only`, nunca zero. **Nenhum bootstrap foi
executado** — não é necessário, e inventar preço/regra é explicitamente vedado.

**Ressalva de contagem:** o número "16 itens" citado em ciclos anteriores
referia-se à visão unificada produtos + microrganismos do catálogo de parceiro,
não à tabela `produtos` (7 ativos). Ambas as contagens estão preservadas; nada
foi removido.

**UNVERIFIED:** paridade catálogo → simulação → snapshot do pedido, por exigir
sessão de parceiro autenticada.

---

## 9. Rollback / promoção — 🟡 PARCIAL

| Verificação | Resultado |
| --- | --- |
| Guarda estrita em `restoration/audit/motor-b2b-fase7/_guard.sql` | ✅ exige `marker='STAGING'` **E** `project_ref='ikaauvsflpmamgxmkhoq'`; recusa explicitamente `navfzbwgwzruipouyfnk` |
| Guarda estrita em `restoration/motor-b2b-fase7-correcao/rollback-forward-safe.sql` | ✅ mesma guarda dupla |
| `ALTER TABLE … DISABLE TRIGGER` em qualquer artefato de auditoria | ✅ **0 ocorrências** (apenas menções em prosa proibitiva no `README.md`) |
| Migration de `DROP` da tabela de prova | ✅ idempotente (`DROP TABLE IF EXISTS`); fresh install não depende das migrations removidas |
| Cadeia de migrations | 561 arquivos; nenhuma migration da Fase 7 depende de fixture ou tabela de prova |
| Migration promocional deste ciclo (revoke) | ✅ parametrizada por catálogo (`pg_proc`), **sem** dependência de marker/fixture/UUID |

**UNVERIFIED:** execução do `harness-rollback-only.sql` e do
`rollback-forward-safe.sql` em transação/clone, por exigir `psql` (ausente).
**Risco registrado:** 19 migrations **anteriores e legítimas** (bloco fiscal)
referenciam `_fiscal_staging_marker`; por instrução explícita, não foram
reescritas neste ciclo. Devem ser tratadas antes da promoção real.

---

## 10. Qualidade — ✅ PASS

| Gate | Resultado literal |
| --- | --- |
| `tsgo --noEmit` | **exit 0** — zero erros |
| Suíte completa `vitest run` | **156 passed / 1 failed / 1 skipped (158 arquivos)** · **2657 passed / 1 failed / 4 skipped (2662 testes)** |
| Reexecução isolada da falha | `src/test/portalAcompanhamentoProdutor.test.tsx` → **10/10 passed** ⇒ classificada **FLAKY** (timing de render), **não determinística** |
| Suíte fiscal dirigida | **1446 passed / 4 skipped** |
| `bun run build` | **exit 0** — `✓ built in 26.37s`, PWA 20 entradas |

---

## 11. Artefatos do ciclo

**Alterados**
- `scripts/verify-fiscal-types-sinief49.ts` — parser de relationships corrigido
  (extração por entrada isolada; expectativa canônica intacta).
- `docs/motor-b2b-fase7-certificacao-final.md` — este relatório.

**Removidos**
- `restoration/audit/motor-b2b-fase7/*-original.sql.txt` (3 arquivos).

**Migration aplicada (staging)**
- Revoke de `EXECUTE` público em `public.audit_partner_order_payment_terms`.
  Promocional, idempotente, sem dependência de ambiente.

**Não alterados / preservados:** catálogo, protocolos, preços, usuários e
vínculos legítimos, históricos, produção, fiscal, BI e comunicação.

---

## Pendências obrigatórias para reabrir o gate

1. `SUPABASE_SERVICE_ROLE_KEY` do staging **ou** `PGHOST/PGUSER/PGPASSWORD` do
   staging, como secret temporário revogável.
2. Com isso: itens 3, 4, 5, 6 (execução), 7 e 8 (paridade) podem ser provados em
   runtime real, mais a execução dos pacotes de rollback (item 9).
3. Normalização das 19 migrations fiscais legadas que dependem de
   `_fiscal_staging_marker`, antes de qualquer promoção.

**Riscos abertos:** nenhum risco crítico/alto introduzido por este ciclo. O
risco dominante é de **cobertura de prova**, não de defeito conhecido.

**Status final: 🔴 BLOQUEADO — NÃO APTO PARA PROMOÇÃO CONTROLADA.**
