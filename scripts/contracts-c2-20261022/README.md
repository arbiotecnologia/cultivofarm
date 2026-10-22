# C2.1 — candidata administrativa executável, **NÃO instalar/ativar ainda**

## Entrega e limites
Primeiro recorte de contratos funcionais: `link_partner_user` ganha overload compatible para atribuir/revogar perfis externos, desvincular/reativar o mesmo parceiro e consultar estado/histórico. SQL transacional revisável, componentes inativos, teste SQL com dois processos/transações, integração do editor com transporte simulado, preflight/postflight somente leitura e rollback deny-only. **Não é entrega integral multiperfil.**

**GO para revisão local; NO-GO para instalação/ativação** até a próxima revisão completar leitores de capacidades, provisioning e matriz REST/JWT. Instalar apenas os writers agora faria o usuário cumulativo ser negado pelos readers exclusivos existentes; isso não é homologação e não deve ocorrer em produção.

### Coordenação01:46 — candidata separada, writers/readers NÃO ativados
`frontend/coordinatedContracts.ts` e testes concretizam o limite de integração: a próxima resposta das RPCs **existentes** deve identificar ator/tenant/parceiro e contextos explícitos; produtor exige prova server-side de vínculos, respostas antigas/foreign/pausadas rejeitadas. Adapter do provisionamento exige recibo cumulativo exato, readers_ready/provisioning_ready e perfis permitidos; rejeita recibo singular atual, gestor interno e vínculo produtor não provado. Não são novas RPCs nem autoridade local: sem produtor na resposta atual, decoder deliberadamente nega.
Inventário canônico confirmado: B2BRouteGuard e useMyPartner usam singleton, useAvailableContexts exclui producer do tipo válido; SelecionarPortal usa essa lista/home fixa. create-user→b2b_claim_provisioning→b2b_finish_provisioning/compensação ainda carregam external_role singular. A folha is_valid e b2b_commercial_context/projection também são exclusivas. Logo **NÃO há adaptação SQL/Edge completa autorizada por estes adapters**: continuar substituição coordenada de folha/readers/receipt/finish/compensação/resolver/preferência/guards/monitor em próxima candidata, preservando scope MD5 aplicado e financeiro separado. Nenhum módulo runtime multipapel alterado ou Edge copiada (evita deploy automático). Triggers completos/locks e JWT real continuam blockers.

Nenhum arquivo runtime, migration gerenciada, dado real, role, grant hosted, Edge, sessão ou publicação foi alterado pelo agente. Projeto confirmado em `supabase/config.toml`: `swzpzcwiasxmjutrmvkm` antes das consultas SELECT. Não há nova tabela/fonte de classificação, nova identidade ou fluxo Auth paralelo.

## Evidência externa recebida (auditor, não proprietário executor)
- `ed9f8d2c535668888ddb3b3442bb71673f26f753`: auditor repetiu111/111+tsc após sincronizar arquivos antigos.
- Deployment `1d249f08-4199-44e8-9e4e-4f4efc3dacb1` solicitado; confirmação “Seu site foi atualizado” observada pelo auditor, não pelo proprietário.
- B2B catálogo gestor antigo/v2 200/35; técnico200/[] sem aprovados; cross-parceiro403 e adminB→A403. Conteúdo técnico não vazio não certificado.
- Scope LIVE lido nesta rodada: **`c3f2997746f24bc2efd15db5c0ccc862`**, owner postgres, EXECUTE postgres/service_role. Não substituído. Organização parceira explícita continua NÃO homologada.

## Achado UI gestor teste4 (sem mexer no gate)
`useMyPartner` lê context/projection canônicos. `b2b_commercial_context` retorna `mode=commercial_owner` quando organização do usuário é a proprietária comercial; **não significa ausência de autorização catálogo**. `PortalParceiroLayout.tsx:49–51,189–197` usa esse modo para retirar TODO menu e substituir o Outlet por `CommercialOwnOrders`. A causa do modo “Cliente comercial” está comprovada no código; a evidência visual veio do auditor.

Não remover `commercialOwner`: o contrato `get_my_commercial_partner_projection` não entrega capacidades granulares; catálogo200/35 não comprova simulação/financeiro/arquivos/writes. `CommercialOwnOrders`, logo e monitor usam a mesma projeção, portanto liberar Outlet inteiro artificialmente reabriria canais não homologados. Próximo recorte deverá sinalizar **somente capacidade catálogo** via RPC canônica, com guard e entitlements; nenhum fallback por tenant/UUID/role isolado nesta entrega.

