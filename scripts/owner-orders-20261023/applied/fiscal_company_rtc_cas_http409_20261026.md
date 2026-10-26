# RTC empresa — implantação independente informada em 26/10/2026

- Migration: `fiscal_company_rtc_cas_http409_20261026`, aplicada pelo proprietário; NÃO reaplicar.
- Destino informado: canônico `swzpzcwiasxmjutrmvkm`. Nenhuma operação hosted pelo agente.
- Função: `public.rpc_fiscal_company_rtc_save(jsonb,text)`; prehash `bdcd800e957127cc9294fac26605ae94`. Pós-hash informado pelo auditor às23:54: `ba28b1365b38dd8f1c8d489591259ecf`; corpo completo não recapturado pelo agente.
- Preserva h15 staff/admin; bloqueia `cf_user_guards_v1.state FOR UPDATE`, revalida autorização, exige exatamente um cadastro na organização e bloqueia a linha fiscal.
- Ausente: PT404 / FISCAL_COMPANY_NOT_INITIALIZED. Ambígua: PT409 / FISCAL_COMPANY_AMBIGUOUS. Revisão nula ou stale: PT409 / FISCAL_CONFLICT.
- UPDATE filtrado por id/organização/updated_at; stamp `greatest(clock_timestamp(), anterior + 1 microsecond)` e erro se zero linhas. Não muda status/atestação contábil.
- Provas reais relatadas pelo proprietário: A null/stale HTTP409; B sem cadastro HTTP404; corrida real 1×HTTP200/1×HTTP409, DRAFT preservado. Não são testes JWT executados pelo agente.

## Serviço global — implantação independente informada às23:54

Achado anterior: os dois RPCs DEFINER permitiam admin/financeiro em `service_fiscal_profiles` global sem organização, apesar da política UPDATE Superadmin. O auditor informou aplicação de `fiscal_services_global_auth_cas_http409_20261026`; NÃO reaplicar. Hashes pós informados, respectivamente: `rpc_fiscal_service_ibs_cbs_save` = `b924520c75a3707f8fb927e3ab6db652`; `rpc_fiscal_service_profile_ibs_cbs_save` = `e9e78a0b2738aa39c088b34a3505e16b9`. A/B ambos HTTP403/FISCAL_FORBIDDEN relatados. Nenhum DDL ou prova JWT foi executado pelo agente; corpos/ACLs não recapturados aqui.

Interface existente: FiscalServicos usava `getAccessLevel(role) === rw` para Novo/Editar/IBS; hook de serviços tinha `valid = () => true`. Correção local apenas restritiva: UI intersecta acesso existente com fence global Superadmin, hook IBS/CBS usa o mesmo fence de produtos em ambos os kinds de serviço e rejeita revogação/respostas antigas. Nenhuma rota/papel/ACL ampliada. Hook de cadastro direto e caches globais de serviços não foram reestruturados; revisão completa desse canal permanece pendente.

`getAccessLevel(superadmin, /configuracoes/fiscal/servicos)` continua `none`: portanto esta página tenant fica somente consulta; nenhum editor/rota global novo foi habilitado. Hook permite autoridade global já existente, mas não abre navegação. Canal global de interface continua sem autorização; hardening servidor já aplicado externamente conforme relato acima.

## Diff e testes locais

- `src/hooks/useFiscalRtc.ts`: mensagem específica para ambiguidade; PT409 preserva dados/revisão, sem auto-retry; RTC cercado por ator/empresa antes/depois RPC; serviços compartilham fence global/CAS, sem `valid=()=>true`.
- `src/hooks/useProductFiscalAccess.ts`: comentário esclarece reutilização para catálogo fiscal global, sem mudança de autorização.
- `src/pages/configuracoes/FiscalServicos.tsx`: Novo/Editar/Salvar restritos por interseção com Superadmin/fence, submit negado sem autoridade; rotas/mapa intactos.
- `src/test/fiscal/rtcCompanyCasHttp409.test.tsx`: 13 testes hooks reais, transporte/Auth simulados: stale/null/ambígua/404, CAS/revisão, A→B/revogação, admin/financeiro negados nos dois kinds, sucesso global e rejeição tardia.
- `src/test/fiscal/fiscalServicos.globalAuthorization.test.tsx`: 5 testes página real, leitores simulados; consulta admin/financeiro/gestor, Superadmin sem rota, capacidade isolada não concede escrita.
- Comando: `bun run test -- src/test/fiscal/rtcCompanyCasHttp409.test.tsx src/test/fiscal/fiscalServicos.globalAuthorization.test.tsx src/test/fiscal/bloco5_service_profile_ibs_cbs.test.ts src/test/fiscal/fase3_19_2.audit.test.ts src/test/fiscal/fase3_19_4.audit.test.tsx src/test/fiscal/fase3_3.static.test.ts src/test/fiscal/productFiscalProfiles.session.test.tsx`.
- Resultado: 130/130 em 7 arquivos; build automático 23:47:48 UTC OK. Sem typecheck/build manual; sem prova JWT/RLS servidor ou browser autenticado. Fixture inicial da página retornava objeto novo em cada render (loop), corrigida para identidade estável antes do resultado final.
- Nenhum comando Git de commit executado; revisões são geridas pela plataforma.

Relatório anterior `remaining-40001-review-20261026.md` permanece histórico: RTC e dois serviços tratados independentemente conforme este relato. Auditor confirmou 44 funções ainda com40001 às23:54; não se deduz PASS nem troca global de erros de serialização verdadeiros. SMTP intacto.

## Concorrência cliente — revisão0bbca9a, correção local

- Reproduzidos 32/32 testes falhando antes da correção (configurações válidas, Auth/transporte simulados): oito cenários para empresa e cada kind produto/serviço/perfil de serviço.
- Ledger por hook/scope: leitura mais recente vence; save invalida leituras anteriores, trava envio sincronamente e ignora reload durante save sem invalidar seu resultado. Revisão usada pelo próximo save vem do envelope canônico aceito, não de closure React antiga.
- Exceções encerram loading/saving; finally libera apenas o próprio ticket. Troca/revogação não adota respostas nem libera save da nova scope. PT409 mantém configuração/revisão, sem refetch/save automático; rascunho do formulário não é alterado.
- `rtcOperationConcurrency.test.tsx`: 32/32 depois; junto com13 testes RTC existentes:45/45. São hooks renderizados reais com transporte/Auth simulados, não prova JWT/RLS ou browser produtivo.
- Regressão final:162/162 em8arquivos pelo comando anterior acrescido de `src/test/fiscal/rtcOperationConcurrency.test.tsx`. Duas verificações estáticas exigiam nomes literais das RPCs: mapeamento explícito preservado; tipo da fixture ampliado para ambos envelopes após erro automático. Validação automática final `build OK` às23:58:27 UTC, `git diff --check` sem erros. HEAD observado após correções `fd60dc7c245a6f9a516832dfb56ecfeffc06ee03`; nenhum commit manual executado.
- `rpc_fiscal_draft_save`: comparação `draft_version <> p_expected_version` com NULL permite bypass informado; revisão da cadeia pendente. Nenhum SQL alterado, nenhum teste servidor dessa cadeia alegado.