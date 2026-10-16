# Vínculos externos — V0 mínimo: leitores históricos

**Autorização:** Renato, 16/10/2026 22:59 UTC, plano86ad803b revisado. **Base observada antes do delta:** `970cd595`. SQL e Edge somente candidatos; nenhum DDL, escrita hospedada, deploy Edge ou publicação. Único runtime alterado: leitor da página ConsultorTecnico. Common/UItrue, SQLtrue e quatro linhas de auditoria common preservados; gates de gestão de associação não abertos. Sem roles/links/contas/Auth/SMTP.

**Reconciliação documental 23:09 UTC; base local `6dffc373`:** auditor instalou no canônico a migration `20261016230114 user_client_access_deny_revoked_links` enquanto V0 era preparado. Somente o helper foi instalado; campanha e Edge continuam candidatas. Nesta reconciliação o agente fez apenas SELECT de ledger/definição e arquivamento/documentação, sem runtime adicional, reaplicação, deploy ou publicação. Não executar o candidato combinado antigo como instalação pendente do helper.

## 1. Evidência externa, separada da prova própria

Auditor informou Produtor real no preview: `/configuracoes` e `/financeiro` redirecionam a `/portal`; `/portal/financeiro` exibe título existente **sem valor comercial** do cliente principal AR. Separadamente, SQL com claims/ROLLBACK em accounts_receivable: **uma linha própria visível, zero outros clientes e zero outros tenants**. São provas diferentes: UI real não prova composição completa RLS; claims não são JWT/API/browser. Não houve prova de retirada automática de dados na sessão aberta ou de revogação distribuída. Dados comuns publicados previamente PASS com restauração e audit4 continuam aceitos, não foram retestados/mutados nesta rodada.

## 2. Destino e schema recapturados somente leitura

Config comprovada `supabase/config.toml`: project_id **swzpzcwiasxmjutrmvkm**. Ferramenta read_query ligada ao projeto externo canônico; nenhum cliente runtime paralelo. `current_database()=postgres` NÃO prova ref, por isso scripts exigem confirmação externa do destino antes da execução.

Tabela correta **public.commercial_campaigns**, não campanhas. Dez colunas: id,nome,descricao,data_inicio,data_fim,ativa,created_by,created_at,updated_at,tipo_publico. FK de commercial_campaign_clientes→campanha/cliente, PK(campaign_id,cliente_id). user_clientes: UNIQUE(user_id,cliente_id), is_active, revoked_at/revoked_by, valid_from NOT NULL DEFAULT now(), valid_until nullable, principal, access_level. Datas inclusivas preservadas: start<=now e end>=now; NULL como live resolver, sem nova regra de negócio. partner_users/UNIQUE não alterados.

Captura: commercial_campaigns=1; commercial_campaign_clientes=1; common_gate=true; common_audit=4. Nenhum conteúdo pessoal de ledger/contas foi lido.

## 3. Fonte canônica live e diferença do histórico local

`public.get_cliente_ids_for_user(uuid)` live MD5 **c80d5900692d960f649d0a9f7850fe2c**: filtra ativo, revoked_at NULL, datas e fallback profiles.cliente_id condicionado a EXISTS vigente. Protege UID via fn_authz_uid_scope_ok. Nenhuma alteração desse resolver. A investigação auxiliar citou migration local antiga; isso não representa live e **não reabre o alerta falso**.

`public.has_active_user_cliente_access(uuid,uuid,text[])` live **já exige `AND uc.revoked_at IS NULL`**, instalado pelo auditor na migration `20261016230114`. SELECT próprio confirmou MD5 de `pg_get_functiondef` **e099f51d128620e5a68cc3e9001dd976**, igual ao statement único do ledger; MD5 de `prosrc` **dd91e64bc1d9e4a7645bbf4a750632db**. Baseline anterior informado pelo auditor: **e900be25dbf7c2d0cd3105bf13dcfb94**. O relato anterior atribuía indevidamente ao hash atual a ausência de revoked_at: corrigido, não confundir baseline e pós-instalação. Mudança exata: só esse predicado; branches, assinatura e ACL preservados conforme auditor. Metadados próprios atuais: owner postgres, STABLE SECURITY DEFINER, search_path=public, EXECUTE postgres/service_role/authenticated, sem PUBLIC/anon. **Helper isolado não é prova de tenant:** seu contrato atual não recebe tenant; autorização de recursos continua dependendo dos guardas/RLS consumidores. Não inserir tenant fictício ou alterar bypass nesta rodada.

