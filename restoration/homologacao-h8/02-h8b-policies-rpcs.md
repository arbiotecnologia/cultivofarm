# H8-B — Consolidação segura de políticas RLS e revisão de RPCs `SECURITY DEFINER`

**Ambiente:** exclusivamente Supabase de homologação `ikaauvsflpmamgxmkhoq`.
**Produção `navfzbwgwzruipouyfnk`:** não consultada, não alterada, não promovida. Nenhum
documento fiscal emitido.
**Commit inicial autoritativo:** `3a1e9d03e486b5d3bab1259f9c637e186c841e42`.

---

## 1. Gate inicial (fail-fast)

| Verificação | Resultado |
| --- | --- |
| `check-frontend-binding.sh` | **FALHOU na primeira execução** — `.env` regenerado para o sandbox `yzszlzjpovmcteuxjznj` |
| Correção aplicada | `.env`, `src/integrations/supabase/client.ts` e `types.ts` restaurados byte a byte do baseline autorizado `6c08a8f8` |
| `check-frontend-binding.sh` (reexecução) | **PASS** — staging `ikaauvsflpmamgxmkhoq` |
| `h7p-guard-repo-only.sh` | **PASS** — 59 repo-only íntegras e ausentes do ledger |
| Ledger inicial | **657** (inclui `20261001000000`, `20261001010000`, `20261001020000`) |
| Invariantes iniciais | `SECDEF=648`, `SECDEF_NOSP=0`, `ANON_SECDEF=2`, `VIEWS=24/23 invoker`, `CRON=6`, `RLS_SEM_POLICY=7`, `POLICIES=541`, `MULTI_GROUPS=44` |

Todas as leituras/escritas de banco passaram por `restoration/os-e2e/staging-psql.sh`,
que recusa DSN de produção. Nenhum DSN, chave, senha ou material de certificado foi
impresso.

> **Nota metodológica.** A fonte de verdade das métricas é a medição oficial do Advisor no
> projeto Supabase de homologação `ikaauvsflpmamgxmkhoq`. As consultas de catálogo
> executadas via `staging-psql.sh` são métricas **próprias e complementares** (contagem
> bruta de policies e de grupos locais tabela+cmd+roles) e **não** são intercambiáveis com
> a contagem do Advisor, que agrupa por tabela + role + ação. Ver §6.1.

### Revalidação independente

Validação independente executada no Supabase oficial de homologação
`ikaauvsflpmamgxmkhoq` em **2026-09-04, após o commit autoritativo
`c322448d258601b4b035f0becca483f968cddb33`**. Resultados oficiais confirmados:

- `ledger=658`; policies em `public` = 540.
- Policy `Staff can view all client documents` **ausente**; keeper
  `Staff can manage client documents` **presente**.
- `SECDEF=648`, sem `search_path`=0, `anon`=2, `authenticated`=378.
- Views = 24, sendo 23 `security_invoker` (17 com `security_invoker=true` + 6 com
  `security_invoker=on`) e 1 interna sem grants. Cron = 6.
- **Advisor de performance: 512 = 147 WARN + 365 INFO** —
  `multiple_permissive_policies=146`, `duplicate_index=1`,
  `unindexed_foreign_keys=172`, `unused_index=193`.
- **Advisor de segurança: 393 = 383 WARN + 10 INFO + 0 ERROR** —
  `authenticated_security_definer_function_executable=378`,
  `anon_security_definer_function_executable=2`, `rls_enabled_no_policy=10`,
  `extension_in_public=2`, `auth_leaked_password_protection=1`.


---

## 2. Inventário `multiple_permissive_policies`

- 541 policies em `public` antes da fase.
- 44 grupos locais (mesma tabela + mesmo `cmd` + mesmo conjunto de roles) com mais de uma
  policy permissiva; após expansão por comando/role, 117 grupos, correspondentes às
  **146 ocorrências** oficiais.
- Inventário completo (tabela, comando, roles, `USING` e `WITH CHECK` integrais) coletado
  de `pg_policies` e analisado programaticamente.

### 2.1 Matriz de equivalência

