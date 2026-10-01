# Fase S2 — Catálogo SaaS, assinatura fundadora e motor de entitlements — 2026-10-01

Backend canônico: `swzpzcwiasxmjutrmvkm`. Nenhuma tabela de negócio alterada.

## 1. Dados cadastrados (via `run_sql`, sem DDL)

- **7 módulos** (`saas_modules`): `producao_estoque`, `comercial_b2b`, `agronomico`,
  `financeiro`, `fiscal`, `comunicacao`, `relatorios`.
- **17 funcionalidades** (`saas_features`) vinculadas por FK ao módulo.
- **4 planos** (`saas_plans`): `base` (técnico, default, tudo), `essencial`,
  `gestao`, `completo`.
- **54 vínculos** (`saas_plan_features`), todos `enabled = true`, sem limites nesta fase.
- **1 assinatura** (`organization_subscriptions`): CultivoFarm, plano `completo`,
  status `ACTIVE` — assinatura fundadora, preserva a operação atual quando o motor
  for ligado nas telas. Histórico gravado automaticamente pelo trigger
  (`source=trigger`, `reason=subscription_created`).

Todas as inserções usaram `ON CONFLICT DO NOTHING` e guarda `NOT EXISTS` na
assinatura — reexecução é idempotente.

## 2. Migration aplicada

`20261001011905_518fcc50-a55b-40be-a907-38447c996323.sql`

- `public.get_my_entitlements()` — `SECURITY DEFINER`, `STABLE`, `search_path = ''`.
  Resolve: perfil ativo do `auth.uid()` → organização → assinatura vigente
  (`TRIAL` não vencido, `ACTIVE`, `PAST_DUE`; `cancel_at` futuro) → features do
  plano ativas com `limit_value`/`config`. Sem assinatura válida retorna vazio
  (fail-closed). Nunca aceita `organization_id` do cliente.
- `public.saas_has_feature(text)` — booleano derivado da função acima, para uso
  por rotinas internas.
- `EXECUTE` revogado de `PUBLIC` e `anon`; concedido apenas a `authenticated`.

## 3. Evidências

| Verificação | Resultado |
| --- | --- |
| Contagens pós-seed | 7 módulos / 17 features / 4 planos / 54 vínculos / 1 assinatura / 1 histórico |
| Histórico de assinatura | 1 linha `subscription_created`, append-only preservado |
| Chamada sem sessão | `42501 permission denied for function get_my_entitlements` (fail-closed) |
| Resolução para a organização atual | 17 features em 7 módulos (plano `completo`) |
| Typecheck | exit 0 |
| Build | `build OK` (2026-10-01T01:27:08Z) |
| Suíte | 5.231 testes; 3 freezes de migration atualizados com a nova migration, reexecutados verdes |

## 4. Linter

Dois novos WARN `0029_authenticated_security_definer_function_executable`,
referentes exatamente às duas funções criadas — são intencionais: precisam ser
chamadas por usuários autenticados e só retornam dados da própria organização do
`auth.uid()`. Os 484 alertas preexistentes (465 do mesmo tipo, 16 RLS sem policy,
2 funções públicas, proteção de senha vazada desativada) permanecem fora desta fase.

## 5. Não feito nesta fase (deliberado)

- Nenhum gate de menu, rota, guard ou RPC de negócio foi ligado ao entitlement —
  o comportamento da aplicação está idêntico.
- `organization_feature_overrides` (S3), contadores de uso (S5) e billing (S7).
- Teste autenticado ponta a ponta do `get_my_entitlements()` via sessão real
  continua pendente (exige login de teste por perfil).

## 6. Conclusão

**PASS** para a S2 do núcleo de entitlements. Próximo passo natural: S3 —
overrides por empresa e integração nos guards, começando por um módulo
não crítico.