Evidência **externa do auditor**, não reexecutada pelo agente: antes da aplicação, BEGIN/ROLLBACK com Produtor existente e `revoked_at=now(), is_active=true` retornou helper TRUE e cardinalidade do resolver principal 0. Após aplicação, valid/revoked/inactive/future/expired retornaram **true/false/false/false/false**. Regressão RLS com claims/ROLLBACK sobre dados reais existentes: registros_consultor **3→0**, registros_consultor_recomendacoes **2→0**, visita_diagnosticos **3→0**, visitas_campo **2→0**, visitas_checkin **2→0**, visitas_logs **26→0**; nenhuma mutação committed. Readback externo preservou vínculo ativo, principal e revoked_at NULL. Esses resultados SQL não são prova UI/JWT de revogação ou de cache distribuído.

## 4. Composição completa de campanhas — sem alegar exposição

| Tabela | Policies SELECT/ALL efetivas para leitura |
|---|---|
| commercial_campaigns | três permissivas, zero restritivas: campanhas_admin_all (Admin/Gestor Comercial), campanhas_partner_select (B2B físico atual), campanhas_cliente_select (vínculo histórico sem filtros) |
| commercial_campaign_clientes | única camp_clientes_admin_all, Admin/Gestor Comercial; nenhum SELECT Produtor |
| commercial_campaign_products | admin ALL e partner SELECT via commercial_campaign_partners |
| commercial_campaign_partners | admin ALL e partner self SELECT |
| user_clientes | self SELECT e Admin same-tenant SELECT; não há DML policy |
| clientes | read via can_user_access_cliente + writers tenant; restritiva tenant_isolation_d51_5 |

Todas seis tabelas têm RLS=true, FORCE=false; ACL live anon/authenticated/service_role contém arwdDxtm (owner também). Grants não anulam RLS; anon sem policy correspondente não ganha acesso. Helper/resolver/UIDscope/h15 públicos: EXECUTE authenticated/service_role, não PUBLIC/anon. Não modificar ACL.

JOIN da policy campanhas_cliente_select é subquery INVOKER, portanto a RLS da **commercial_campaign_clientes** aplica-se. Titular Produtor exclusivo não satisfaz a única policy filha. Consequência: predicado histórico confirmado, **exposição efetiva de campanha ao Produtor não demonstrada** e positivo end-to-end pode continuar zero mesmo com vínculo válido. Candidato mantém JOIN/ACL/irmãs; não usa serviço nem DEFINER para furar a filha. Usa resolver canônico vigente para IDs e clientes com tenant h15 (RLS preservada). Não cria RPC por tela nem amplia catálogo/campanhas.

Critério ativo/vigente aceito significa membership/helper e predicado na fixture descartável autorizada; não prometer campanha live visível contrariando RLS. Se produto precisar acesso às campanhas, será outro recorte explícito, não correção de revogação.

**Positivo Produtor em campanha hospedada: UNVERIFIED.** Auditor informa ausência de associação/fixture atual aplicável; filha continua RLS admin-only (Admin/Gestor Comercial). Não fabricar PASS, ampliar filha ou inferir exposição apenas pelo predicado confirmado.

## 5. Auditoria de dependentes e irmãs do helper

Closure conservadora por nomes em corpos: **27 funções candidatas**, incluindo dois overloads can_user_access_cliente, fazenda/arquivo, criação aplicação, Storage paths, visita locks/writers, dependências, reader e helper legado fechado. Substring é inventário conservador, não prova de chamada/exposição. **18 tabelas** com políticas diretas/transitivas, irmãs contadas integralmente:

| Tabela | total / restritivas |
|---|---|
| alertas_agronomicos | 4/0 |
| aprovacoes_tecnicas | 6/4 |
| arquivos | 2/0 |
| clientes | 3/1 |
| clima_dados | 4/0 |
| fazendas | 3/1 |
| ordens_servico_onfarm_status_history | 1/0 |
| registros_consultor | 10/5 |
| registros_consultor_arquivos | 7/4 |
| registros_consultor_recomendacoes | 5/1 |
| solicitacoes_atribuicoes | 4/0 |
| talhao_safras | 3/0 |
| talhoes | 3/1 |
| visita_diagnosticos | 5/1 |
| visitas_campo | 5/1 |
| visitas_checkin | 5/1 |
| visitas_logs | 2/0 |
| storage.objects | 33/7 |