| Critério de consolidação | Resultado |
| --- | --- |
| Subsunção literal dentro do mesmo `cmd` + roles | **0 candidatos** |
| Subsunção lógica por reescrita de predicado | não demonstrável sem alterar semântica → **não alterado** |
| Cobertura de `FOR ALL` sobre comando específico com `USING` idêntico | **1 candidato provado** |

**Único caso provado — `public.cliente_documentos`, role `{authenticated}`:**

| Policy | Comando | `USING` | `WITH CHECK` |
| --- | --- | --- | --- |
| `Staff can manage client documents` (mantida) | `ALL` | `administrador OR gestor OR administrativo` | idem |
| `Staff can view all client documents` (removida) | `SELECT` | **expressão idêntica** | ausente |

Prova: em `SELECT`, a policy `FOR ALL` já contribui exatamente a mesma expressão `X` ao
`OR` permissivo. `X OR X ≡ X` — o conjunto de linhas visível por perfil é rigorosamente o
mesmo. `INSERT`, `UPDATE` e `DELETE` não são tocados.

Policies preservadas na mesma tabela (semânticas distintas, mantidas intactas):
`Admins can delete cliente_documentos`, `Users can delete their own client documents`,
`Users can insert their own client documents`, `Users can only view their own client
documents`, `Users can update their own client documents`.

**Consequência para o Advisor (importante).** A remoção é semanticamente segura, mas o
Advisor conta **grupos tabela + role + ação**, não policies brutas. Em
`cliente_documentos / authenticated / SELECT` ainda permanecem duas policies —
`Staff can manage client documents` (via `FOR ALL`) e
`Users can only view their own client documents`. Portanto o grupo **continua gerando
1 finding** e `multiple_permissive_policies` **permaneceu 146**. Qualquer afirmação de
146 → 145 é incorreta e foi retificada neste relatório.

### 2.2 Não consolidado (pendência formal)

Nomenclatura exata das métricas remanescentes após H8-B:

- **43 grupos locais remanescentes** (métrica própria: mesma tabela + mesmo `cmd` + mesmo
  conjunto de roles, com mais de uma policy permissiva) — eram 44 antes da fase.
- **117 grupos expandidos / finding-groups oficiais continuam**, totalizando as
  **146 ocorrências** do Advisor, inalteradas.

Esses grupos têm predicados e/ou perfis diferentes entre si. Consolidá-los mudaria a
lógica de autorização (tenant, vínculo cliente/parceiro, papel) e exige revisão por
domínio com dono funcional. **Nenhuma alteração foi forçada apenas para reduzir a
métrica.**


---

## 3. Revisão de funções `SECURITY DEFINER`

Inventário completo de `pg_proc` + ACL no staging:

| Métrica | Valor |
| --- | --- |
| Funções `SECURITY DEFINER` em `public` | 648 |
| Sem `search_path` fixo | **0** |
| Com `EXECUTE` para `PUBLIC` (grant default) | **0** |
| Com `EXECUTE` para `anon` | **2** — `rpc_validar_comprovante_entrega(uuid)` (com rate-limit) e `rpc_validar_rastreio_produto(uuid)`, ambas por desenho (rastreio/validação pública) |
| Com `EXECUTE` para `authenticated` | 378 |
| Com `EXECUTE` para `service_role` | 647 |
| Funções de gatilho (`returns trigger`) com grant a `authenticated` | **0** |

Classificação das 378 expostas a `authenticated`: são a superfície de API já homologada em
H7O (allowlist de 485 assinaturas, sem drift), todas com `search_path` fixo e autorização
interna explícita (`has_role`, vínculo de cliente/parceiro ou `RAISE 42501`). Exemplo
auditado em detalhe: `seed_cockpit_fixtures` — `SET search_path TO 'public','pg_temp'`,
exige papel `administrador`, exige ambiente de homologação e delega ao `_impl` privado.

**Decisão:** nenhuma revogação de `EXECUTE` e nenhuma conversão para `SECURITY INVOKER`
nesta fase. As regras da fase proíbem revogação em massa e exigem prova de ausência de
consumidor legítimo função por função; a superfície atual é a mesma já certificada em H7O
e é consumida pelo frontend, Edge Functions, triggers e cron. Reduzir o advisor aqui sem
essa prova seria quebra funcional, não hardening.