## Autoridade e semântica do primeiro writer
- Admin de empresa ativo/pronto, servidor deriva org por h15; sem self-edit, Platform Superadmin ou gestor comercial atribuindo perfis nesta allowlist. Autoridade ampliada requer revisão, não fallback.
- Alvo existente no mesmo tenant fornecedor, parceiro com owner exato e empresa ativos/statusativa. Modelo explícito orgparceira está fechado neste writer, não confundido com tenant fornecedor.
- Papéis externos: `parceiro_b2b` (gestor B2B), `parceiro_b2b_tecnico` (consultor técnico **externo**) e `cliente_produtor`. Não inserir `gestor`/`consultor_tecnico` internos: esses papéis atuais autorizam rotas internas e não provam assignments externos.
- `user_roles` continua única fonte de perfis; `partner_users.user_id UNIQUE` e `(user_id,role) UNIQUE` mantidos. `pu.papel` só projeção legada gestor-primeiro no writer, **não será fonte de capacidades multiperfil**; todos leitores abaixo precisam migração coerente antes de ativar.
- `assign` representa seleção explícita de perfis desejados, não adoção de identidade/email. Produtor só atribuído após prova de user_clientes vigente + cliente ativo + fazenda ativa no tenant. Não cria esses vínculos.
- `revoke_roles` só reduz o conjunto; `unlink` fecha partner_users por revoked_at sem remover produtor independente; `reactivate` reabre só vínculo e preserva conjunto exato, nunca insere role.
- `partner_users` tem `valid_from`, mas **não tem valid_until**. Não fabricar coluna/expiração: futuro permanece bloqueado nos readers aplicados; expiração dos vínculos produtor é testada. Janela de expiração B2B individual é requisito ainda não implementado.
- Lock existente `cf_user_guards_v1.state` antes de profile/role/link evita inversão com statement triggers. Prefiltro antes de locks, revalidação depois, CAS32 sobre estado incluindo profile.updated_at e todos roles/link. Não usa GUC/claims como autorização.
- Replay no log canônico partner_audit_logs, ator+UUID+fingerprint, serializado pelo gate existente; replay após revogação retorna recibo anterior sem alterar estado. Motivo2–500, auditoria+mutação atômicas. Chave não adotada entre atores.

## Inventário de consumidores e substituições restantes (não remover exclusividade a cegas)
| Fonte | Existente | Impacto / próxima substituição |
|---|---|---|
| `is_valid_b2b_partner_user` | count(user_roles)=1 e pu.papel exclusivo; hash935201… | Folha terá que validar conjunto externo/owner/vigência sem autorizar finanças por técnico; não alterada aqui |
| `b2b_actor_scope` | scope aplicado c3f299… chama folha | Preservar exatamente; evolução da folha afeta catálogo/RLS/finanças, exige postflight transitivo |
| `b2b_phase1_partner_visible` | se tem role técnico, exige p_technical mesmo com gestor cumulativo | Resolver capacidade da operação, não prioridade booleana; não alterado |
| `assert_b2b_partner_scope`, catálogo, preços | transitivos do scope | A/B/role técnico/role cumulativo/tenant owner obrigatórios antes da abertura |
| `b2b_assignment_identity_coherent` | singleton e pu.papel | Consumido por assignments técnicos; técnico pode perder write ao acumular, não abrir por OR |
| `b2b_commercial_context` / projection / own_orders / logo | singleton, role+papel e modo owner | Contrato deverá carregar capacidades atuais e individuais, com monitor/projeção compatíveis |
| `get_b2b_user_role_for_partner` + validate_partner_user_client_fn | retorno singular + trigger preenche user_role | Não inferir papel técnico/financeiro de prioridade; PUC containment permanece fechado |
| `get_my_available_portal_contexts` | management para gestor interno, technical para consultor interno; sem producer no enum de frontend | Reusar RPC existente e `/selecionar-portal`; produtor precisa contexto autorizado explícito e vínculos reais, sem flags legacy |
| `set_my_context_preference` | revalida lista canônica | Preservar assinatura/receipt, ampliar whitelist somente junto ao resolver e frontend; não alterado |
| useMyPartner / B2BRouteGuard / useMyCommercialOrders | roles.length===1 | Trocar somente por resposta canônica revisada e capacidade atual; monitor mantém lease15s |
| useAvailableContexts / AuthProvider / probes / AppPortalGuard / safeHome / DashboardRouter | singleton/primaryRole, producer só exclusivo | Enumerar cumulativos/residual, preferência não autoriza; respostas antigas não adotam grants |
| Configurações / externalUserDraft / usuariosValidation / userLinks | criação exclusiva e edição misto-onlyconsulta | Patch **editor** concreto abaixo; cadastro oferece fields candidato, envio deliberadamente desativado |
| create-user / external_provisioning_scope / claim+finish / compensação | receipt externo singular, singleton pós-Auth | **Impedimento concreto cadastro multiperfil**: finish compara count=1 e r.external_role; não enviar payload cumulativo até adaptar receipt+compensação no mesmo fluxo |