Corpos diretos de clientes/visitas_checkin/registros_consultor recapturados: Admin/Gestor e participação são caminhos alternativos; restritivas tenant/visit/gates continuam interseção. Revoked_at fecha somente branch de membership do helper, não revoga participação/mandato independente. Alertas/clima usam fazenda; arquivos entidade→helper; talhao_safras usa talhão; histórico Onfarm exige Admin/Gestor e cliente da OS; atribuições preservam ator/atribuidor/solicitação; visitas_logs via visita. Não inferir falha por ausência de restritiva: alguns cores fazem tenant. Nada nessa família foi aberto/modificado.

Inventário/reprodução em `preflight-readonly.sql` e consultas desta rodada. Hashes de irmãs capturados pelo serviço, úteis para drift, não equivalem a ensaio JWT/fullschema de cada tabela. **Pendência real:** semântica completa transitiva/SQL dinâmico/ACL dos 27 candidatos e comportamento real de cada família permanece certificação posterior; este V0 não alega gestão de associação segura/completa. Storage/URL/cache não alterados.

## 6. ConsultorTecnico — delta aplicado na fonte

`src/pages/ConsultorTecnico.tsx`, queryFn de queryKey consultor-clientes: captura selectedUserId, chama cliente canônico `supabase.rpc("get_cliente_ids_for_user", {_user_id})` com receiver preservado; erro explícito, vazio sem fallback; lê principal somente dos IDs autorizados, depois clientes pela RLS existente. Sem duplicar calendário em frontend. Consulta raw-link ainda sofre RLS; resolver não autoriza listar qualquer outro usuário (Admin escopado pode; próprio titular pode; demais conforme contrato atual, retorna vazio). Leitura existente podia não funcionar para Gestor listar outro técnico sob RLS; não ampliar por novo grant.

Testes executam **queryFn extraído da AST da página real**, não cópia nem asserção de string: prova receiver e ids autorizados, erro/vazio sem leitura histórica. SDK/identidades simulados, sem rede; não é prova UI autenticada do titular nesta rodada. Cache same-identity/queryKey antigo não é resolvido por V0, gestão segue fechada.

## 7. list-portal-users — candidata NÃO implantada

Fonte existente em supabase/functions intacta. Candidata `scripts/user-links-v0/list-portal-users.index.ts.review`, diff separado. Mantém JWT claims, h15 organização, roles Admin/Gestor/Administrativo, cliente pelo anon com RLS/organization_id, perfis same-tenant antes de roles/Auth metadata. Confere ref exato antes de clientes. Serviço não autoriza ator/tenant.

Query privilegiada usa is_active=true, revoked_at NULL e vigência; filtro aplicado **na consulta server-side**, não só frontend. Revalida ator/tenant/cliente após IO, relê membership vigente e perfis do tenant antes da resposta; remove revogados durante IO. Campos de saída e principal mantidos. Datas no serviço são relógio Edge, compatíveis inclusivos; desvio Edge/DB e corrida após última verificação são limites, não promessa de serialização. Não cria nova RPC/serviço indiscriminado. Não altera Auth senhas/contas; leitura last_sign_in existente preservada.

Paginações da listagem e revisão de sessão distribuída permanecem fase posterior; não ampliar retorno além do contrato atual ou fingir completude nos1000 PostgREST. Testes handler real com SDK filtrante cobrem quatro estados históricos, tenant/cliente/role forjados e revogação durante IO.

## 8. Principal separado da policy

`scripts/user-links-v0/principal-analysis.md` documenta ordem instalada: user_clientes BEFORE STATEMENT gate→AFTER ROW sync→touch; sync atualiza outros links e profile passando guards/stamp. **Não há trigger enforce em user_clientes live**; há em roles e profiles, mas branch profiles não valida principal. Proposta lógica separada, sem SQL instalável/mistura com policy, sem presumir convergência/último vínculo/revogação temporal. Nenhum trigger alterado.

## 9. Candidatos, preflight, ensaio reversível e rollback