---

## 4. Alteração aplicada

### H8-B1 — `20261002000000_h8b1_redundant_select_policy_v1`

- **Forward:** `restoration/homologacao-h8/h8b-forwards/20261002000000_h8b1_redundant_select_policy_v1.sql`
  (cópia canônica também em `supabase/migrations/`).
- **Rollback nominal (fora de `supabase/migrations`):**
  `restoration/homologacao-h8/h8b-rollbacks/20261002000000_h8b1_redundant_select_policy_v1_rollback.sql`.
- **Aplicador transacional:** `restoration/homologacao-h8/h8b-apply.sh` — valida binding,
  exige versão posterior a `20261001020000`, aplica o forward e registra o ledger na
  **mesma transação**, sem `db push` e sem wrappers de transação dentro do SQL.
- **Pré-condições fail-fast:** existência do par de policies, `cmd` esperado
  (`SELECT`/`ALL`), classe `PERMISSIVE`, roles idênticos, `USING` idêntico após
  normalização de espaços e ausência de `WITH CHECK` na policy alvo.
- **Pós-condições:** policy alvo ausente, cobertura `FOR ALL` preservada, exatamente 1
  policy de `SELECT` de staff restante e total de policies = 540.
- **Auditoria:** linha em `private.h8a_policy_audit` (fase `H8-B1`) com a definição
  completa removida. Schema/tabela sem grants para `anon`/`authenticated`/`PUBLIC`.

### Ensaio rollback → reapply (transação descartada)

```
AFTER_FWD_SELECTPOL=1
AFTER_RB_SELECTPOL=2
REAPPLY_TOTAL=540
ROLLBACK
FINAL_TOTAL=541   (estado original restaurado)
```

Aplicação definitiva em seguida: `COMMIT`, ledger **657 → 658**.

---

## 5. Testes e gates

| Gate | Resultado |
| --- | --- |
| `check-frontend-binding.sh` (final) | PASS — staging |
| `h7p-guard-repo-only.sh` | PASS — 59 repo-only íntegras e ausentes do ledger |
| `h7o-postcheck.sh` (integral) | **PASS** (allowlist 485 sem drift; 2 anon por design; fiscal `HOMOLOGATION\|2\|false\|false\|false\|DRAFT\|NOT_READY`) |
| Harness por perfis H7O | **300/300 PASS** |
| Harness por perfis H7N | **136/136 PASS** |
| Typecheck (`tsgo`) | 0 erro |
| Build | OK |
| Vitest completo | **3.337 PASS / 0 FAIL / 4 skip** (212 arquivos + 1 skip) |
| `fiscal-secrets-scan.sh` | OK — nenhum segredo real |
| `fiscal-integration-scan.sh` | OK — nenhum indicador de emissão em runtime |

Matriz por perfis: coberta pelos harnesses 300 e 136, que exercitam
Superadmin/Admin/Gestor/Comercial/Financeiro/Operador/Técnico/Parceiro/Produtor/Cliente em
`SELECT/INSERT/UPDATE/DELETE` permitidos e negados, isolamento por cliente/parceiro,
usuário sem vínculo e views protegidas. Especificamente para `cliente_documentos`, a
equivalência é estrutural (mesma expressão `USING` no `OR` permissivo) e a tabela está
vazia no staging, de modo que não há diferença de linhas observável por nenhum perfil.

---

## 6. Invariantes após H8-B