`exclusivity-inventory.txt` preserva os31 matches lexicais. Snapshots functions/guards/triggers/columns são SELECT do LIVE; não são fonte paralela runtime. Policies partner_users/user_roles/partner_audit_logs foram lidas; nenhuma RLS/grant alterada. Auditoria genérica tem SELECT por papel amplo, por isso o novo reader filtra tenant/parceiro/alvo no servidor e não retorna log global.

## Arquivos e uso local
- `candidate.sql.review`: contém somente novas funções/overload; não reabre stub legado nem set_partner_user_papel.
- `frontend/PartnerLifecycleFields.tsx`: seleção multiperfil, CAS congelado, retry manual mesma chave, conflito→Atualizar dados, refetch confirmado, owner token de finally e fence ator/tenant/alvo.
- `frontend/MultiProfileRegistrationFields.tsx` + `registrationContract.ts`: empresa derivada do admin, parceiro e perfis selecionáveis; cadastro **não enviável** porque provisioning singular ainda é incompatível. Não escolher outra empresa global como autoridade.
- `frontend.patch`: integração revisável em editor canônico Configurações; base hash em drift.json, sem aplicar.
- `rollback.sql.review`: revoga apenas novas APIs; histórico e filtros servidor preservados. Reversão estrutural/dados não executável.
- `preflight.sql`/`postflight.sql`: SELECT-only; executor confirma ref canônico fora do SQL. Migration tem guards transacionais de scope/ACL/owner/validator/gate/cadeia de triggers/constraints/policies. Guard reduzido recusa instalação nos testes.
- `python3 scripts/contracts-c2-20261022/test_sql.py` e `bun run test -- --config scripts/contracts-c2-20261022/vitest.config.ts`.

## Validação e bloqueios
Complemento independente `15bd79dd`: auditor executou18/18Vitest PASS; tsc original FALHOU quatro TS2339 de jest-dom. Configuração candidata corrigida inclui `vitest/globals` e `@testing-library/jest-dom`; types sem override passam localmente. A evidência original não é PASS. Histórico agora expõe ator UUID + antes/depois autorizados em páginas20 (máximo50), cursor estável at/id e whitelist sem receipt/fingerprint/payload bruto; overload2args preservada com primeira página limitada. Alterações ficam somente em C2.1, sem modificar C2-CAT.

**Gate adicional de produção: locks com triggers completos ainda NÃO reavaliados/certificados.** O harness reduzido não simula a integração integral; executar a matriz descrita em `VALIDATION.md` em instância descartável com a cadeia real antes de qualquer liberação. Não instalar writers.

Provas locais não são JWT/RLS/UI reais. Testes atuais executam corpos SQL reais em schema reduzido + Auth sintético; gate/duas transações CAS foram exercidos, **não certificam integração de todos triggers hosted**. Não confirmar técnico sem finanças por simples ausência da role gestor: teste comprova ausência de role, mas as RPCs financeiras cumulativas precisam matriz real. Testes de UI candidatos usam QueryClient real e transporte simulado, não sessão teste4.

Types/build: harness automático verifica runtime; isso não certifica frontend candidato isolado. Ver `VALIDATION.md` para recibo e comando independente necessário. Sem instalação, o fluxo autenticado C2 é **UNVERIFIED**. Contratos cumulativos, seletor produtor, cadastro multiperfil, capabilities/monitor e expiry B2B continuam próximos recortes da **mesma fase C2**, não concluídos por esta primeira entrega.

Pendências antigas SU518022/CDN, origin-deny/matriz anexos, monitorB RTT10041ms lease0 auto_retry, XML/OS/CQ/termos, sync imediato real, conteúdo técnico não vazio e CRUD rótulos reais continuam abertas e adiadas por decisão humana.