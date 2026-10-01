# Plano — Planos personalizáveis por empresa — 2026-10-01

Backend canônico: `swzpzcwiasxmjutrmvkm`. Insumo para as Fases S2/S3 (entitlement
engine e overrides). Nenhuma implementação foi feita nesta rodada — este documento
é o plano acordado com o proprietário.

## 1. Princípio

O **plano define o padrão**; a **empresa pode ter exceções**. Nunca alterar um
plano para diferenciar um cliente — toda personalização vive em camada própria,
com vigência, motivo e histórico imutável. O catálogo do plano permanece a base;
as exceções vencem sobre ele.

## 2. Camadas de personalização (em ordem de precedência)

1. **Override por organização** — `organization_feature_overrides` (a criar na S3):
   `subscription_id`, `feature_id`, tipo (`GRANT` | `REVOKE` | `LIMIT`),
   `limit_value`, `config jsonb`, `motivo`, `valido_ate` (opcional, com checagem
   por trigger — não CHECK — para validade temporal). Uma exceção temporária
   expira sozinha; nada é apagado.
2. **Config da assinatura** — `organization_subscriptions` já tem campos de
   período; personalizações de **vigência/datas** (trial estendido, carência)
   ficam na própria assinatura, sempre registrando linha no histórico.
3. **Config do plano** — `saas_plan_features.config jsonb` (já existe): parâmetros
   default do plano (ex.: nº de usuários, limite de envios de Comunicação).

Precedência: override vigente > config da assinatura > config do plano.

## 3. Casos de uso suportados

| Caso | Mecanismo |
| --- | --- |
| Empresa do plano Gestão que precisa do módulo Fiscal | `GRANT` temporário com `valido_ate` |
| Empresa que perdeu um módulo por inadimplência negociada | `REVOKE` com motivo e revisão |
| Franquia de envios maior que o do plano | `LIMIT` com `limit_value` |
| Trial estendido para negociação | Datas na assinatura + histórico |
| Preço/condição especial | Fora de escopo aqui (billing, S7) — não vira plano novo |

## 4. Regras de segurança (herdadas das fases anteriores)

- Escrita de overrides/plano/assinatura **somente** por rotinas de plataforma
  (`service_role`/RPC `SECURITY DEFINER` com `is_platform_superadmin`); nenhuma
  policy de escrita para `authenticated`.
- Todo override exige `motivo` e registra `old_values`/`new_values` no histórico
  imutável (mesmo padrão `*_no_mutation` + trigger de auditoria da S1).
- `get_my_entitlements()` (S2) resolve a precedência no servidor; o frontend
  nunca calcula entitlement.
- Overrides expirados não bloqueiam: apenas deixam de valer (fail-closed se a
  feature só existia via `GRANT` temporário).

## 5. Sequência de implementação

1. **S2** — `get_my_entitlements()` considerando plano + assinatura (sem overrides).
2. **S3** — migration `organization_feature_overrides` (RLS, grants, índices por
   assinatura/feature, validade por trigger) + precedência no `get_my_entitlements()`
   + sondas transacionais de expiração e conflito.
3. **S4** — telas do painel de plataforma: criar/editar override com motivo e
   prazo; exibiroverrides vigentes por empresa.
4. **S5** — limites de consumo com `saas_usage_counters` validando `LIMIT`.

## 6. Decisão pendente do proprietário (não bloqueia o plano)

- Tratamento da CultivoFarm atual sem assinatura quando o motor ligar: recomendação
  registrada — assinatura ativa fundadora com tudo liberado, mantendo a operação
  intacta; empresas novas seguem o fluxo normal (TRIAL → ACTIVE etc.).
