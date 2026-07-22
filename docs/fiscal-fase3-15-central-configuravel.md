# Fase Fiscal 3.15 — Central Configurável de NF-e e NFS-e (SEM EMISSÃO)

## Objetivo

Preparar frontend e backend para que o administrador preencha, no momento
correto, todos os dados fiscais da empresa e as configurações de NF-e e
NFS-e. Esta fase **não** implementa emissão, transmissão, cancelamento,
consulta SEFAZ/prefeitura, provedor ativo, webhook, token ou certificado.

`fiscalEmissionEnabled` permanece `false`. `production_enabled` permanece
`false` e não é editável pela UI.

## Arquivos

| Arquivo | Escopo |
| --- | --- |
| `restoration/migrations/20260723000000_fiscal_fase3_15_central_config.sql` | Migration canônica aditiva. **Não aplicada** nesta fase. |
| `src/config/featureFlags.ts` | Libera `fiscalConfigurationUi=true`; demais flags fiscais permanecem `false`. |
| `src/lib/fiscal/companyFiscalValidation.ts` | Schemas Zod (empresa, NF-e, NFS-e, refs), scanner de chaves sensíveis, checklists locais. |
| `src/hooks/useFiscalCompanySettings.ts` | Leitura, `useInitFiscalCompanySettings` (RPC segura) e `useUpdateFiscalCompanySettings` com concorrência otimista. |
| `src/pages/configuracoes/FiscalEmpresa.tsx` | Central de Configuração Fiscal em abas (Empresa · NF-e · NFS-e · Integração · Revisão). |
| `src/config/navigation.ts` | Item "Configuração Fiscal" adicionado à seção "Administração" (desktop). |
| `src/test/fiscal/fase3_1.static.test.ts` | Atualizado: flag agora `true` e rota presente no menu. |
| `src/test/fiscal/fase3_15.static.test.ts` | Novos testes de segurança, contrato e navegação. |

## Migration (aditiva)

Novas colunas em `public.company_fiscal_settings`:

- `nfe_configuration jsonb NOT NULL DEFAULT '{}'`
- `nfse_configuration jsonb NOT NULL DEFAULT '{}'`
- `nfe_provider text NOT NULL DEFAULT 'NONE'`
- `nfse_provider text NOT NULL DEFAULT 'NONE'`
- `nfe_credential_ref`, `nfse_credential_ref`, `certificate_ref`, `webhook_ref` (text; regex curto; refs, não valores)
- `configuration_notes text` (≤ 4000)
- `configuration_version integer NOT NULL DEFAULT 1`
- `last_validation_at timestamptz`
- `last_validation_status text NOT NULL DEFAULT 'NOT_VALIDATED'`
- `last_validation_summary jsonb NOT NULL DEFAULT '{}'`

CHECKs canônicos: JSONBs `object`; providers ∈
{`NONE`,`NOT_CONFIGURED`,`FOCUS_NFE`,`PLUGNOTAS`,`SEFAZ_DIRETO`,`NFSE_NACIONAL`,`MUNICIPAL`,`OTHER_FUTURE`};
status ∈ {`NOT_VALIDATED`,`INCOMPLETE`,`READY_FOR_HOMOLOGATION`,`VALIDATED_HOMOLOGATION`,`BLOCKED`};
refs sob regex `^[A-Za-z0-9_.:-]+$`.

**Fail-closed**: função `public.fiscal_json_has_sensitive_key` e CHECK
`cfs_no_sensitive_keys_in_jsonb` rejeitam recursivamente as chaves
`token`, `password`, `senha`, `secret`, `api_key`, `private_key`, `pfx`,
`p12`, `certificate_content`, `certificate_pem`, `pem`, `authorization`,
`bearer` em `nfe_configuration`, `nfse_configuration` e
`last_validation_summary`.

Outros objetos:

- View `v_fiscal_company_readiness` recriada `security_invoker=true`,
  agora com `nfe_configuration_field_count` e
  `nfse_configuration_field_count` (sem expor refs).
