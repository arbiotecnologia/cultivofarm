# RTC empresa — implantação independente informada em 26/10/2026

- Migration: `fiscal_company_rtc_cas_http409_20261026`, aplicada pelo proprietário; NÃO reaplicar.
- Destino informado: canônico `swzpzcwiasxmjutrmvkm`. Nenhuma operação hosted pelo agente.
- Função: `public.rpc_fiscal_company_rtc_save(jsonb,text)`; prehash `bdcd800e957127cc9294fac26605ae94`. Pós-hash/corpo completo não fornecidos; não inferidos.
- Preserva h15 staff/admin; bloqueia `cf_user_guards_v1.state FOR UPDATE`, revalida autorização, exige exatamente um cadastro na organização e bloqueia a linha fiscal.
- Ausente: PT404 / FISCAL_COMPANY_NOT_INITIALIZED. Ambígua: PT409 / FISCAL_COMPANY_AMBIGUOUS. Revisão nula ou stale: PT409 / FISCAL_CONFLICT.
- UPDATE filtrado por id/organização/updated_at; stamp `greatest(clock_timestamp(), anterior + 1 microsecond)` e erro se zero linhas. Não muda status/atestação contábil.
- Provas reais relatadas pelo proprietário: A null/stale HTTP409; B sem cadastro HTTP404. Não são testes JWT executados pelo agente.

## Serviço global — revisão, não implantação

Achado informado: `rpc_fiscal_service_ibs_cbs_save` e `rpc_fiscal_service_profile_ibs_cbs_save` DEFINER permitem admin/financeiro em `service_fiscal_profiles` global sem organização, apesar da política UPDATE Superadmin. Hardening servidor/CAS aguardam canal global do auditor. Nenhum DDL preparado/aplicado neste recorte; não se presume proteção do endpoint pela interface.

Interface existente: FiscalServicos usava `getAccessLevel(role) === rw` para Novo/Editar/IBS; hook de serviços tinha `valid = () => true`. Correção local apenas restritiva: UI intersecta acesso existente com fence global Superadmin, hook IBS/CBS usa o mesmo fence de produtos em ambos os kinds de serviço e rejeita revogação/respostas antigas. Nenhuma rota/papel/ACL ampliada. Hook de cadastro direto e caches globais de serviços não foram reestruturados; revisão completa desse canal permanece pendente.

Relatório anterior `remaining-40001-review-20261026.md` permanece histórico: pendência RTC foi tratada independentemente conforme este relato, não PASS inferido para outros serviços ou triggers. Contagem de funções ainda com 40001 não recapturada; não deduzir contagem nova.