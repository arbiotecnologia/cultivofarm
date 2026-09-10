# H7n-PROD — CHECKLIST DE DEPENDÊNCIAS DAS ONDAS A2..A5 / P2

**Data:** 2026-09-10 (UTC-3)
**Execução de SQL por este ambiente:** nenhuma. Nenhum banco acessado, nada publicado, nenhuma alteração em produção.
**Base factual:** censo somente leitura na produção `navfzbwgwzruipouyfnk` (evidência declarada pelo operador, 2026-09-10) — ledger `493` / latest `20261101000000`; 3/3 views alvo já com `security_invoker=true`; schema `private` ausente; 277 `SECURITY DEFINER` executáveis por `authenticated`; views de catálogo, `fn_catalogo_preco_canonico` e os 4 helpers da P2 ausentes.
**Ambiente do dry-run:** exclusivamente homologação/staging `ikaauvsflpmamgxmkhoq`. Produção proibida nesta etapa. Sandbox `yzszlzjpovmcteuxjznj` proibido.

---

## 0. BLOQUEIO ATIVO — LOGIN DE STAGING EXPIRADO

> O painel/CLI autenticado do Supabase de **homologação `ikaauvsflpmamgxmkhoq` exige novo login** antes de qualquer execução.
> Enquanto o login não for renovado pelo operador, **nenhum dry-run pode ser executado** — nem em modo somente leitura.
> Este pacote é preparatório. Não há evidência de dry-run e nenhuma onda muda de veredito por causa dele.

Procedimento de desbloqueio (operador, máquina local):

1. Autenticar no Supabase CLI/painel com a conta autorizada.
2. Confirmar, antes de qualquer comando, que o alvo efetivo é `ikaauvsflpmamgxmkhoq`.
3. Se o alvo resolver para `navfzbwgwzruipouyfnk` ou `yzszlzjpovmcteuxjznj`, **parar fail-closed** e não executar nada.
4. Somente então rodar `01-prechecks-readonly-staging.sql`.

## 1. Mapa das ondas

| Onda | Unidade H7n de origem | Conteúdo | Veredito atual |
|---|---|---|---|
| A1 | P0 (recorte) | `security_invoker` nas 3 views existentes | **NO-OP / NÃO EXECUTADA** — estado-alvo já existe, não registrar no ledger |
| A2 | P0 (parcial) | Redefinição de `vw_esteira_laboratorio` e `vw_fluxo_visita_tecnica` sobre `private.h7n_*` | **NO-GO** |
| A3 | P0 (parcial) | `vw_catalogo_ficha_produtos`, `vw_catalogo_ficha_microrganismos` + `fn_catalogo_preco_canonico` | **NO-GO** |
| A4 | P1a + P1b + P1c | Revokes de trigger, guardas `42501` em RPCs, revokes de helpers internos | **NO-GO** |
| A5 | P2 | `ALTER FUNCTION ... SET search_path` nos 4 helpers | **NO-GO** |
| P2 (fase de promoção) | — | Onda seguinte do plano geral | **BLOQUEADA** |

## 2. Checklist de dependências, por onda

Cada item é uma **precondição objetiva**. Uma onda só pode mudar de NO-GO para "GO técnico condicionado" quando **todos** os seus itens estiverem `COMPROVADO` com evidência arquivada (saída bruta + SHA-256).

### A2 — redefinição das duas views de esteira/visita

| # | Dependência | Estado | Como comprovar |
|---|---|---|---|
| A2.1 | Schema `private` criável e sem colisão de nome | AUSENTE em produção | censo, seção "schema private" |
| A2.2 | `public.get_cliente_ids_for_user(uuid)` existe com assinatura idêntica à do staging | NÃO EVIDENCIADO | censo + diff de assinatura |
| A2.3 | Valores `financeiro`, `parceiro_b2b`, `parceiro_b2b_tecnico` presentes no enum `app_role` | NÃO EVIDENCIADO | censo do enum |
| A2.4 | `mv_esteira_laboratorio` e `mv_fluxo_visita_tecnica` com colunas idênticas às do staging | PRESENTES, colunas não conferidas | diff de colunas |
| A2.5 | Contrato de saída atual das duas views idêntico ao contrato pós-redefinição | NÃO EVIDENCIADO | diff de `information_schema.columns` |
| A2.6 | Nenhum consumidor (view/função/frontend) depende de coluna que a redefinição remove | NÃO EVIDENCIADO | censo de dependências + varredura de código |
| A2.7 | Dry-run transacional verde em `ikaauvsflpmamgxmkhoq` | BLOQUEADO | login de staging pendente |