| Invariante | Antes | Depois |
| --- | --- | --- |
| Ledger | 657 | **658** |
| Policies em `public` (métrica própria) | 541 | **540** |
| Grupos permissivos locais (métrica própria) | 44 | **43** |
| **Advisor `multiple_permissive_policies` (oficial)** | 146 | **146 — sem alteração** |
| Grupos expandidos / finding-groups oficiais | 117 | **117** |
| `auth_rls_initplan` não escalado | 0 | **0** |
| `duplicate_index` (grupos) | 1 | **1** (`formulacoes`, sustentado por constraints) |
| `SECURITY DEFINER` | 648 | **648** |
| Sem `search_path` fixo | 0 | **0** |
| `EXECUTE` anon / `authenticated` | 2 / 378 | **2 / 378** |
| Views / `security_invoker` | 24 / 23 | **24 / 23** (17 `=true` + 6 `=on`, +1 interna sem grants) |
| Cron ativos | 6 | **6** |
| Tabelas RLS fail-closed | 7 | **7** |
| Fiscal | `HOMOLOGATION`, `tpAmb=2`, `production_enabled=false`, `DRAFT/NOT_READY` | **inalterado** |
| Advisor performance (oficial) | 512 (147 WARN + 365 INFO) | **512 (147 WARN + 365 INFO)** |
| Advisor segurança (oficial) | 393 (383 WARN + 10 INFO + 0 ERROR) | **393 (383 WARN + 10 INFO + 0 ERROR)** |
| Segurança: novos ERROR/WARN causados pela fase | — | **0** |

### 6.1 Separação explícita das métricas

| Métrica | Natureza | Antes | Depois | Delta |
| --- | --- | --- | --- | --- |
| Policies em `public` | própria (catálogo) | 541 | 540 | **−1** |
| Grupos locais tabela+`cmd`+roles | própria (catálogo) | 44 | 43 | **−1** |
| Advisor `multiple_permissive_policies` | **oficial (fonte de verdade)** | 146 | 146 | **0** |

H8-B produziu **redução estrutural segura** (uma policy redundante a menos, com
equivalência formalmente provada), mas **delta zero no Advisor**, porque o grupo
`cliente_documentos / authenticated / SELECT` ainda contém duas policies permissivas
distintas e continua sendo contado como um finding.


---

## 7. Arquivos alterados

- `restoration/homologacao-h8/h8b-forwards/20261002000000_h8b1_redundant_select_policy_v1.sql` (novo)
- `restoration/homologacao-h8/h8b-rollbacks/20261002000000_h8b1_redundant_select_policy_v1_rollback.sql` (novo)
- `restoration/homologacao-h8/h8b-apply.sh` (novo)
- `supabase/migrations/20261002000000_h8b1_redundant_select_policy_v1.sql` (novo — cópia canônica)
- `restoration/homologacao-h8/02-h8b-policies-rpcs.md` (este relatório)
- `restoration/homologacao-h8/00-h8-abertura-diagnostico.md` (status H8-B)
- `restoration/homologacao-h7/h7p-repo-only-manifest.json` (`ledger_versoes` 657 → 658)
- `src/test/security/h7p-repo-only-migrations.static.test.ts` (limite 657 → 658)
- `roadmap.md`

---

## 8. Pendências e riscos

1. **43 grupos locais remanescentes** e **117 grupos expandidos / finding-groups oficiais**,
   totalizando as **146 ocorrências** do Advisor — exigem matriz funcional por domínio e
   dono de negócio. Risco de consolidação apressada: ampliação silenciosa de acesso.
   Escopo sugerido para H8-C, que deve mirar a **redução de grupos tabela+role+ação**, e
   não a contagem bruta de policies.

2. **378 funções `SECURITY DEFINER` executáveis por `authenticated`** — superfície
   legítima e já certificada; qualquer revogação exige prova nominal de ausência de
   consumidor. Não tratar como dívida a zerar.
3. **Bloqueios externos B1 (leaked-password), B3 (cadastro fiscal) e B4 (autorização de
   promoção)** permanecem abertos e fora do escopo de H8.
4. **Drift recorrente de `.env`/`types.ts`** para o sandbox — o gate de binding deve
   continuar sendo a primeira e a última etapa de toda fase.

---

## 9. Decisão

**GO homologação para H8-C / NO-GO produção.** H8-B obteve **redução estrutural segura**
— uma policy permissiva redundante removida em `cliente_documentos` com equivalência
formalmente provada, policies 541 → 540 e grupos locais 44 → 43 — mas com **delta zero no
Advisor**: `multiple_permissive_policies` **permaneceu 146**, performance permaneceu 512
(147 WARN + 365 INFO) e segurança permaneceu 393 (383 WARN + 10 INFO + 0 ERROR). A fase
também revisou integralmente a exposição `SECURITY DEFINER` sem revogações inseguras e
preservou todos os invariantes de H7 e H8-A.

