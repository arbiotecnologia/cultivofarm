# Motor B2B — Fase 7 — Certificação Final

**Ambiente:** staging Supabase `ikaauvsflpmamgxmkhoq` (AR Bio TEMP).
**Produção `navfzbwgwzruipouyfnk`: intocada.** Nenhuma publicação/deploy realizado.

## VEREDITO

> ## 🔴 BLOQUEADO — NÃO APTO PARA PROMOÇÃO CONTROLADA

Motivo: dos 12 itens exigidos pela auditoria externa, **5 foram corrigidos e
verificados**, **1 está em FAIL conhecido e honesto** e **6 permanecem
UNVERIFIED** por exigirem execução multi-sessão/E2E autenticada que não foi
realizada nesta entrega. Nenhuma ressalva está mascarada como aprovação.

---

## 1. O que foi corrigido nesta entrega

### Item 1 — Cadeia de migrations limpa ✅ CORRIGIDO

Os três arquivos destrutivos foram **removidos de `supabase/migrations/`**:

| Arquivo original | Destino |
|---|---|
| `20260730025626_98ab65d6-…​.sql` | `restoration/audit/motor-b2b-fase7/harness-p1-p11-original.sql.txt` |
| `20260730025843_e160c294-…​.sql` | `restoration/audit/motor-b2b-fase7/harness-p1-p11-retry-original.sql.txt` |
| `20260730025923_7c153213-…​.sql` | `restoration/audit/motor-b2b-fase7/proofs-table-original.sql.txt` |

Extensão `.sql.txt` para garantir que nenhum runner os execute. Nenhuma
migration legítima anterior foi reescrita.

A tabela de prova `public._motor_b2b_fase7_proofs` saiu do schema promocional
via migration idempotente `DROP TABLE IF EXISTS public._motor_b2b_fase7_proofs;`
— no-op em qualquer ambiente onde ela não exista (inclusive produção).
`types.ts` é regenerado a partir do schema, portanto a referência desaparece.

### Item 2 — Guarda de ambiente estrita ✅ CORRIGIDO

`EXISTS(_fiscal_staging_marker)` foi substituída, em todos os scripts de
teste/rollback, por uma guarda que:

1. aborta se a tabela de marker não existir (ambiente não identificado);
2. aborta explicitamente se `project_ref = 'navfzbwgwzruipouyfnk'` (produção);
3. aborta se `project_ref <> 'ikaauvsflpmamgxmkhoq'`;
4. aborta se **qualquer** linha do marker contiver o ref de produção.

Arquivos: `restoration/audit/motor-b2b-fase7/_guard.sql`,
`restoration/motor-b2b-fase7-correcao/rollback-forward-safe.sql`,
`scripts/tests/harness/gate-runtime-cleanup.sql`.

### Item 3 — Sem `DISABLE TRIGGER` ✅ CORRIGIDO (parcial)

`restoration/audit/motor-b2b-fase7/harness-rollback-only.sql` é
**rollback-only** (`BEGIN … ROLLBACK`), parametrizado (`-v partner_id=…`), sem
UUID/usuário real, e **não contém nenhum `ALTER TABLE … DISABLE TRIGGER`**.
Ele verifica:

- **V1** — nenhum trigger de usuário em `public` com `tgenabled = 'D'`;
- **V2** — zero fixtures remanescentes (`GATE-RUNTIME%`, `FASE7-PROOF%`) em
  `partner_orders` e `partner_order_idempotency`;
- **V3** — nenhuma função B2B sensível executável por `anon`/`PUBLIC`.

⚠️ **UNVERIFIED:** o harness foi escrito e revisado, mas **não foi executado**
nesta entrega (falta de sessão `psql` contra o staging neste passo). V1/V2/V3
permanecem sem evidência runtime desta rodada.

### Item 10 — Teste fiscal rigoroso restaurado ✅ CORRIGIDO → ❌ FAIL honesto

Em `src/test/fiscal/sinief49/staging/verifier.test.ts` a expectativa que
**aceitava `FAIL`** (`expect(misses.length).toBeGreaterThan(0)` /
`expect(verdict).toBe("FAIL")`) foi removida e substituída pela expectativa
canônica exata:

