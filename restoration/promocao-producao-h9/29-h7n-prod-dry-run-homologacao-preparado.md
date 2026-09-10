# 29 — H7n-PROD: PACOTE DE DRY-RUN EM HOMOLOGAÇÃO E CHECKLIST A2..A5 / P2

**Data:** 2026-09-10 (UTC-3)
**Continuação de:** `28-h7n-prod-a1-noop-evidencia-real.md`
**Execução por este ambiente:** nenhuma. Nenhum SQL executado, nenhum banco acessado, nada publicado, nenhuma Edge Function implantada, produção `navfzbwgwzruipouyfnk` intocada.

---

## 1. Objetivo

Preparar, a partir da evidência real de produção de 2026-09-10, o pacote de dry-run em homologação e o checklist de dependências que governa a liberação das ondas A2..A5 e da fase P2. Nada é promovido nesta etapa.

## 2. Bloqueio de acesso registrado

O Supabase de homologação `ikaauvsflpmamgxmkhoq` **exige novo login autenticado** antes de qualquer execução. Enquanto a sessão não for renovada pelo operador:

- o dry-run **não pode ser executado**, nem em modo somente leitura;
- nenhum gate pode ser marcado como aprovado;
- todas as ondas A2..A5 permanecem **NO-GO** e a fase P2 permanece **BLOQUEADA**.

Regra fail-closed: antes de cada comando, confirmar que o alvo efetivo é `ikaauvsflpmamgxmkhoq`. Se resolver para produção `navfzbwgwzruipouyfnk` ou sandbox `yzszlzjpovmcteuxjznj`, parar sem executar.

## 3. Artefatos criados

| Artefato | Caminho | SHA-256 | Linhas |
|---|---|---|---|
| Checklist de dependências A2..A5 / P2 | `restoration/promocao-producao-h9/h7n-prod/dry-run/00-checklist-dependencias-a2-a5-p2.md` | `ec6114fe1c03ce257de253b7dd63f8ecf0efc50a3fa703ed221bcd0a0f4efaac` | 105 |
| Prechecks somente leitura (staging) | `restoration/promocao-producao-h9/h7n-prod/dry-run/01-prechecks-readonly-staging.sql` | `138cdee080c46771219f01db166d1930e3f7cfdc716a988f1a17e3cca06cf656` | 174 |
| Plano de dry-run e gates de aceite | `restoration/promocao-producao-h9/h7n-prod/dry-run/02-plano-dry-run-e-gates.md` | `8cb7bc079ff925a408b15eaf30d84f5ee086f9d52854bf573567cae80c91fe1d` | 77 |

## 4. Prechecks somente leitura a executar após o login

Identidade e ledger de staging; schema `private` e funções `private.h7n_*`; assinatura de `get_cliente_ids_for_user(uuid)`; rótulos do enum `app_role`; existência e colunas de `mv_esteira_laboratorio` e `mv_fluxo_visita_tecnica`; colunas, `security_invoker` e dependentes das três views alvo; `fn_catalogo_preco_canonico`, `can_view_catalog_internal`, tipo `tipo_produto`, colunas `b2b_enabled` e views de catálogo; `md5(pg_get_functiondef)` de todas as funções `public`; lista e contagem de `SECURITY DEFINER` com `EXECUTE` para `authenticated`; funções vinculadas a triggers; os quatro helpers da P2 com seu `search_path`; RLS e contagem de policies das tabelas `public`.

Nenhum desses comandos escreve. O dry-run transacional posterior (`BEGIN; forward; pós-checks; ROLLBACK;`) nunca persiste mudança.

## 5. Gates de aceite

G1 alvo correto · G2 prechecks completos · G3 ledger de staging estável · G4 zero escrita persistida · G5 diff de corpos das RPCs do P1b · G6 classificação dos 277 `SECURITY DEFINER` · G7 checklist de dependências sem itens ausentes · G8 matriz de perfis · G9 RLS/grants preservados · G10 Security Advisor sem novos erros · G11 rollback comprovado · G12 backup/restore point de produção. Detalhamento em `dry-run/02-plano-dry-run-e-gates.md`.

## 6. Vereditos preservados

| Item | Veredito |
|---|---|
| H7n-PROD A1 | **NO-OP / NÃO EXECUTADA** — não registrar no ledger |
| H7n-PROD A2 (redefinição das 2 views) | **NO-GO** |
| H7n-PROD A3 (catálogo + `fn_catalogo_preco_canonico`) | **NO-GO** |
| H7n-PROD A4 (revokes e guardas de RPC) | **NO-GO** |
| H7n-PROD A5 (`search_path` dos 4 helpers) | **NO-GO** |
| Fase P2 | **BLOQUEADA** |
| Promoção geral H9 | **NO-GO** |
| Dry-run em homologação | **NÃO EXECUTADO** — login de staging pendente |

---

## 7. Tentativa de execução dos prechecks — 2026-09-10 19:21 UTC

**Resultado: PARADA FAIL-CLOSED. Nenhum comando executado, nenhum banco consultado.**

Verificação de alvo antes de qualquer consulta:

| Verificação | Resultado |
|---|---|
| Ref exigido pelo pacote | `ikaauvsflpmamgxmkhoq` (homologação) |
| Ref efetivo do canal gerenciado deste ambiente | `yzszlzjpovmcteuxjznj` (**SANDBOX — proibido**) |
| Canal autenticado para homologação | **ausente** |
| SQL emitido | nenhum |

O canal de banco disponível neste ambiente resolve para o Sandbox proibido, e não para a homologação. Conforme a barreira de ambiente e a regra fail-closed do plano (etapa D0), a execução foi interrompida antes de `01-prechecks-readonly-staging.sql`.

**Condição para retomar:** o operador precisa renovar o login autenticado apontando para `ikaauvsflpmamgxmkhoq` e executar os prechecks por esse canal, arquivando a saída bruta com SHA-256. Este dossiê será então atualizado com o resultado real.

**Vereditos inalterados:** A1 `NO-OP` (fora do ledger); A2..A5 `NO-GO`; P2 `BLOQUEADA`; promoção geral `NO-GO`; dry-run `NÃO EXECUTADO`.