- Trigger `tg_fiscal_cfs_audit` grava resumo mascarado em
  `fiscal_audit_log` quando a tabela existir. Nunca bloqueia UPDATE.
- RPC `rpc_fiscal_company_settings_init()` — `SECURITY DEFINER`,
  admin-only via `has_role`, idempotente.

## Frontend

- Abas: **Empresa**, **NF-e**, **NFS-e**, **Integração e segurança**, **Revisão**.
- Banner fixo "Emissão fiscal desativada — ambiente em preparação".
- Indicador global de progresso.
- Checklists locais NF-e e NFS-e (sem I/O).
- Botões **Salvar rascunho** e **Salvar configuração**.
- Botão **Validar preenchimento** (apenas Zod local).
- Gestor/financeiro: `fieldset disabled` (leitura).
- Nenhum input de token/senha/certificado. Placeholders reforçam
  "cadastre o segredo futuramente no cofre seguro; não cole aqui".
- Nenhum botão Emitir/Transmitir/Homologar/Testar provedor.

### Campos NF-e

`enabled_for_preparation`, `environment`, `series`, `numbering_mode`,
`default_nature`, `default_finality`, `presence_indicator`,
`default_end_consumer`, `freight_modality`, `danfe_layout`,
`send_email_after_authorization`, `contingency_mode`,
`suggested_cfop_in_state`, `suggested_cfop_interstate`,
`default_additional_info`.

### Campos NFS-e

`enabled_for_preparation`, `environment`, `mode`,
`municipality_ibge_code`, `municipal_registration`, `series`,
`rps_series`, `rps_type`, `national_taxation_code`,
`municipal_taxation_code`, `lc116_item`, `cnae`, `iss_rate`,
`iss_withheld_default`, `special_taxation_regime`, `fiscal_incentive`,
`operation_nature`, `deductions_default`, `default_service_description`,
`send_email_after_authorization`.

### Integração

`nfe_provider`, `nfse_provider`, `nfe_credential_ref`,
`nfse_credential_ref`, `certificate_ref`, `webhook_ref`,
`configuration_notes`. **Apenas identificadores**; nunca valores.

## Permissões e flags

- Rota: `/configuracoes/fiscal/empresa` — administrador `rw`, gestor `r`, financeiro `r`.
- Item de menu em Administração (desktop) — pesquisável por
  "configuração fiscal", "nf-e", "nfs-e", "sefaz", "prefeitura", etc.
- `fiscalConfigurationUi=true`; demais flags fiscais (incluindo
  `fiscalEmissionEnabled`) permanecem `false`.

## Backend / Hooks

- `useFiscalCompanySettings`: leitura via cliente autenticado.
- `useInitFiscalCompanySettings`: RPC segura, admin-only.
- `useUpdateFiscalCompanySettings`: UPDATE por `id` **e**
  `configuration_version`; sem linha retornada → `conflict` (toast dedicado).
- Nenhum uso de `service_role`. Nenhum fetch a provedor. Nenhum segredo lido.

## Testes e segurança

- `bun run typecheck`, `bun run build`, `bunx vitest run` — verdes.
- Testes 3.15 cobrem: flag única liberada; ausência de input sensível;
  payload sem `production_enabled`; JSON sensível rejeitado; refs sem
  URL; hook com RPC/concorrência; navegação; migration aditiva.

## Passos externos pendentes

1. Aplicar `restoration/migrations/20260723000000_fiscal_fase3_15_central_config.sql`
   em staging (transação única) e capturar snapshot de paridade.
2. Regenerar `src/integrations/supabase/types.ts` (o hook antecipa o
   contrato via `CompanyFiscalRow` estendido até a regeneração).
3. Aplicação controlada em produção após diff de paridade zero (Fase 3.12).
4. Provedor NF-e/NFS-e, certificado, cofre e revisão legal permanecem
   como decisões humanas externas.

## Confirmação

Emissão continua **desativada**. Nenhuma configuração desta fase abre
conexão com provedor, prefeitura ou SEFAZ. Salvar é puramente interno.

**Classificação: PREPARADO PARA APLICAÇÃO CONTROLADA.** Não avançar
automaticamente.