```ts
expect(misses).toEqual([]);
expect(verdict).toBe("PASS");
```

Nenhuma regra fiscal foi alterada para o teste passar. Como o `types.ts` real
ainda não cobre 100% do contrato SINIEF 49, **este teste FALHA** — e essa falha
é, por si só, motivo suficiente para manter o gate **REJEITADO**.

### Item 11 — Rollback forward-safe ✅ PARCIAL

`restoration/motor-b2b-fase7-correcao/rollback-forward-safe.sql` é
parametrizado, sem UUID real, não remove dados legítimos, não restaura grants
menos seguros e agora usa a guarda estrita. Nenhuma migration promocional
depende de fixture, tabela de prova ou marker staging-only.
⚠️ **UNVERIFIED:** não foi testado em transação/clone nesta rodada.

---

## 2. Itens que permanecem UNVERIFIED

| # | Exigência | Status | Motivo |
|---|---|---|---|
| 4 | Concorrência multi-sessão real de checkout (2 conexões simultâneas, mesma `partner_id` + `idempotency_key` + payload; convergência para 1 pedido; payload divergente ⇒ `idempotency_conflict`) | ❌ UNVERIFIED | Exige duas sessões autenticadas simultâneas contra o staging. Replay sequencial anterior **não conta** e foi retirado como evidência. |
| 5 | Recebível concorrente real (2 chamadas simultâneas ⇒ 1 `receivable_id`, 1 vínculo, cronograma exato, soma das parcelas = total snapshot) | ❌ UNVERIFIED | Mesma limitação. |
| 6 | E2E completo com pedidos separados: criação → aprovação → recebível → parcelas; rejeição válida; solicitação de ajuste com retorno de estado | ❌ UNVERIFIED | Não executado nesta rodada com asserts de código/status exato + pós-condição no banco. |
| 7 | Inventário e prova server-side de **todos** os caminhos que iniciam produção, separam/baixam estoque, marcam entrega, faturam/emitem fiscal, geram recebível ou vinculam financeiro, para pedido não aprovado/rejeitado/em ajuste | ❌ UNVERIFIED | O inventário anterior (17 RPCs / 11 gates) não cobre Edge Functions nem prova ausência de efeito colateral. |
| 8 | RLS/perfis com sessões autenticadas reais (admin/financeiro/gestor comercial, parceiro gestor, técnico B2B, produtor direto, usuário sem vínculo), allow/deny e isolamento entre parceiros | ❌ UNVERIFIED | Exige sessões autenticadas removíveis. Fluxo de produtor direto **preservado sem alteração**. |
| 9 | Matriz comercial/catálogo: bootstrap idempotente a partir de preços/regras canônicos, 16 itens preservados, origem documentada, `quote_only` quando faltar parâmetro | ❌ UNVERIFIED | A checagem anterior (“16/16 com `preco_parceiro`”) não documenta a origem de cada preço/regra nem prova o caminho `quote_only`. Nenhum preço, desconto, juros ou fallback foi inventado nesta entrega. |

---

## 3. Preservação

Nenhuma alteração foi feita em catálogo, protocolos, preços, usuários/vínculos,
históricos, produção, fiscal, BI ou comunicação. A única mudança de schema é o
`DROP TABLE IF EXISTS` de uma tabela exclusivamente de teste.

## 4. Gates de qualidade

| Gate | Resultado |
|---|---|
| Typecheck | ver seção de execução abaixo |
| Vitest (suite fiscal SINIEF 49) | **FAIL esperado** — expectativa canônica restaurada (item 10) |
| Build | não executado nesta rodada |
| Concorrência runtime | não executada |

## 5. Próximo passo obrigatório

Executar, contra o staging `ikaauvsflpmamgxmkhoq`, com credenciais temporárias
removíveis: (a) o harness rollback-only, (b) o script externo de concorrência
multi-sessão (itens 4 e 5), (c) o E2E do item 6, (d) o inventário/prova do item
7, (e) as provas de RLS do item 8 e (f) a documentação de origem de preços do
item 9. Somente depois disso o veredito pode ser reavaliado.
