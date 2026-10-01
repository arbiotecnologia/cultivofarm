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

## Etapa 4 — servidor (migration `20261001015249`)
- `_saas_user_has_feature(uid, key)` interno (EXECUTE revogado de PUBLIC/anon/authenticated; sem alerta novo).
- `fn_fiscal_can_operate` exige `emissao_nfe_nfse`; `_comunicacao_require_admin` exige `envios_automaticos` (service_role preservado).
- Sonda revertida: fiscal com plano=true, sem=false; comunicação com plano=liberada, sem=`saas_feature_nao_contratada`; helper inacessível a authenticated.
- Vitest 5.231 passando, typecheck e build OK.

## Pendências
- Teste ponta a ponta autenticado do painel na prévia: indisponível neste projeto (Supabase externo, sem sessão de teste) — conferir manualmente.
- Limites (`limit_value`) ainda não aplicados em uso — depende de definir quais limites existem.
- Demais módulos no servidor (Produção, Comercial, Agronômico, Financeiro) — rodadas seguintes, um por vez.

## Conclusão
PASS para Etapas 1–4 (Fiscal e Comunicação).

## Etapa 4b — Gates server-side Produção/Comercial/Agronômico/Financeiro (2026-10-01)
- Função `_saas_trg_require_feature()` (SECURITY DEFINER, search_path vazio, EXECUTE revogado de PUBLIC/anon/authenticated) + trigger `trg_saas_gate` BEFORE INSERT OR UPDATE em 15 tabelas: ordens_servico, ordens_servico_onfarm (ordens_producao); lotes, controle_qualidade (lotes_qualidade); envase; estoque_embalagens; partner_orders (pedidos_b2b); partner_simulations (simulacoes); commercial_condition_item_prices (catalogo_precos); registros_consultor (visitas_tecnicas); ficha_tecnica_versoes (fichas_tecnicas); accounts_receivable, financial_receipts (contas_receber); accounts_payable, payable_payments (contas_pagar).
- Erro: `saas_feature_not_entitled` (42501). Leituras/DELETE inalterados.
- Bypass: contexto sem auth.uid() (service_role/jobs).
- Evidência: 15 triggers instalados; CultivoFarm (ACTIVE Completo) possui as 11 features; 0 revogações ativas → sem mudança operacional.
- RISCO RESIDUAL: usuários de portal sem organization_id em profiles (parceiro_b2b, cliente_produtor, aplicador) não são gateados — não há vínculo de tenant para eles. Requer modelagem de vínculo portal→organização (S5).
- Pendentes: fluxo_caixa/relatorios (somente leitura, sem gate de escrita); sonda autenticada de negação em empresa sem plano (ambiente sem sessão minerável); linter sem alertas novos (486 pré-existentes).
