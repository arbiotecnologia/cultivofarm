# H9-A — Gate de preparação segura para produção (somente auditoria e documentação)

**Data:** 2026-09-08 (UTC) · **Ambiente auditado:** homologação `ikaauvsflpmamgxmkhoq` (somente leitura)
**Produção `navfzbwgwzruipouyfnk`:** NÃO consultada, NÃO alterada, NÃO promovida. **Decisão: NO-GO produção.**

Esta fase **não** aplicou DDL/DML, não criou migrations, não alterou `.env`, `client.ts`, `types.ts`, código,
rotas, Edge Functions, RLS, RPCs, triggers, cron, Storage ou Auth. Apenas leitura + documentação `.md`.

---

## 1. Estado confirmado por leitura

| Item | Evidência | Resultado |
|---|---|---|
| Ledger de migrations | `supabase_migrations.schema_migrations` | **659**, última `20261003000000` |
| Cron `prune-old-audit-logs` | `cron.job` jobid 5 | `15 3 * * *`, `active=true`, md5 `dbc129eaf374196a06f3b911381703da` |
| Cron ativos | `cron.job` | 6 (jobids 1, 2, 5, 8, 9, 18) |
| Última execução do jobid 5 | H8-E, runid 7138 | `succeeded`, `DELETE 0` (evidência preservada, não reexecutada) |
| Binding do frontend | `restoration/homologacao-h7/check-frontend-binding.sh` | **OK — staging `ikaauvsflpmamgxmkhoq`**. Registro histórico: houve drift introduzido durante a geração H9-A, detectado na verificação independente e restaurado do baseline `df8bd791` (`.env` e `types.ts` idênticos ao baseline; `client.ts` sem divergência). |
| Commit-base | Baseline publicado autoritativo | `df8bd7919c32398dec8fed41332fccb7770e1e02`. O HEAD efêmero interno do sandbox não é fonte de verdade e não é usado como referência. |

---

## 2. Inventário nominal e classificação

### 2.1 Bloqueadores externos/humanos

| ID | Item | Criticidade | Domínio | Dependência | Forma de correção | Evidência | Rollback | Critério GO |
|---|---|---|---|---|---|---|---|---|
| **B1** | Proteção contra senhas vazadas desabilitada | Alta | Auth | Configuração de projeto (fora de migration) | Habilitar *leaked password protection* no projeto de destino | Advisor security, 1 achado INFO/WARN | Desabilitar a flag (reversível, sem dado) | Flag ativa no ambiente-alvo + evidência do Advisor sem o achado |
| **B3** | Validação fiscal/SEFAZ/contábil ainda humana | Crítica | Fiscal | Contabilidade/responsável fiscal | Homologação assistida por contador; emissão só em `tpAmb=2` até parecer | H7: `HOMOLOGATION\|2\|false…`, SEFAZ-MG `cStat=107` | Manter `production_emission_allowed=false` | Parecer escrito do responsável fiscal |
| **B4** | Autorização humana explícita para promoção ausente | Crítica | Governança | Sponsor do projeto | Registro formal de autorização com escopo e janela | Não existe registro | N/A | Autorização nominal, datada e versionada |

### 2.2 Tabelas com RLS habilitada e sem policy (fail-closed)

O Advisor oficial reporta **10** tabelas, composição resolvida: **7 no schema `public` + 3 no schema `private`**.
Não há divergência pendente. Verificação de privilégios efetivos em leitura (`has_table_privilege`) nas 10:
`SELECT` para `anon` = falso e para `authenticated` = falso em todas, RLS habilitada e 0 policies — portanto
**fail-closed** e fora da Data API; o acesso ocorre só via funções `SECURITY DEFINER`/`service_role`.
As 3 tabelas `private` (`public_validation_rate_counters`, `public_validation_rate_pepper`,
`public_validation_rate_policy`) são estruturas internas de rate-limit da validação pública e **devem permanecer
fora da API** (confirmado também pelo `h7o-postcheck.sh`: "tabelas private com RLS e sem grants app: 3/3").

| Tabela | Natureza | Grants anon/authenticated | Classificação | Ação proposta |
|---|---|---|---|---|
| `_f42_harness_fixtures` | Artefato de teste F4.2 | 0 | Deliberadamente inacessível | Avaliar **não promover** para produção |
| `_fiscal_staging_marker` | Marcador de ambiente de staging | 0 | Exclusiva de staging | **Não promover** |
| `commercial_payment_plans` | Dados comerciais | 0 | Fail-closed intencional | Documentar acesso via RPC; manter |
| `communication_provider_settings` | Credenciais/config de provedor | 0 | Fail-closed obrigatório | Manter sem policy |
| `communication_provider_settings_rate_limit` | Controle de taxa | 0 | Fail-closed obrigatório | Manter sem policy |
| `comunicacao_inapp_dispatch` | Fila interna de despacho | 0 | Fail-closed intencional | Manter sem policy |
| `fiscal_certificate_material` | Material criptográfico do certificado | 0 | Fail-closed obrigatório | Manter sem policy, jamais expor |
| `private.public_validation_rate_counters` | Contadores de rate-limit público | 0 | Interna, fora da API | Manter sem policy |
| `private.public_validation_rate_pepper` | Segredo HMAC do rate-limit | 0 | Interna, fora da API | Manter sem policy, jamais expor |
| `private.public_validation_rate_policy` | Política de rate-limit | 0 | Interna, fora da API | Manter sem policy |

