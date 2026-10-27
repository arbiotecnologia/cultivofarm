# Revisão 40001 restantes — SOMENTE RELATÓRIO (sem DDL), 2026-10-26
Fonte: últimas definições em supabase/migrations (heurística estática). LIVE informa 47 restantes; só 21 estão no repositório — as 26 aplicadas externamente NÃO foram revisadas (precisam captura READ ONLY). Nenhum PASS assumido.

função|nº 40001|security|auth.uid|FOR UPDATE|CAS aparente|migration
platform_private.set_org_principal_admin_core|2|DEFINER|uid=True|lock=True|cas=True|20261007015153
platform_private.tenant_smtp_activation_set|2|DEFINER|uid=True|lock=True|cas=True|20261016164330
platform_private.update_org_admin_core|3|DEFINER|uid=True|lock=True|cas=True|20261007015654
platform_private.update_organization_profile_core|2|DEFINER|uid=True|lock=True|cas=True|20261007032147
public.platform_archive_plan_version|1|invoker|uid=True|lock=True|cas=True|20261006032326
public.platform_begin_org_admin_email_change|3|DEFINER|uid=False|lock=True|cas=True|20261007015654
public.platform_extend_trial|1|invoker|uid=True|lock=True|cas=True|20261005231945
public.platform_publish_plan_version|2|invoker|uid=True|lock=True|cas=True|20261005232410
public.platform_publish_plan_version_draft|6|invoker|uid=True|lock=True|cas=True|20261006231457
public.platform_save_plan_version_draft|1|invoker|uid=True|lock=True|cas=True|20261006035846
public.rpc_enviar_visita_aprovacao|1|DEFINER|uid=True|lock=True|cas=True|20260805152009
public.rpc_financial_document_soft_delete|2|DEFINER|uid=True|lock=True|cas=False|20260730000000
public.rpc_fiscal_company_rtc_save|1|DEFINER|uid=True|lock=False|cas=True|20260919015635
public.rpc_fiscal_draft_save|1|DEFINER|uid=True|lock=True|cas=True|20261031000000
public.rpc_fiscal_product_ibs_cbs_save|1|DEFINER|uid=True|lock=False|cas=True|20260727000000
public.rpc_fiscal_service_ibs_cbs_save|1|DEFINER|uid=True|lock=False|cas=True|20260727000000
public.rpc_fiscal_service_profile_ibs_cbs_save|1|DEFINER|uid=True|lock=False|cas=True|20260727000000
public.rpc_salvar_campo_visita|1|DEFINER|uid=True|lock=False|cas=True|20260716235200
public.visitas_campo_guard|1|invoker|uid=False|lock=False|cas=False|20260717000537
tenant_smtp_executor.tenant_smtp_lane_authorize|1|DEFINER|uid=False|lock=True|cas=True|20261016164330
tenant_smtp_executor.tenant_smtp_lane_finish|3|DEFINER|uid=False|lock=True|cas=False|20261016164330

## Achados prioritários (auth/CAS)
1. **rpc_fiscal_company_rtc_save(jsonb,text)** — PENDÊNCIA DE CONCORRÊNCIA: SELECT da revisão seguido de UPDATE sem FOR UPDATE/lock e sem `updated_at` no WHERE do UPDATE (lost update entre chamadas concorrentes). `expected_revision NULL` dispensa a CAS. Escolhe "a mais recente" por `ORDER BY updated_at LIMIT 1` — exige revisão de triggers e escopo (vários registros por org?) antes de corrigir.
2. **rpc_fiscal_product_ibs_cbs_save / rpc_fiscal_service_ibs_cbs_save / rpc_fiscal_service_profile_ibs_cbs_save** — mesmo padrão sem lock aparente (migration 20260727); verificar se as versões LIVE pós-h15 mantêm isolamento por empresa.
3. **rpc_salvar_campo_visita** — CAS sem lock aparente; revisar.
4. **platform_begin_org_admin_email_change** e **tenant_smtp_executor.*** — sem `auth.uid()` no corpo: confirmar ACL service-only/guards no wrapper (SMTP: preservar handlers 40001→409 da Edge).
5. **visitas_campo_guard** (trigger invoker) — 40001 em trigger: avaliar se é conflito de negócio ou serialização legítima.
6. Funções da plataforma (planos/admins/perfil) usam lock+CAS; candidatas a PT409 em lote separado, com verificação de clientes (`usePlataformaSaaS` trata 40001).
Fora do escopo: correção. Próximas fases separadas por função, com pin md5 LIVE.

## Atualização independente — 26/10 23:54 UTC (sem nova captura/DDL pelo agente)

- A contagem47 acima é histórica; auditor confirmou **44 funções com40001** restantes. Isso não certifica os corpos das funções externas nem permite substituir serialização verdadeira/handlers SMTP indiscriminadamente.
- RTC empresa aplicado, pósMD5 `ba28b1365b38dd8f1c8d489591259ecf`: corrida real relatada1×200/1×409; DRAFT preservado.
- Dois RPCs globais de serviço endurecidos em `fiscal_services_global_auth_cas_http409_20261026`, hashes e negações A/B no registro RTC; NÃO reaplicar. Produto/global cadastral e caches ainda exigem revisão própria.
- **Prioridade auth/CAS pendente: `rpc_fiscal_draft_save`** usa `draft_version <> p_expected_version`; com parâmetroNULL a comparação não é TRUE, permitindo bypass do teste. Revisar cadeia completa, wrappers/callers, autorização pré/pós-lock, identidade/tenant, revisão obrigatória, atomicidade e tratamento de conflitos antes de qualquer proposta SQL. Achado informado, não explorado nem corrigido aqui.

## Atualização independente — 27/10 00:19 UTC

- **Contagem atual:42 funções40001**, informada pelo proprietário após duas aplicações;44/47 acima são registros históricos, não contagem vigente.
- `fiscal_draft_required_revision_http409_20261027`, pósMD5 `224ab7944abd13190fe8ea1044216218`: revisão obrigatória/CAS; NULL/zero/stale409 A, referênciaA porB403 e corrida versão1 um200/outro409 relatados. Rascunho fictícioA DRAFT R$1, sem emissão. AchadoNULL acima encerrado pelo auditor, não reaplicado aqui.
- `monitoring_tenant_boundary_required_cas_20261027`, pósMD5 `b32bf163ed7ccb989f4f0b653827d825`: isolamento tenant/origem, helper privado/policy restritiva, autorização pós-lock/CAS obrigatório, PT404/PT409 e envelope canônico relatados. Nenhuma fixture/reprogramação real criada/executada pelo agente.
- Demais funções e serialização verdadeira/SMTP permanecem fora do recorte; não inferir revisão integral ou novos hashes.
