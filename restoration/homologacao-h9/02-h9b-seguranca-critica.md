# H9-B — Segurança crítica comprovada (somente homologação)

**Ambiente:** homologação `ikaauvsflpmamgxmkhoq`. **Produção `navfzbwgwzruipouyfnk`: zero acesso, zero consulta, NO-GO.**
**Baseline autoritativo:** `f5071fe0d2a61f65df9c3df01ffa29ac20431d34` (anterior aprovado: `df8bd791…`).
**Ledger:** 659 antes → **660** depois (única migration nova `20261004000000_h9b1_rate_limit_rastreio_v1`).
**Cron jobid 5:** ativo, `15 3 * * *`, inalterado.

## 0. Binding

O HEAD interno do sandbox trazia novamente drift de `.env` para `yzszlzjpovmcteuxjznj`. Antes de qualquer teste,
`.env`, `client.ts` e `types.ts` foram restaurados **exatamente do commit `f5071fe0`**; o binding gate passou
(`ikaauvsflpmamgxmkhoq`) e só então a fase prosseguiu. Nenhum outro arquivo de código foi tocado.

## 1. RPC `public.rpc_validar_comprovante_entrega(p_validation_token uuid)`

| Critério | Evidência | Resultado |
|---|---|---|
| Owner / segurança | `postgres`, `SECURITY DEFINER`, `volatile` | OK |
| `search_path` | `{search_path=public}` fixo | OK |
| Grants | `anon`, `authenticated`, `service_role`, `postgres` (EXECUTE) — por design, rota pública | Aceito |
| Rate-limit antes de leitura sensível | 1ª instrução chama `private.fn_public_validation_rate_check(p_validation_token)`; se negado retorna `retry_after_seconds` sem tocar em dados | **OK** |
| Token não enumerável | UUID exigido; resposta idêntica para inexistente e para desabilitado (anti-enumeração) | OK |
| Nulo/inválido/inexistente | Testado como `anon`: retorno genérico "Comprovante não encontrado ou indisponível" nos três casos | OK |
| SQL dinâmico | Ausente (sem `EXECUTE`/concatenação) | OK |
| Payload | `valido, status, assinatura_tipo, possui_ressalvas, numero_formulario, data_confirmacao, data_assinatura, validation_hash, mensagem` — **sem PII de cliente, endereço, documento, valor ou segredo** | OK |
| Acesso cruzado por parâmetro | Único parâmetro é o próprio token; sem filtro por id de cliente/entrega | OK |
| Uso real | `src/pages/public/ValidarEntrega.tsx` | OK |

Confirmação funcional do rate-limit: após as chamadas anônimas, os contadores privados registraram
`token`, `origin` e `global` na janela corrente, conforme política `token=10/60s`, `origin=30/60s`, `global=600/60s`.

**Veredito:** sem vulnerabilidade. Risco aceito por design, com defesa em profundidade comprovada.

## 2. RPC `public.rpc_validar_rastreio_produto(p_trace_token uuid)`

Metadados equivalentes (owner `postgres`, `SECURITY DEFINER`, `search_path=public`, EXECUTE para `anon`),
sem SQL dinâmico, payload sem PII (`codigo_etiqueta, produto_nome, lote_codigo, fabricado_em, validade_em,
volume, unidade, tipo_etiqueta, status, mensagem`) e sem parâmetro que permita acesso cruzado.
Uso real em `src/pages/public/RastrearProduto.tsx`.

### 2.1 Vulnerabilidade comprovada (H9-B1)

O rate-limit existia **apenas por etiqueta encontrada** (60 consultas/hora), consultado **depois** da leitura.
Para token inexistente a função retornava imediatamente e **gravava uma linha** em
`public.produto_etiqueta_consultas` **sem qualquer limitação**.

Evidência objetiva (staging, como `anon`, sem carga e sem brute force): 2 chamadas com UUIDs inexistentes
produziram 2 linhas novas com `etiqueta_id NULL` e **nenhum** incremento nos contadores privados —
ou seja, tentativas ilimitadas de adivinhação de token e escrita ilimitada induzida por visitante anônimo.

### 2.2 Correção mínima aplicada