**Risco:** baixo. **Impacto funcional:** nenhum (nada depende de acesso direto). **Perfis afetados:** nenhum.
**Testes:** negar `select` como `anon` e `authenticated` em cada tabela. **GO:** 0 grants de API e 0 leituras bem-sucedidas por perfil não-privilegiado.

### 2.3 Funções `SECURITY DEFINER` executáveis por `anon` (2)

| Função | Schema | Finalidade | Chamada em | Risco | Correção proposta |
|---|---|---|---|---|---|
| `rpc_validar_comprovante_entrega(p_validation_token uuid)` | `public` | Validação pública de comprovante de entrega por token | `src/pages/public/ValidarEntrega.tsx` | **Aceito por design** — exige token UUID não enumerável; já há rate-limit (`h7o-prune-public-validation-rate-limit`, jobid 18) | Manter; reconfirmar que o retorno não traz PII além do necessário |
| `rpc_validar_rastreio_produto(p_trace_token uuid)` | `public` | Rastreio público de produto por token | `src/pages/public/RastrearProduto.tsx` | **Aceito por design**, mesmas defesas | Manter; reconfirmar campos retornados |

**GO:** revisão de payload sem PII excedente + rate-limit ativo. **Rollback:** `REVOKE EXECUTE … FROM anon` (derruba as duas páginas públicas).

### 2.4 Funções `SECURITY DEFINER` executáveis por `authenticated` (378)

Quantidade **não** equivale a vulnerabilidade: 100% possuem `search_path` fixo (0 sem `search_path`) e todas
aplicam verificação de papel internamente. Agrupamento por domínio (prefixo do nome, top 25 por volume):

| Domínio (prefixo) | Qtde | Exposição real |
|---|---|---|
| `rpc_fiscal_*` | 30 | Backoffice fiscal; gated por papel |
| `rpc_executivo_*` | 19 | Leitura agregada executiva |
| `rpc_regulatory_*` / `fn_regulatory_*` | 22 | Regulatório/ficha técnica |
| `rpc_cc_*` | 15 | Centro de custo/financeiro |
| `rpc_b2b_*` / `get_b2b_*` | 20 | Portal parceiro |
| `rpc_admin_*` | 13 | Administração — maior criticidade |
| `can_user_*` | 11 | Helpers de autorização (leitura) |
| `fn_fin_*` / `get_financial_*` | 13 | Financeiro |
| `rpc_entrega_*` / `rpc_cockpit_*` | 12 | Operação/entrega |
| `rpc_bi_*` / `get_report_*` | 14 | Relatórios |
| demais | restante | Diversos domínios já auditados em H7N/H7O |

**Correção proposta:** onda 3 — revisão dirigida apenas de `rpc_admin_*` e das funções que escrevem em tabelas
financeiras/fiscais, confirmando `has_role` na primeira instrução. **Não** revogar em massa.
**GO:** 100% das funções de escrita administrativa com verificação de papel comprovada por leitura de `prosrc`.

### 2.5 Extensões em `public` (2)

| Extensão | Uso | Risco | Correção | Rollback |
|---|---|---|---|---|
| `btree_gist` | Constraints de exclusão | Baixo | Mover para `extensions` **apenas** com reescrita das constraints dependentes | `ALTER EXTENSION … SET SCHEMA public` |
| `pg_net` | HTTP assíncrono usado pelo cron/Edge | Baixo–médio | Mover para `extensions` exige revisar todas as chamadas `net.http_*` | idem |

**Recomendação:** manter em H9; tratar só em janela dedicada, pois a movimentação quebra objetos dependentes.

### 2.6 FKs sem índice (172 confirmadas)

Priorização por evidência (tabelas com mais linhas vivas e FKs usadas em JOIN/RLS/cascata). Top confirmado:

| Tabela filha | Coluna(s) | Pai | on delete | linhas | Prioridade |
|---|---|---|---|---|---|
| `financial_audit_log` | `performed_by` | `auth.users` | NO ACTION | 861 | Alta (JOIN de auditoria + poda) |
| `microorganism_regulatory_checklist` | `evidence_document_id` | `microorganism_regulatory_documents` | SET NULL | 300 | Alta |
| `clientes_audit_log` | `changed_by` | `profiles` | NO ACTION | 287 | Alta |
| `microorganism_targets` | `catalogo_alvo_id` | `catalogo_alvos` | SET NULL | 85 | Média |
| `accounts_receivable` | `category_id`, `cost_center_id`, `payment_method_id`, `created_by`, … | diversos | NO ACTION | 58 | Média (filtros de relatório) |
| `receivable_payments` | `payment_method_id`, `bank_account_id`, `created_by` | diversos | NO ACTION | 50 | Média |
| `partner_orders` | `credit_approved_by` | `auth.users` | NO ACTION | 43 | Média |

