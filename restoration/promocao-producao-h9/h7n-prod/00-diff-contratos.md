# H7n-PROD — DIFF DE CONTRATOS: PACOTE H7n (STAGING) × PRODUÇÃO

**Alvo de destino:** produção `navfzbwgwzruipouyfnk`
**Fonte:** as 5 migrations H7n em `supabase/migrations/`
**Execução de SQL neste ambiente:** nenhuma. Nenhum banco foi acessado.
**Base factual de produção:** evidência declarada pelo operador (leitura
autenticada na máquina dele) — ledger 493 / latest `20261101000000`; versões H7n
ausentes; 3 de 5 alvos de view presentes; views de catálogo ausentes;
`fn_catalogo_preco_canonico(uuid,uuid,text,numeric)` ausente;
`mv_esteira_laboratorio` e `mv_fluxo_visita_tecnica` presentes; os 4 helpers da
P2 ausentes; 277 `SECURITY DEFINER` executáveis por `authenticated`.

---

## 1. Unidades do pacote H7n de origem

| # | Arquivo | Linhas | Natureza |
|---|---|---|---|
| P0 | `20260904130615_h7n_p0_security_invoker.sql` | 170 | cria schema `private`, 4 funções `private.h7n_*`, redefine 4 views, ALTER em 1 view, REVOKE/GRANT |
| P1a | `20260904130758_h7n_p1_trigger_execute.sql` | 30 | REVOKE EXECUTE em ~26 funções de trigger |
| P1b | `20260904130941_h7n_p1_rpc_guards.sql` | 635 | CREATE OR REPLACE com guardas `42501` em RPCs sensíveis + REVOKE/GRANT |
| P1c | `20260904131239_h7n_p1_internal_helpers.sql` | 45 | REVOKE EXECUTE em ~43 helpers internos |
| P2 | `20260904131341_h7n_p2_search_path.sql` | 7 | `ALTER FUNCTION ... SET search_path` em 4 helpers |

## 2. Diff objeto a objeto

### 2.1 Views alvo do P0

| Objeto | Staging | Produção | Ação H7n original | Compatível? |
|---|---|---|---|---|
| `public.vw_os_integridade_esteira` | existe | **existe** | `ALTER VIEW ... security_invoker=true` | **SIM** — não redefine, não depende de nada novo |
| `public.vw_esteira_laboratorio` | existe | **existe** | `CREATE OR REPLACE VIEW` sobre `private.h7n_esteira_laboratorio()` | **NÃO** — redefinição muda o contrato de leitura |
| `public.vw_fluxo_visita_tecnica` | existe | **existe** | `CREATE OR REPLACE VIEW` sobre `private.h7n_fluxo_visita_tecnica()` | **NÃO** — idem |
| `public.vw_catalogo_ficha_produtos` | existe | **ausente** | `CREATE OR REPLACE VIEW` | **NÃO** — alvo inexistente |
| `public.vw_catalogo_ficha_microrganismos` | existe | **ausente** | `CREATE OR REPLACE VIEW` | **NÃO** — alvo inexistente |

### 2.2 Dependências do P0 ausentes em produção

| Dependência | Usada por | Estado em produção |
|---|---|---|
| `public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)` | `private.h7n_catalogo_ficha_produtos()`, `..._microrganismos()` | **ausente** — quebra na criação |
| `public.can_view_catalog_internal(uuid)` | ambas as funções de catálogo | **não evidenciado** |
| `public.get_cliente_ids_for_user(uuid)` | funções de esteira e visita | **não evidenciado** |
| `public.tipo_produto` (tipo) | assinatura de retorno de produtos | **não evidenciado** |
| `produtos.b2b_enabled`, `microrganismos.b2b_enabled` | filtros B2B | **não evidenciado** |
| roles `financeiro`, `parceiro_b2b`, `parceiro_b2b_tecnico` em `app_role` | todas as 4 funções | **não evidenciado** |
| `public.mv_esteira_laboratorio`, `public.mv_fluxo_visita_tecnica` | funções de esteira/visita | **presentes** |