`supabase/migrations/20261004000000_h9b1_rate_limit_rastreio_v1.sql` — `CREATE OR REPLACE` idempotente que
insere, como primeira instrução, o mesmo gate certificado em H7O
(`private.fn_public_validation_rate_check`) **antes de qualquer leitura ou escrita**, retornando
`status='rate_limited'` com `retry_after_seconds`. Nada mais foi alterado: assinatura, payload de sucesso,
grants, owner e `search_path` permanecem idênticos.

Rollback nominal: `restoration/homologacao-h9/h9b-rollbacks/20261004000000_h9b1_rate_limit_rastreio_v1_rollback.sql`
(definição byte a byte anterior).

### 2.3 Antes / depois

| Cenário (anon, token inexistente) | Antes | Depois |
|---|---|---|
| Tentativas por token na janela | ilimitadas | 10/60s (`token`), 30/60s (`origin`), 600/60s (`global`) |
| Linhas gravadas por tentativa | 1 sempre | 1 até o limite; **0** após `rate_limited` |
| Teste executado | 2 chamadas → 2 linhas, contadores inalterados | 14 chamadas → 10 linhas e depois `status='rate_limited'`, contadores `token/origin/global = 14` |

Reversibilidade comprovada: rollback aplicado (gate ausente) e forward reaplicado (gate presente,
`SECURITY DEFINER`, `search_path=public`), sem efeito colateral.

## 3. As 10 tabelas com RLS ativa e sem policy

Leitura nominal de `pg_class`/`pg_policy`/`has_table_privilege` em homologação. Em **todas**: RLS ativa,
**0 policies**, e **0** privilégios de `SELECT/INSERT/UPDATE/DELETE` para `anon` e `authenticated` → fail-closed.

| Schema | Tabela | Natureza | anon SIUD | auth SIUD | Classificação |
|---|---|---|---|---|---|
| private | `public_validation_rate_counters` | Contadores do rate-limit público | 0000 | 0000 | Interna, fora da API |
| private | `public_validation_rate_pepper` | Segredo HMAC do rate-limit | 0000 | 0000 | Interna, jamais expor |
| private | `public_validation_rate_policy` | Limites por escopo | 0000 | 0000 | Interna, fora da API |
| public | `_f42_harness_fixtures` | Fixtures de harness F4.2 | 0000 | 0000 | **Exclusiva de staging — não promover** |
| public | `_fiscal_staging_marker` | Marcador de ambiente | 0000 | 0000 | **Exclusiva de staging — não promover** |
| public | `commercial_payment_plans` | Planos de pagamento (2 triggers) | 0000 | 0000 | Sensível — acesso só privilegiado/RPC |
| public | `communication_provider_settings` | Configuração/credencial de provedor | 0000 | 0000 | Sensível — manter sem policy |
| public | `communication_provider_settings_rate_limit` | Controle de taxa de comunicação | 0000 | 0000 | Interna — manter sem policy |
| public | `comunicacao_inapp_dispatch` | Fila interna de despacho | 0000 | 0000 | Interna — manter sem policy |
| public | `fiscal_certificate_material` | Material criptográfico do certificado | 0000 | 0000 | Crítica — jamais expor |

Diferenciação exigida:
- **7 `public`** sem grants e sem policies, alcançáveis apenas por `service_role` e por funções `SECURITY DEFINER`;
- **3 `private`** de rate-limit: além de sem grants, o schema `private` **não concede USAGE** a `anon`/`authenticated`
  (`has_schema_privilege = false`), portanto estão fora da Data API por dupla barreira;
- **2 exclusivas de staging** (`_f42_harness_fixtures`, `_fiscal_staging_marker`) que **não devem ser promovidas**;
- **3 sensíveis** (`fiscal_certificate_material`, `communication_provider_settings`, `commercial_payment_plans`)
  que devem permanecer somente por acesso privilegiado.

Teste de negação por papel (como `anon`): leitura direta de `public.entrega_comprovantes` → `permission denied`;
leitura de `private.public_validation_rate_counters` → `permission denied for schema private`.

**Veredito:** as 10 são fail-closed intencionais. O achado `rls_enabled_no_policy` do Advisor (10 = 7 public + 3 private)
é **informativo**, não explorável. Nenhuma migration foi criada por causa delas.

## 4. Gates e testes