### A3 — views de catálogo e função de preço

| # | Dependência | Estado | Como comprovar |
|---|---|---|---|
| A3.1 | `public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)` existe em produção | AUSENTE | censo |
| A3.2 | Onda de schema que cria essa função promovida e pós-checada antes de A3 | NÃO FEITA | ledger de produção |
| A3.3 | `public.can_view_catalog_internal(uuid)` existe | NÃO EVIDENCIADO | censo |
| A3.4 | Tipo `public.tipo_produto` existe com os mesmos rótulos | NÃO EVIDENCIADO | censo de enum |
| A3.5 | Colunas `produtos.b2b_enabled` e `microrganismos.b2b_enabled` existem | NÃO EVIDENCIADO | censo de colunas |
| A3.6 | A2 concluída (schema `private` já existente e validado) | PENDENTE | depende de A2 |
| A3.7 | Dry-run transacional verde em staging | BLOQUEADO | login pendente |

### A4 — revokes de trigger/helpers e guardas de RPC

| # | Dependência | Estado | Como comprovar |
|---|---|---|---|
| A4.1 | Censo de existência das ~26 funções de trigger nomeadas, por assinatura exata | NÃO EVIDENCIADO | censo |
| A4.2 | Censo de existência dos ~43 helpers internos, por assinatura exata | NÃO EVIDENCIADO | censo |
| A4.3 | Diff `md5(pg_get_functiondef(...))` staging × produção para **cada** RPC reescrita no P1b | NÃO FEITO | diff arquivado |
| A4.4 | Toda RPC com hash divergente tratada individualmente (nunca `CREATE OR REPLACE` em lote) | NÃO FEITO | plano por função |
| A4.5 | Classificação dos 277 `SECURITY DEFINER` de produção em trigger / helper interno / RPC pública | NÃO FEITA | censo classificado |
| A4.6 | Matriz de perfis provando que nenhum caminho operacional vivo perde `EXECUTE` | NÃO FEITA | testes por perfil em staging |
| A4.7 | Dry-run transacional verde em staging, com rollback comprovado | BLOQUEADO | login pendente |

### A5 — `search_path` dos quatro helpers

| # | Dependência | Estado | Como comprovar |
|---|---|---|---|
| A5.1 | `public.fn_h6b_num(numeric)` existe em produção | AUSENTE | censo |
| A5.2 | `public.fn_gtin_is_valid(text)` existe | AUSENTE | censo |
| A5.3 | `public.fn_regulatory_storage_path_ok(text)` existe | AUSENTE | censo |
| A5.4 | `public.fn_regulatory_storage_dossier_id(text)` existe | AUSENTE | censo |
| A5.5 | Ondas de schema que criam os 4 helpers promovidas e pós-checadas | NÃO FEITAS | ledger de produção |
| A5.6 | Dry-run transacional verde em staging | BLOQUEADO | login pendente |

### P2 (fase de promoção)

| # | Dependência | Estado |
|---|---|---|
| P2.1 | A2..A5 resolvidas (GO ou exclusão formal do escopo) | PENDENTE |
| P2.2 | Evidências brutas da P1 arquivadas com SHA-256 | PARCIAL |
| P2.3 | Backup/restore point de produção comprovado e datado imediatamente antes da onda | PENDENTE |
| P2.4 | Security Advisor de produção sem `errors` novos após cada onda | PENDENTE |

## 3. Regra de veredito

Uma onda permanece **NO-GO** enquanto existir **um único** item do seu checklist fora de `COMPROVADO`. Nenhuma onda é promovida por analogia com outra, nem por ausência de erro em dry-run parcial. A A1 permanece **NO-OP** e **não entra no ledger**.