Consequência: mesmo as duas funções `private.h7n_*` de esteira/visita, cujas
materializadas existem, dependem de `get_cliente_ids_for_user` e de valores de
`app_role` ainda não comprovados. Sem censo, criá-las é aposta.

### 2.3 P1a / P1b / P1c

O pacote nomeia ~26 funções de trigger, ~43 helpers internos e as RPCs
reescritas do P1b **pelo nome e pela assinatura exata do staging**. Em produção
não há censo de existência para nenhuma delas. Riscos concretos:

- `REVOKE ... ON FUNCTION` com assinatura inexistente **aborta** a transação;
- `CREATE OR REPLACE FUNCTION` do P1b **sobrescreve** corpos que em produção
  podem estar em versão diferente da auditada — perda silenciosa de correções;
- os 277 `SECURITY DEFINER` executáveis por `authenticated` em produção não
  correspondem ao conjunto auditado; revogar em lote pode negar execução a
  caminhos operacionais vivos.

Nenhuma dessas três unidades é adaptável automaticamente. **NO-GO.**

### 2.4 P2 — os 4 helpers

| Função | Produção |
|---|---|
| `public.fn_h6b_num(numeric)` | **ausente** |
| `public.fn_gtin_is_valid(text)` | **ausente** |
| `public.fn_regulatory_storage_path_ok(text)` | **ausente** |
| `public.fn_regulatory_storage_dossier_id(text)` | **ausente** |

`ALTER FUNCTION` sobre função inexistente aborta. **NO-GO** — as funções
pertencem a ondas de schema ainda não promovidas.

## 3. Recorte comprovadamente seguro

Um único item do pacote tem **todas** as dependências comprovadas em produção:

> `ALTER VIEW public.vw_os_integridade_esteira SET (security_invoker = true);`

A view existe, o comando não redefine nada, não referencia função nova e não
altera ACL. As outras duas views existentes (`vw_esteira_laboratorio`,
`vw_fluxo_visita_tecnica`) já receberam `security_invoker=true` na P1 parcial;
o forward apenas **reafirma** de forma idempotente, sem redefinir.

Esse recorte virou o pacote `H7n-PROD onda A1`:
`forward-sql/20261103000000_h7nprod_a1_security_invoker_views_v1.sql`.

## 4. Veredito por unidade

| Unidade | Veredito para produção |
|---|---|
| P0 — ALTER em `vw_os_integridade_esteira` + reafirmação das 2 views | **GO técnico**, condicionado a dry-run em homologação |
| P0 — redefinição das 2 views sobre `private.h7n_*` | **NO-GO** — dependências não comprovadas |
| P0 — 2 views de catálogo + `fn_catalogo_preco_canonico` | **NO-GO** — objetos ausentes |
| P1a — revokes de trigger | **NO-GO** — sem censo de existência |
| P1b — guardas de RPC | **NO-GO** — risco de sobrescrever corpos divergentes |
| P1c — revokes de helpers internos | **NO-GO** — sem censo de existência |
| P2 — search_path dos 4 helpers | **NO-GO** — funções ausentes |

## 5. Artefatos que faltam para destravar o restante

1. Saída do censo `checks/00-censo-dependencias.sql` executado em produção
   (somente leitura), arquivada com SHA-256.
2. Diff de corpo (`md5(pg_get_functiondef(...))`) staging × produção para cada
   RPC reescrita no P1b.
3. Promoção prévia das ondas de schema que criam
   `fn_catalogo_preco_canonico`, as views de catálogo e os 4 helpers da P2.
4. Classificação, em produção, dos 277 `SECURITY DEFINER` com `EXECUTE` para
   `authenticated`, separando trigger / helper interno / RPC pública.
5. Evidência de dry-run verde em homologação `ikaauvsflpmamgxmkhoq`.