| Item | Resultado |
|---|---|
| `check-frontend-binding.sh` | OK — `ikaauvsflpmamgxmkhoq` |
| `h7p-guard-repo-only.sh` | OK — 59 repo-only íntegras e não aplicadas |
| `h7o-postcheck.sh` | PASS integral (allowlist 485 sem drift; 2 anon por design; fiscal `HOMOLOGATION|2|false|false|false|DRAFT|NOT_READY`) |
| Testes estáticos H9-B / T2 / T6 | PASS |
| Typecheck / build / Vitest | PASS |
| Advisors | Inalterados por construção: a fase não criou tabela, policy, índice ou grant (security 393 / performance 510 conforme H9-A) |
| Escrita em produção | **Zero** — nenhum acesso ao projeto de produção |

### 4.1 Arquivos alterados

`supabase/migrations/20261004000000_h9b1_rate_limit_rastreio_v1.sql` (novo),
`restoration/homologacao-h9/h9b-rollbacks/20261004000000_h9b1_rate_limit_rastreio_v1_rollback.sql` (novo),
`src/test/security/h9b-public-rpc-rate-limit.static.test.ts` (novo),
`restoration/homologacao-h9/02-h9b-seguranca-critica.md` (novo), `roadmap.md`,
e — estritamente por consequência do ledger 659 → 660 —
`restoration/homologacao-h7/h7p-repo-only-manifest.json`,
`restoration/homologacao-h7/h7p-guard-repo-only.sh` e
`src/test/security/h7p-repo-only-migrations.static.test.ts` (apenas o contador; as 59 entradas,
hashes, classificações 36/3/20 e decisões permanecem intactas).
Binding (`.env`, `client.ts`, `types.ts`) restaurado do próprio commit `f5071fe0`, sem divergência residual.

## 5. Riscos e pendências

| ID | Item | Situação |
|---|---|---|
| B1 | Proteção contra senha vazada desabilitada | Pendente (administrador do projeto) |
| B3 | Parecer fiscal/contábil humano | Pendente |
| B4 | Autorização humana de promoção | Pendente |
| R-H9B-1 | Drift recorrente de `.env` gerado pela plataforma | Mitigado por binding gate obrigatório no início de cada fase |
| R-H9B-2 | Autorização interna das 378 funções `SECURITY DEFINER` `authenticated` | `search_path` fixo confirmado; verificação de papel **a comprovar por domínio na H9-C** |

**Decisão: GO para H9-C / NO-GO produção.**

## 6. Prompt independente para H9-C

> INICIE E CONCLUA A FASE H9-C — REVISÃO DIRIGIDA DE PRIVILÉGIOS DAS FUNÇÕES `SECURITY DEFINER` EXECUTÁVEIS POR `authenticated`.
>
> Fonte de verdade: commit publicado autoritativo da H9-B; homologação `ikaauvsflpmamgxmkhoq`;
> produção `navfzbwgwzruipouyfnk` proibida; ledger 660, última `20261004000000`.
>
> Objetivo: comprovar, por domínio e por leitura de `prosrc`, se cada função `SECURITY DEFINER` executável por
> `authenticated` aplica verificação de papel/escopo antes de ler ou escrever dado sensível. Priorize nesta ordem:
> `rpc_admin_*`, funções que escrevem em tabelas financeiras e fiscais, `rpc_fiscal_*`, `fn_fin_*`/`get_financial_*`,
> `rpc_cc_*`, `rpc_b2b_*`, demais domínios.
>
> Travas: não revogar em massa; não alterar Auth, cron, Storage, Edge Functions, frontend, rotas, `.env`,
> `client.ts`, `types.ts` nem as 59 migrations repo-only; não alterar achados de performance; não emitir documento
> fiscal real; não expor segredos; corrigir apenas com vulnerabilidade objetivamente comprovada, por migration única,
> idempotente, mínima e reversível, aplicada só em homologação.
>
> Execução: restaure o binding do commit-base se houver drift e registre; classifique cada função em
> AUTORIZAÇÃO COMPROVADA, AUTORIZAÇÃO AUSENTE ou NÃO APLICÁVEL (leitura pública/agregada); para cada
> "ausente", teste como `authenticated` de perfil sem direito e registre o resultado; execute
> `check-frontend-binding.sh`, `h7p-guard-repo-only.sh`, `h7o-postcheck.sh`, testes estáticos, T2/T6,
> typecheck, build e regressão.
>
> Entrega: SHA publicado, arquivos alterados, tabela nominal por domínio, testes e gates, ledger e Advisors,
> riscos, decisão e prompt para H9-D. Produção permanece NO-GO por B1, B3 e B4.
