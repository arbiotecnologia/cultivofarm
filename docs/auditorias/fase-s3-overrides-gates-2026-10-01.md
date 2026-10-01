# Fase S3 — Exceções por empresa e gates de plano (2026-10-01)

Banco: `swzpzcwiasxmjutrmvkm` (confirmado em `.env`). Nenhum dado operacional alterado.

## Migrations aplicadas
- `20261001013422` — tabela `organization_feature_overrides` (FK RESTRICT, RLS, índice único de exceção aberta por empresa+funcionalidade, trigger de imutabilidade: sem DELETE, UPDATE só para encerrar uma vez); RPCs `platform_set_feature_override`, `platform_end_feature_override`, `platform_change_subscription`; `get_my_entitlements()` reescrita (empresa ativa + exceção vigente > plano > bloqueio).
- `20261001013456` — as 3 RPCs viraram SECURITY INVOKER (remove os 3 alertas novos do linter); policies de INSERT/UPDATE só para `is_platform_superadmin`; autor/encerrador carimbados pelo servidor.
- `20261001013533` / `20261001013603` — histórico de assinatura grava o motivo informado (origem `rpc`).
- `20261001013832` — superadmin pode LER `organizations` (necessário para gerir empresas).

## Frontend
- `useEntitlements` + `featureRouteMap`: menu esconde e `RoleGuard` mostra "Não incluído no seu plano" para rotas não contratadas. Gate só restringe; carregando/erro = comportamento anterior. Superadmin não consulta.
- `/plataforma`: aba Exceções (criar/encerrar com motivo) e cartão de troca de plano/situação.

## Evidências
- Sonda transacional (revertida): base=17, com REVOKE de NF-e=16, empresa inativa=0, RPC por admin comum negada (`platform_forbidden`), INSERT direto por admin comum negado.
- Linter: 486 alertas pré-existentes, 0 novos após remediação.
- Vitest: 5.231 testes passando, 4 ignorados; typecheck e build OK.
- Testes de escopo S1/home atualizados: escrita permitida somente via RPCs `platform_*`.

## Pendências
- Etapa 4 (checagem de plano dentro das funções de servidor de Fiscal e Comunicação) — próxima rodada.
- Teste ponta a ponta autenticado do painel de exceções na prévia.
- Limites (`limit_value`) ainda não aplicados em uso.

## Conclusão
PASS para Etapas 1–3. Etapa 4 aberta.