**Correção:** `CREATE INDEX CONCURRENTLY` por FK **somente** onde houver JOIN/filtro/RLS comprovado — nunca as 172.
**Rollback:** `DROP INDEX CONCURRENTLY`. **GO:** plano de execução melhora ou mantém, sem regressão de escrita.

### 2.7 Policies permissivas múltiplas (146 achados / 43 grupos locais)

Maiores grupos: `ordens_servico` SELECT (5), `accounts_receivable_installments` / `portal_solicitacoes` /
`profiles` / `accounts_receivable` / `ordens_servico_onfarm` / `catalogo_volumes` SELECT (4 cada),
`entregas` / `entrega_comprovantes` / `aplicacoes` / `alertas_operacionais` / `lotes` SELECT (3 cada).

Separação exigida antes de qualquer mudança: **composição intencional** (uma policy por perfil, legível e
auditável) × **redundância real** (predicados equivalentes). H8-B já removeu as literalmente redundantes; o
restante é composição por perfil. **Correção:** consolidar somente quando os predicados forem provadamente
equivalentes por perfil, com harness de matriz de acesso antes/depois. **Rollback:** recriar as policies originais
a partir de `pg_get_expr` capturado no snapshot. **GO:** matriz de acesso idêntica antes/depois, por perfil.

### 2.8 Índice duplicado em `public.formulacoes`

Confirmado: `formulacoes_produto_microrganismo_unique` e `unique_produto_microrganismo` são **ambos**
`UNIQUE (produto_id, microrganismo_id)`. Ambos sustentam constraints, por isso H8-A não removeu.
**Correção:** remover uma constraint (não o índice) só após confirmar que nenhuma FK a referencia.
**Rollback:** recriar a constraint. **GO:** 1 índice único remanescente e nenhuma FK órfã.

### 2.9 Índices sem uso (191)

`pg_stat_database.stats_reset = 2026-07-15 13:16 UTC` — cerca de 8 semanas de estatística, insuficiente para
rotinas mensais/anuais (fechamento financeiro, relatórios fiscais). Excluídos da contagem PK e únicos.
**Regra desta fase:** "unused index" **não** autoriza remoção. **Correção futura:** só após ≥ 2 ciclos mensais
completos de estatística e checagem de uso em rotinas raras; remover em lotes pequenos com `DROP INDEX CONCURRENTLY`.

---

## 3. Ondas de remediação (independentes e ordenadas)

| Onda | Escopo | Pré-requisito | Reversível | Critério de saída |
|---|---|---|---|---|
| **1 — Gate externo/humano** | B1, B3, B4 | Nenhum técnico | Sim | Flag de senha ativa, parecer fiscal, autorização assinada |
| **2 — Segurança crítica comprovada** | 2 RPCs `anon` (revisão de payload/rate-limit) + 7 tabelas RLS sem policy (confirmar fail-closed) | Onda 1 iniciada | Sim | 0 exposição indevida na matriz de acesso |
| **3 — Privilégios e SECDEF `authenticated`** | Revisão dirigida de `rpc_admin_*` e escritas financeiras/fiscais | Onda 2 | Sim | 100% com `has_role` comprovado; nenhuma revogação em massa |
| **4 — Performance baseada em evidência** | Índices para FKs de alta prioridade (§2.6) | Onda 3 | Sim (`DROP INDEX CONCURRENTLY`) | Plano de execução sem regressão |
| **5 — Consolidação cuidadosa** | Policies equivalentes, duplicata de `formulacoes`, índices sem uso com ≥ 2 ciclos | Onda 4 | Sim | Matriz de acesso idêntica; nenhuma consulta degradada |
| **6 — Ensaio de promoção** | Dry-run completo em branch/staging + checklist de janela | Ondas 1–5 | N/A | Ensaio integral PASS e checklist assinado |

---

## 4. Riscos

| ID | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | `.env` em drift para `yzszlzjpovmcteuxjznj`; binding gate em ABORT | Alta | Restaurar do baseline aprovado em fase com permissão de escrita (H9-B), antes de qualquer teste de frontend |
| R2 | Divergência entre 10 (Advisor) e 7 (leitura direta) tabelas RLS sem policy | Média | Reconferir Advisor oficial na abertura de H9-B |
| R3 | Commit-base indicado ≠ HEAD | Baixa | Confirmar histórico antes da promoção |
| R4 | Consolidação de policies pode alterar visibilidade silenciosamente | Alta | Harness de matriz de acesso obrigatório antes/depois |
| R5 | Remoção prematura de índices por estatística curta | Média | Regra dos 2 ciclos mensais |