- `installed/20261016230114_user_client_access_deny_revoked_links.sql.review`: statement EXATO do ledger, sem cabeçalho/envelope/DDL adicional; **JÁ INSTALADO, NÃO REAPLICAR**. Manifesto `installed/ledger-match.json` registra hashes e metadados live; fora da pasta automática.
- `candidate.sql.review`: candidato combinado histórico preservado byte a byte, não substituir o arquivo instalado por ele. Helper já instalado; campanha pendente de revisão. Seu baseline/hash histórico não certifica novo preflight; não executar nesta reconciliação.
- `hosted-rehearsal.sql.review`: roteiro histórico com identidades/campanha explicitamente fornecidas; não executado pelo agente, não reaplicar helper. Próximo ensaio da campanha requer reconciliação pelo auditor e associação existente aplicável; positivo atual UNVERIFIED. UID forjado requer titular não Admin.
- Sem caso real revogado/futuro/expirado disponível: usar SQL descartável test-local.py. Não adulterar conta real nem marcar ausência de fixture como PASS hospedado.
- `test-local.py`: PostgreSQL por socket /tmp, porta fixa local55496, schema/Auth/tenant reduzidos; operacional SQL exato, hash full-definition e preflight live excluídos explicitamente (não reproduz schema inteiro). Policy filha deny equivalente live dá0 ativo; policy **fixture descartável** abre filha apenas localmente para testar positivo do predicado. Tenant forjado fecha campanha. Helper conserva bypass Admin e não promete tenant sozinho.
- `rollback.sql.review`: contenção via policy cliente=false, mantém helper corrigido/irmãs/ACL, nunca restaura histórico nem apaga ledger. Rollback operacional não abre common/associações. Transação de ensaio ROLLBACK restaura definição baseline.

## 10. QA factual e aceite

Primeira execução SQL falhou instrumentalmente por UPDATE com atribuição duplicada de coluna; harness corrigido, nenhum hosted tocado. Primeiro Vitest:75PASS/1FAIL em76, falha **legada estática** esperava localStorage.removeItem literal já substituído pelo loop de chaves. Ajustado teste para executar cleanup real, incluindo chave legacy/escopada e preservação de chave alheia; nenhuma alteração de contexto/Auth/cache de produto.

**Resultado final:**76/76VitestPASS em6arquivos às23:07:21UTC, incluindo13 novos casos que executam queryFn/handler reais;16checks PostgreSQL descartável PASS; lint dos2testes0, página **16erros/2avisos legados iguais à base**, scanner globalzero/diff-checkPASS. Build automático23:07:14UTC OK. Typecheck manual/build manual não executados por regra do ambiente; typecheck dedicado deste delta **não certificado**. Snapshot funcional/QA observado `b93ea2b8`, commit final gerenciado pelo ambiente, sem git commit manual. Diffs: consultor.patch.review23linhas e edge.patch.review95linhas; manifesto SHA256SUMS cobre candidatos/testes/relatório.

Comando Vitest: `bun run test -- src/test/security/user-links-v0-readers.test.ts src/test/security/d51-5-p0c-portal-users.test.ts src/test/equipe-tecnica/pagina.static.test.ts src/test/config/externalCommonUserEditForm.test.tsx src/test/config/userLinksVersion.test.ts src/test/config/portalCliente.session.test.tsx`. SQL: `python3 scripts/user-links-v0/test-local.py`. Lint testes: `bunx eslint src/test/security/user-links-v0-readers.test.ts src/test/security/d51-5-p0c-portal-users.test.ts`. Primeira correção do teste legado revelou mock global length0/keynull: mock de enumeração corrigido só no teste; produto e setup global intocados. Resultado anterior75/1FAIL não substituído por falsa aprovação.

Testes locais não certificam hosted/JWT/Edge deploy/UI real; nenhuma alegação de atualização automática ou cache de revogação certificado. Frontend não foi verificado em sessão Admin real; sessão Produtor não monta ConsultorTecnico, portanto sua prévia não comprova esse fluxo. Nenhuma conta/sessão foi trocada. Ensaios claims futuros devem manter separação de provas. Nesta reconciliação exclusivamente documental não foram repetidos Vitest/lint/typecheck/build: resultados anteriores acima permanecem históricos, sem novo PASS inventado; integridade do SQL/manifesto e diff documental verificados separadamente.

Aceite futuro: auditor revisar SQL/Edge/diff, preflight completo sem drift, claims/ROLLBACK com usuários existentes, positivos condicionados às irmãs e negativos factuais; implantação somente quando autorizada no recorte apropriado. Piloto UI grant futuro tem confirmação específica no momento, não bloqueia preparar V0. **Sem pedido genérico de autorização humana.** Associações, URLs e resíduos em outras sessões/dispositivos seguem pendentes e gates fechados.