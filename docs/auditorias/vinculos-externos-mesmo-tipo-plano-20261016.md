# Vínculos externos do mesmo tipo — plano técnico para revisão

**Data:** 16/10/2026, solicitação 22:46 UTC. **Base observada:** `ddd5d119`.
**Estado:** PLANEJAMENTO / AUDITORIA SOMENTE LEITURA. Nenhuma implementação de associação, DDL, alteração de conta/papel/vínculo, teste de escrita ou publicação nesta rodada. Não há nova aprovação humana genérica a solicitar: o plano foi autorizado; implementação e promoção são etapas posteriores.

## 1. Evidência independente e limites da certificação

Evidência fornecida por Renato/auditor: commit `ddd5d119` revisado, **137 Vitest PASS, typecheck 0, lint novos 0, scanner 4208/zero, build 0**. Auditor abriu gate SQL e publicou deployment `779765e3-c64d-4e97-bb69-c473e8fc2c9a`.

**Dados comuns reais PASS:** Admin AR no publicado editou nome temporário do Produtor e restaurou; editou cargo temporário do B2B e restaurou. Quatro registros no ledger, dois por conta, autor Admin AR, motivo e old/new; links intactos, nomes originais e cargos null. Titular Produtor no preview viu nome atualizado/restaurado **após reload**. Não houve atualização automática na sessão aberta. Isso NÃO certifica revogação, caches distribuídos nem troca de associação.

Verificação própria somente leitura no canônico: gate `true`, `platform_private.user_edit_f2_audit` com **4 linhas/2 alvos**, `anon EXECUTE=false`; migrations `20261016221926` e `20261016223134`, um statement cada. Helper common live MD5 `d5e006ba09bfe53004971d512fc6cd49`; wrapper v1 live MD5 `a65e2174baa6996b5bfe64eb7a434524`. Não foram expostos dados pessoais/old/new. Uma consulta inicial usou o nome incorreto `user_edit_f2_ledger` e falhou sem escrita; schema confirmou o nome real `user_edit_f2_audit`.

**Aceite:** manter atribuição de evidências (externa, própria live, estática, testes locais) e não promover reload de nome a PASS de revogação.

## 2. Escopo, ator, tenant e tipos

Somente tela Usuários existente (`src/pages/Configuracoes.tsx:1080–1236`), Admin da empresa comercial AR Bio, alvo da mesma empresa, role única já existente: `cliente_produtor` ou `parceiro_b2b` com `partner_users.papel='gestor'`.

Tenant/ator derivados de sessão validada no servidor, nunca de parâmetro do browser. Revalidar readiness, empresa ativa, Admin, alvo e propriedade de referências antes de locks e após locks/replay. Não hardcodear AR Bio como autorização: o piloto é AR Bio; a regra é propriedade da empresa derivada do Admin. Alvos legados sem propriedade comprovada permanecem indisponíveis.

**Excluídos:** perfis novos, técnicos B2B, mistos, conversões interno/externo, mudanças de roles/status/tenant, Auth/senhas/e-mail/SMTP, grants de DML direto e acesso financeiro novo. Não adotar conta por e-mail. `organizations.partner_account_id` não é associação comercial do usuário: se legado conflitar com parceiro novo, negar, não transferir organização.

**Aceite:** negativos para cada role excluída e Admin FSF→AR/AR→FSF; alteração de referência nunca muda tenant ou role.

## 3. Schema, cardinalidade e propriedade live

Confirmado por `information_schema`, `pg_constraint` e `pg_policies` no projeto `swzpzcwiasxmjutrmvkm` (config local e cliente canônico conferidos antes das leituras):

| Tabela | Estado efetivo / decisão proposta |
|---|---|
| `partner_users` | `id,partner_id,user_id,created_at,papel`; PK id; **UNIQUE(user_id)**; CHECK papel gestor/tecnico; FK partner_id→partner_accounts com cascade. Sem ativo/is_active/revoked_at. Preservar unicidade e id/created_at da associação existente. |
| `user_clientes` | id,user_id,cliente_id,principal,created_at,is_active,access_level,assigned_by,valid_from,valid_until,revoked_at,revoked_by; **UNIQUE(user_id,cliente_id)**; FK cliente→clientes. Não inserir segunda linha para mesma dupla. |
| `clientes` | Elegibilidade por `organization_id` e `status_cliente='ativo'`; não inventar coluna ativo. |
| `partner_accounts` | `commercial_owner_organization_id`, `ativo`, `deleted_at`; não confundir parceiro comercial com tenant SaaS. |
| `organizations` | `ativo,status,partner_account_id`; readiness e contexto comercial precisam aceitar destino. |

Authenticated possui grants INSERT/UPDATE/DELETE nas duas tabelas de associação, mas políticas live dessas tabelas são apenas SELECT: Admin same-org e self SELECT de user_clientes. **Grant isolado não permite DML sob RLS**; preservar fechamento e testar triggers/cores privilegiados, não inferir bypass por grant.

**Aceite:** recapturar constraints/FKs/grants/RLS antes de candidato; falhar por drift. Nenhuma flag que RLS ignore.

## 4. Reutilização do contrato e separação de operações

RPC existente `admin_edit_user_profile_v1(uuid,timestamptz,jsonb,app_role[],uuid[],uuid,uuid)`, INVOKER, search_path fixo, EXECUTE authenticated/service_role, anon fechado. Preservar branch interna e modo comum `_external_edit.mode='common_preserve_links'`.

Arquivos: `src/lib/configuracoes/externalUserEditCandidate.ts:29–57`, `userLinks.ts`, `ExternalCommonUserEditForm.tsx`; helper instalado `scripts/user-links-phase2/installed/20261016223134_user_edit_f2_common.live.sql.review:11–42`.

Proposta: extensão **explicitamente discriminada** do wrapper, encaminhando operação de associação para núcleo privado específico, com gate independente de common-only. Não reinterpretar arrays vazios/null do modo comum como remoção. Contrato estrito distingue `assign_same_type`/`replace_same_type`, preview e confirmação. Roles devem ser idênticas às atuais; campos comuns permanecem idênticos. Associação e edição comum não se misturam nesta fase mínima. O formulário comum continua operacional.

**Aceite:** teste do modo comum com links preservados, branch interna inalterada, modo desconhecido/campos extras/aliases conflitantes negados e receiver canônico preservado (`rpc.call(supabase,...)` quando extraído). Não reaplicar candidata common nem `eligible.sql.review` antigo.

## 5. Seleção paginada e previews antigo/novo

Propor leitor autorizado de elegíveis na tela existente, por tipo e alvo; derivar tenant server-side, devolver somente id/nome e estado necessário de **clientes/parceiros próprios e ativos**. Busca normalizada/parametrizada, ordenação estável por nome+id, cursor/keyset opaco vinculado a ator/tenant/tipo/busca; limite **proposto** máximo100 (não configurado nesta rodada). Página zero, cursor inválido, outra busca/tenant, limite negativo/excessivo e destino desaparecido precisam falhar ou produzir vazio distinto de erro. Sem lista global client-side e sem varredura truncada nos1000 da API.

Preview autorizado mostra vínculos atuais elegíveis, removidos, mantidos, adicionados e principal/parceiro resultante; referências fora de alcance apenas contadas, sem nomes/IDs vazados. Se existem links não comprovados, negar edição, não descartá-los implicitamente. Novo destino passa por validação no preview e de novo na confirmação sob locks. Preview não é reserva/autorização permanente.

Produtor: substituir conjunto explícito de clientes, mantendo pelo menos um vigente e exatamente um principal vigente (regra mínima proposta). B2B: exatamente um parceiro ativo gestor. Sem opção de remover último vínculo neste recorte. **Atribuição sem vínculo** exige identidade já coerente, nenhuma associação conflitante e aprovação da análise de constraints/guard; nunca converte papel.

**Aceite:** seleção FSF/inativo/excluído/forjado/legado incompatível negada; preview antigo/novo coerente com CAS; fechar/reabrir ou mudar busca não aceita resposta atrasada.

## 6. CAS, locks e concorrência

Reusar digest `platform_private.user_edit_f2_version(uuid)` e stamp como base, ampliando somente onde necessário após revisão: perfil inteiro, roles completos, todos links inclusive revogados, estados/propriedade antigos e novos e vigência efetiva. Digest opaco não autoriza. Destinos selecionados devem integrar fingerprint do preview ou ser CAS/validados novamente na confirmação; CAS só do alvo não congela elegibilidade do destino.

Live `cf_user_guards_v1.acquire_gate()` atualiza singleton `state.revision`; triggers em profiles/user_roles/user_clientes/partner_users tomam gate; `touch_related_profiles()` toca profiles de usuários relacionados; `advance_stamp()` avança updated_at monotonicamente. Preservar ordem do common: pré-autorização/gate da operação→singleton compartilhado NOWAIT→perfis ator/alvo ordenados→roles/associações→referências antigas/novas ordenadas→empresa/estado. Revalidar tudo após locks. Mapear também writers de referências que não tomam singleton; row locks/CAS de destino não são opcionais.

**Risco:** singleton global reduz throughput; writers legados podem tomar ordem inversa, provocar deadlock/contenção; expiração por tempo não escreve nem dispara trigger. Não substituir locks consistentes por BroadcastChannel.

**Aceite:** duas confirmações do mesmo CAS, somente uma vence; corrida assign/assign protege UNIQUE; destino desativado/mudança de owner/papel/validade/ator durante espera nega; falha a qualquer ponto desfaz associação+receipt+ledger. Sem auto-retry de escrita.

## 7. Idempotência, motivo e ledger imutável

Receipt único ator+tenant+UUID; hash cobre alvo, modo, CAS/stamp, conjuntos ordenados, principal/parceiro, motivo e preview relevante. Motivo obrigatório, validação local/servidor; limites do common (2–500) são referência existente, não nova regra instalada. Mesma chave/payload retorna resultado somente após reautorizar ator/tenant/alvo/destinos e conferir estado posterior; mesma chave/payload divergente rejeita. Resultado antigo não afirma estado novo.

**Não reutilizar `old_common/new_common` para fingir histórico de links.** Propor ledger privado de associação/receipt ou extensão explícita versionada do ledger atual, com old/new completos de associação, versão, operação, alvo, ator, empresa, motivo e resultado; definir escolha e migration no futuro candidato. Preservar quatro linhas comuns e imutabilidade existente. Sem acesso cliente a digest interno/ledger ou DML direto; audit read autorizado, se necessário, separado.

**Aceite:** replay após perda de Admin/mudança de tenant/readiness negado antes de receipt; hash divergente/CAS obsoleto; UPDATE/DELETE/TRUNCATE audit negados; commit comum não depende do gate novo.

## 8. Cliente/Produtor: revogação e principal

Proposta: revogar removidos preenchendo is_active=false, revoked_at/revoked_by e encerramento de validade compatível; manter fatos anteriores no ledger. Mantidos preservam access_level/assigned_by e demais campos. Novo par: inserir uma vez. Par histórico existente: reativação explícita auditada, mesma id por UNIQUE(user_id,cliente_id), não apagar passado nem usar upsert que adote corrida. Definir access_level para novo vínculo conforme contrato existente de provisionamento, sem elevar por UI.

**Achado live novo:** `public.sync_user_cliente_principal()` considera qualquer linha principal e elege mais antiga **sem filtrar revogação/vigência**; pode apontar profile.cliente_id para histórico. Não é vazamento confirmado do resolver canônico (que protege fallback), mas bloqueia consistência de troca. `has_active_user_cliente_access()` filtra is_active e datas, não `revoked_at`; revogar atomicamente is_active=false protege esse caminho usual, mas combinação inconsistente ativo+revogado precisa teste/correção focal. Revisar `enforce_cliente_id_for_produtor()` junto da ordem dos triggers antes de SQL.

**Aceite:** principal sempre vigente no estado final, profile.cliente_id sincronizado ao principal permitido, remoção do principal e reativação funcionam atomicamente; estados inconsistentes fechados. Nunca alterar acesso técnico/roles por este modo.

## 9. B2B gestor: associação atual e histórico

Preferência: **UPDATE transacional do partner_id da linha existente**, mantendo id/user_id/created_at/papel gestor; INSERT somente na atribuição inicial coerente sem linha. Sem DELETE+INSERT desnecessário e sem flags novas. Ledger registra A→B, mas dados de pedidos/financeiro permanecem em A. Validar destino com `b2b_commercial_context()`/ownership e guardas correlatos; perfil e org permanecem AR Bio, sem mudar `organizations.partner_account_id`.

Preservar `partner_orders`/itens/mensagens/anexos/termos/parcelas/recebíveis/financial_links/simulações/produção/fiscal, snapshots, authored_by/created_by e histórico de transações. Nenhum retarget de partner_id/cliente_id nesses fatos. Autoria passada não concede autorização residual. Mandatos `partner_user_clients`/`partner_technician_clients` e templates/receipts antigos devem permanecer históricos ou fechados pela coerência atual; não transferir carteiras ao novo parceiro.

**Aceite:** titular passa a ver somente histórico que pertença ao novo parceiro, mesmo com JWT antigo e IDs conhecidos do antigo; Admin proprietário continua lendo A. Históricos não mudam hash/contagem/owner; nenhum acesso técnico/financeiro adicional. Mandato residual, se desejado, exige projeto separado, não OR created_by.

## 10. Inventário live RLS e reconciliação das seis políticas

Enumeração própria: **47 funções com token direto** de partner_users/user_clientes em corpo; **196 funções candidatas transitivas** por nomes em corpos (overloads e falso positivo de texto incluídos); **118 políticas candidatas direto/um salto**, **177 políticas conservadoras transitivas** por substring. **8 políticas diretas atuais**: cinco partner_users em tabelas públicas, uma partner_users em Storage, uma user_clientes em campanhas e uma em Storage. Zero views com token direto. Contagens não são provas de acesso, nem todas chamadas semânticas; fechamento exige triagem por assinatura/corpo/ACL e composição de políticas, não somente grep.

As seis citadas historicamente foram reconciliadas live:

| Política | Definição atual / risco |
|---|---|
| `popt_select` / partner_order_payment_terms | Continua JOIN partner_users→partner_orders; também existe b2b_phase1_tenant_guard. |
| `pops_select` / partner_order_payment_schedule | Mesmo padrão e restritiva b2b_phase1_tenant_guard. |
| `ar_partner_select_own_b2b` / accounts_receivable | **Não é mais direta:** resolve partner via b2b_commercial_context. |
| `ari_partner_select_own_b2b` / accounts_receivable_installments | **Não é mais direta:** contexto comercial no recebível B2B. |
| `cpr_partner_select_own` / commercial_price_rules | **Não existe live com esse nome**; analisar resolver canônico/ledger publicado, não restaurar política histórica. |
| `pofl_partner_select_own` / partner_order_financial_links | Direta por user_id, sem papel nesse trecho; restritiva também exige pedido e parceiro visíveis. Não alegar bypass por permissiva isolada. |

Diretas adicionais atuais: `ptc_insert`/partner_technician_clients, `ptl_select_staff_or_partner`/production_timeline_events, `branding logo upload parceiro`/storage.objects. Troca física elimina a associação antiga desses EXISTS, mas ainda devem ser testados guards transitivos e caminhos privilegiados.

**Achado live relevante distinto do alerta descartado:** `campanhas_cliente_select` em **public.commercial_campaigns** (não tabela campanhas) faz JOIN user_clientes sem ativo/revogação/datas; três políticas permissivas e nenhuma restritiva nessa tabela na captura. Associação revogada mantida pode satisfazer o predicado, mas a subquery INVOKER também sofre RLS de commercial_campaign_clientes: sua única policy é Admin/Gestor Comercial. Portanto não está comprovada exposição efetiva ao Produtor; não abrir a filha para criar positivo artificial. V0 prepara fechamento preventivo preservando essa composição. Branding upload cliente filtra is_active/revoked_at/valid_until, **não valid_from**, segue fora do V0 mínimo.

**Aceite:** JWT do titular antigo nega toda leitura/escrita por caminhos residuais; snapshot de todas políticas irmãs e ACL/guards antes de propor correção mínima. Não alterar módulos além do necessário à segurança da associação.

## 11. RPCs e fechamento transitivo

**Confirmado correto live:** `get_cliente_ids_for_user` filtra is_active/revoked_at/valid_from/valid_until, protege fallback profiles.cliente_id com EXISTS vigente; MD5 `c80d5900692d960f649d0a9f7850fe2c`. Não reintroduzir alerta histórico falso. `get_cliente_id_for_user` também filtra vigente. `producer_commercial_client_scope` exige readiness, tenant, cliente ativo e resolver vigente.

`get_user_partner_id()` resolve associação física atual; `get_partner_papel(_user_id)` lê papel por parâmetro e não valida próprio UID no corpo (EXECUTE authenticated/service, anon fechado): risco de metadata por argumento arbitrário a triangular com callers, **não prova acesso aos pedidos**. `b2b_commercial_context()` exige role única, papel coerente, owner ativo, catálogo/empresa e legacy compatível; `b2b_commercial_own_orders()` filtra partner e owner atuais.

Famílias a fechar por assinatura/ACL: cliente/fazenda/talhão, solicitações/recomendações/visitas/checkin/arquivos, aplicação/evidências, entregas/termos/etiquetas, OS/onfarm/estoque, catálogo/preços/campanhas, pedidos/simulações/itens/mensagens, crédito/financeiro/recebíveis/fiscal, notificações/contexto, provisionamento/compensação e writers de vínculo. Nenhum grant/serviço legado bypassa revisão porque UI não monta ação.

**Aceite:** cada candidato recebe classificação read/write/helper/fixture/semântico-falso-positivo, caller, role, tenant e teste de antigo negado/novo permitido; não declarar inventário certificado só por contagem. Anexos A/B trazem reprodução integral da enumeração.

## 12. Leitores TS e Edges, inclusive casos expressos

| Arquivo/função | Achado / ação futura necessária |
|---|---|
| `usePortalCliente.ts:54–123` / load | Resolver correto + leitura user_clientes filtrada + cliente tenant ativo; recarga no foco, não revisão distribuída. |
| `ConsultorTecnico.tsx:305–327` | user_clientes is_active apenas; falta janela/revoked_at explícitos e key só usuário selecionado. Revisar leitor, sem liberar gestão técnica. |
| `list-portal-users/index.ts:39–145` | Ator/cliente tenant validados antes do serviço, mas leitura privilegiada de user_clientes sem filtros de vigência/revogação; lista históricos como atuais. Revisar também paginação e corrida autorização→leitura privilegiada. |
| `usePartnerUsers.ts:60–109,114–175` | Listas/property fence; classificação visual não autoriza; vincular/desvincular/mudar papel continuam bloqueados. |
| `UsuariosClientesB2B.tsx:45–53`, `TecnicosProdutores.tsx:31–38` | Leituras diretas da associação física + profiles; devem refletir A→B sem abrir técnico. |
| `partnerUserProfiles.ts` | user_id do link cruza profiles.user_id, não profiles.id. |
| `useMyPartner.ts:9–59` | Contexto/projeção canônicos com receiver preservado; queryKey depende de fence sem revisão do link. |
| `useMyCommercialOrders.ts:16–39`, `useCommercial.ts:29–39` | Pedidos próprios guardados, histórico com partnerId; revisar todos filhos e parâmetros. |
| `useB2BFinancialScope.ts:5–38` | Keys escopadas/fence, mas escopo mesmo tipo não muda sozinho. |
| `fase-e-runtime-harness/index.ts:90–93,175–183` | Writer/cleanup de fixtures privilegiado, não negócio; não executado. |

Inventário direto em runtime pesquisado abrange os seis arquivos TS de leitura acima e Edge list-portal-users; harness separado. Outros consumidores são transitivos por hooks/RPC; reexecutar buscas incluindo nomes/buckets/helpers e diferenças de deploy antes de habilitar.

**Aceite:** leitor privilegiado não usa serviço como autorização; revalidar caller/resource próximo de resultado e não montar lista histórica como membership atual. Deployment das Edges e equivalência de fonte ainda pendentes.

## 13. Storage, arquivos emitidos e revogação realista

Live buckets privados: aplicacao-evidencias, clientes-docs, consultor-arquivos, entrega-documentos, financial-docs, financial-receipts, financial-reports, fiscal-certificates, fiscal-xml, visitas-pdf; **logos público**. `order-attachments` referenciado em `useCommercial.ts:416` não está na lista live capturada: divergência a investigar, não criar bucket nesta fase.

Policies incluem restritivas storage1_read/insert/update/delete→cores aplicação/consultor/entrega, d51_5_clientes_docs e contenção logo B2B. Não tratar d516 permissiva isolada como vazamento: considerar interseção efetiva. Logo público já é material público, não prometer sua revogação confidencial.

Emissores de URL: `useSignedUrls.ts:35` e `useCommercial.ts:416` (3600s); `generate-financial-report/index.ts:211` e `generate-financial-receipt/index.ts:118` (3600s); `fiscal-xml-engine/index.ts:311` (120s); `entrega-termo-pdf/index.ts:201` (TTL por constante, recapturar). Revisar também downloads diretos, paths, Blob/objectURL, DOM/open em atraso e autorizações dos emissores service-role.

**Bloqueio:** membership nova não invalida URL assinada previamente emitida, download já concluído nem resposta já autorizada sob snapshot anterior. Para exigência de fechamento imediato, priorizar caminho autenticado de download com autorização corrente quando disponível; assinatura privilegiada sensível precisa desenho revogável revisado (Edge autenticada existente adaptada, não servidor Node). TTL menor apenas limita janela; NÃO cumpre revogação instantânea. Se não houver solução para uma família, gate dessa troca fica fechado até solução ou aceitação explícita da janela pelo proprietário; não assumir aceite.

**Aceite:** nova assinatura/download autenticado do antigo negados após commit, URL anterior testada e limitação registrada; limpar referências/Blob/DOM/cache controlados. É impossível apagar remotamente bytes salvos/screenshots no dispositivo; retirar dados residuais refere-se ao app controlado.

## 14. Revisão de autorização existente antes de mecanismo novo

Live: `cf_user_guards_v1.state.revision` e `cf_audit_users_20260922.guard_state.revision` existem; global revision é guarda transacional, **não protocolo de revisão do titular**. `touch_related_profiles`+`advance_stamp` já avançam profiles.updated_at para mudanças em links/roles. Não foram encontradas colunas per-user authz_revision por inventário de nomes; isso não prova inexistência de qualquer mecanismo equivalente. Nenhuma de profiles/user_roles/user_clientes/partner_users consta na publicação realtime capturada.

Frontend: `useAuth.tsx:165–171,291–314` refresh e roles_updated local; `portalBroadcast.ts:18–45` BroadcastChannel/storage, mesma origem apenas; `usePortalCliente` foco; defaults QueryClient `App.tsx:205–213` stale5min/gc10min, refetch foco/mount desativados. Realtime de domínios existe, não acompanhamento canônico de membership do titular. Não encontrado persister global nas buscas, mas preferências em local/sessionStorage existem.

**Fase mínima proposta:** reusar stamp existente como marcador de mudança persistida, com leitura self-only autorizada do próprio contexto e fingerprint server-side vigente (links/estado/propriedade/janelas) ou equivalente já disponível após auditoria. Não expor singleton global nem versões de terceiros; CAS admin não é token público do titular. Stamp sozinho não detecta expiração/desativação de cliente/parceiro sem toque em profile: comparar fingerprint de autorização corrente também. Só criar revisão per-user nova se essa composição demonstrar insuficiência.

**Aceite:** leitor próprio retorna somente scope mínimo/ready/revisão, autoriza em toda chamada e fecha em erro; mapa de writers e expiração coberto. Sem Realtime novo até provar necessidade/publicação/RLS/custo.

## 15. Cache e sessões/dispositivos distintos

`useStorageAccessScope.ts:5–25` captura ready/UID/org/roles/resource + epoch; **não vínculo/revisão**. A→B mesmo tipo mantém esses valores. `useMyPartner`/financeiro removem keys de scope velho, mas não detectam mudança sem novo scope. `activePortalContext.ts:17–43`, seleção Map/localStorage de `usePortalCliente`, drafts/URLs/filas e queries dependentes precisam inventário e invalidação.

Proposta para titular: monitor self-only compartilhado, polling com fallback foco/visibility/online e antes de ações sensíveis, sem depender de Admin broadcast. Intervalo **proposto10s** para aba visível e teto **proposto15s** de lease de exibição; confirmar custo/viabilidade na implementação. Detectar revisão ou lease/erro/offline→bloquear dados protegidos imediatamente na lógica do app, avançar geração, cancelar/remover queries dependentes, limpar seleção/preferência/DOM/URLs temporárias e estado de páginas; recarregar contexto antes de renderizar dados novos. Remover, não apenas invalidate (que deixa dado antigo visível). Respostas/erros/callbacks antigos não repovoam cache nem abrem arquivo. Sem limpar draft de terceiros ou logout/senhas à força.

Incluir revisão no fence compartilhado/scopes/keys do titular; revisar cada leitor com state próprio, notificações, histórico, detalhe por URL e filas antes de liberar. Poll/realtime são detecção/apresentação: servidor fecha novos acessos a A no commit independentemente do dispositivo receber evento. Realtime opcional é só aviso, com polling obrigatório como fallback. ABA A→B→A também muda geração; comparação só de partnerId não basta.

**Aceite:** duas origens/dispositivos, aba continuamente aberta sem foco, realtime indisponível, offline/retomada, timer throttled, requests atrasados e ABA. Sem promessa de apagamento instantâneo de dispositivo offline/suspenso; na retomada, revalidar **antes** de reexibir. Bound de retirada online proposto deve ser testado, não reportado PASS agora.

## 16. Fase mínima implementável, testes e gates

Sequência proposta, **não iniciada**:

1. **V0 — fechamento:** finalizar triagem live por assinatura/caminho e emissor, resolver campanha/principal/Consultor/list-portal-users/Storage; preparar candidatos mínimos fora da pasta automática e gates de associação separados, sem reaplicar common.
2. **V1 — fundação compartilhada:** self-revisão usando mecanismo existente, limpeza/fencing multidispositivo e seletor/preview paginado no diálogo existente. Transporte/SQL mockados, gate false, nenhum usuário real alterado.
3. **V2 — Produtor primeiro:** associação/revogação/principal sob CAS/locks/receipt/ledger com common preservado. Candidato fechado, auditoria técnica e testes SQL/Auth completos antes de gate/piloto.
4. **V3 — B2B gestor:** UPDATE da linha única/assign coerente, contexto/history/financeiro/Storage/carteiras antigos fechados; gate próprio, sem técnico/conversões. Se essa família não fechar URLs/resíduos, permanece fechada independentemente de V2.

Matriz mínima (cada linha exige teste concreto, não source-string/snapshot):

| Grupo | Positivos / negativos obrigatórios |
|---|---|
| RBAC/tenant | AdminAR alvoAR; AdminFSF/Consultor/Financeiro/B2B/Produtor/Superadmin e AR→FSF negados conforme contrato tenant-admin; actor NULL/inativo/não ready, org inativa, target superadmin negados. |
| Tipo | Produtor permanece Produtor; B2B gestor permanece gestor; técnico, mistos, papel inválido e conversões negados. |
| Seleção | Próprio ativo aceito; irmão FSF/inativo/deleted/inexistente/cursor forjado e owner alterado durante confirmação negados. |
| Produtor | Adicionar/remover mantendo mínimo/principal; revogação, reativação UNIQUE, futuro/expirado, principal removido, fallback e campanhas antigos negados. |
| B2B | A→B, assign sem linha coerente; dupla linha/upsert concorrente negados; pedidos/financeiro/templates/mensagens/client mandates A negados e B conforme RBAC; histórico de A intocado. |
| CAS/replay | Mudança perfil/roles/links/estados/tempo; duas requisições, ordem de locks/contenção; chave igual/diferente; ator revogado no replay; timeout com commit→reload, nunca retry automático. |
| UI RTL | Loading→token, preview old/new, formulário editado e refetch, motivo, doubleclick, fechar/reabrir mesmo/outro alvo, ator/tenant/generation, ABA, erros/sucesso tardios, ambiguidade. |
| Sessão | Publicado/preview e dois dispositivos, JWT antigo, aba aberta/foco/offline/online/sem realtime, retirada residual e resposta em voo; URL conhecida A não autoriza consulta. |
| Storage | Cada bucket/emissor/caminho antigo/novo, signedURL já emitida, authenticated download, objectURL/open tardio; público não confundido com privado. |
| Ledger | Uma linha por operação confirmada, motivo/autor/old/new, imutabilidade; rollback transacional de falha sem receipt órfão. |

Preservar testes existentes `externalCommonUserEditForm`, `userLinksVersion`, `portalCliente.session`, `myPartner.session`, `b2bFinancial.session`, `storageAccessScope` e branch interna. Local RTL/SQL descartável não certifica JWT/RLS live; BEGIN/ROLLBACK não substitui browser real. Testes reais futuros só com fixtures/contas e mudanças especificamente autorizadas, restauração CAS/ledger; nenhum teste de troca real autorizado neste plano.

**Aceite:** revisão independente do candidato + typecheck/lint novo/build/scanner/testes focados + claims/RLS/Edges/Storage + UI real Admin e titular nos cenários acima antes da abertura/publicação de cada fase.

## 17. Rollback, entregáveis e pendências reais

Rollback futuro: fechar somente gate de associações/UI, manter dados comuns aprovado, pré-autorização, guards/readers corrigidos e todo ledger. Não restaurar políticas com vazamento nem candidata antiga. Reverter A→B por **nova operação auditada B→A**, CAS atual, elegibilidade novamente provada e novo motivo/receipt; se A inválido, não restaurar automaticamente. Produtor reverte conjunto mediante nova revogação/reativação auditada, sem DELETE de histórico. Nunca apagar pedidos, registros comuns ou ledger e nunca retargetear financeiro.

Entregáveis desta rodada: este plano com17itens, delta do relatório histórico, roadmap e memória de restrições. **Sem decisão estrutural adotada nem mudança runtime**, portanto nenhum módulo/AGENTS arquitetural novo. Arquivo candidato antigo permanece histórico, não operacional.

**QA própria documental:**70/70 Vitest PASS em6arquivos existentes (27diálogo,7CAS,9portalCliente,7myPartner,12financeiro,8storageScope), executados22:57:59UTC; transporte/identidade simulados, não troca real. Scanner global sem valor secreto real e diff-checkPASS. Build automáticoOK22:58:12UTC. Lint/typecheck dedicados não reexecutados (nenhum TS/runtime alterado); baseline independente ddd5d119 informa ambos0. Nenhuma falsa certificação de teste real da futura UI de associações. Comando: `bun run test -- src/test/config/externalCommonUserEditForm.test.tsx src/test/config/userLinksVersion.test.ts src/test/config/portalCliente.session.test.tsx src/test/config/myPartner.session.test.tsx src/test/financeiro/b2bFinancial.session.test.tsx src/test/equipe-tecnica/storageAccessScope.test.tsx`.

Pendências reais: triagem semântica de196/177candidatos e SQL dinâmico/deploys; fechamento das lacunas específicas; protocolo self-revisão e limpeza same-identity; política de URLs anteriores/limitação offline; desenho final de ledger de links/reativação/principal; candidatos e execução concorrente/JWT/Storage/browser; gates e piloto futuros. Full gestão de vínculos NÃO entregue nem certificada. Achados receiver de `DocumentosPanel.tsx` e `financeiro/relatorios/ReportShell.tsx` continuam fora do delta.

## Anexo A — inventário direto de funções live (47 assinaturas)

Enumeradas por token em `prosrc`, incluindo writers/fixtures/guards; não são47 endpoints autorizados:

```text
cf_audit_users_20260922.touch_related_profiles()
cf_user_guards_v1.acquire_gate()
cf_user_guards_v1.touch_related_profiles()
platform_private.b2b_actor_scope(uuid)
platform_private.b2b_assignment_identity_coherent(uuid,uuid,uuid)
platform_private.b2b_commercial_context()
platform_private.b2b_direct_partner_row_allowed()
platform_private.external_provisioning_scope(uuid,app_role,uuid,uuid[],uuid)
platform_private.tenant_admin_user_links(uuid[])
platform_private.tenant_smtp_lane_source_reason(uuid,uuid,uuid,uuid)
platform_private.user_edit_f2_common(uuid,timestamptz,jsonb,app_role[],uuid[],uuid,uuid)
platform_private.user_edit_f2_version(uuid)
public._portal_cliente_user_has_link(uuid,uuid)
public.admin_provision_user_profile_v1(uuid,text,text,app_role[],uuid[],uuid,uuid,text,text,text,text,text,text)
public.approve_partner_order(uuid,text,date)
public.b2b_complete_provisioning_compensation(uuid,uuid,uuid)
public.b2b_finish_provisioning(uuid,uuid,uuid)
public.can_user_access_cliente(uuid,uuid)
public.can_user_access_estoque_embalagem(uuid)
public.can_user_access_produto_etiqueta(uuid)
public.create_technical_visit_secure(uuid,uuid,uuid,uuid,timestamptz,tipo_visita,urgencia_consultor,text,uuid)
public.enforce_cliente_id_for_produtor()
public.fn_onfarm_scope_cliente(uuid)
public.get_b2b_user_role_for_partner(uuid,uuid)
public.get_cliente_id_for_user(uuid)
public.get_cliente_ids_for_user(uuid)
public.get_partner_papel(uuid)
public.get_user_partner_id()
public.has_active_user_cliente_access(uuid,uuid,text[])
public.is_valid_b2b_partner_user(uuid,uuid)
public.notify_managers_on_simulation_sent()
public.pode_acessar_recomendacao(uuid,uuid)
public.producer_request_mutation_guard()
public.recalc_partner_order_production(uuid)
public.reject_partner_order(uuid,text)
public.request_partner_order_items(uuid,text)
public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)
public.rpc_b2b_list_selectable_payment_plans()
public.rpc_portal_partner_financial(uuid)
public.rpc_portal_partner_financial()
public.save_client_portal_branding(uuid,text,text,text)
public.save_partner_portal_branding(uuid,text,text,text)
public.set_partner_order_delivery_date(uuid,date)
public.set_partner_user_papel(uuid,text)
public.sync_user_cliente_principal()
public.technical_client_link(uuid,uuid,text[])
public.tenant_admin_list_users(text,app_role,boolean,integer,integer)
```

## Anexo B — reprodução read-only do universo e fechamento

Executar exclusivamente após comprovar ref canônico. Consulta abaixo **não aplica DDL**. Substring conservadora inclui falsos positivos; assinatura, corpo e ACL são indispensáveis à triagem. Captura com regexp de palavra encontrou196funções; versão conservadora por substring pode ampliar universo. Duas tentativas de closure regexp+policies excederam timeout do serviço nesta rodada; variante strpos completou e enumerou177políticas. Timeout de SELECT não produziu escrita; não usar limite arbitrário para ocultar candidatos.

```sql
WITH RECURSIVE f AS MATERIALIZED (
 SELECT p.oid,n.nspname,p.proname,p.prosrc,
        pg_get_function_identity_arguments(p.oid) AS args
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind='f' AND n.nspname NOT IN ('pg_catalog','information_schema')
), edges AS MATERIALIZED (
 SELECT a.oid caller,b.oid callee FROM f a JOIN f b
 ON a.oid<>b.oid AND strpos(a.prosrc,b.proname)>0
), reached(oid) AS (
 SELECT oid FROM f WHERE strpos(prosrc,'partner_users')>0
                       OR strpos(prosrc,'user_clientes')>0
 UNION SELECT e.caller FROM edges e JOIN reached r ON r.oid=e.callee
)
SELECT f.nspname,f.proname,f.args,pg_get_functiondef(f.oid) AS definition
FROM reached JOIN f USING(oid) ORDER BY f.nspname,f.proname,f.args;
```

Para inventário de políticas, substituir o SELECT final por SELECT de `pg_policies` com EXISTS sobre reached/f usando strpos(qual||with_check,proname)>0 ou tokens diretos. Para cada match capturar **todas as políticas irmãs**, permissive/restrictive, grants, RLS/forceRLS, EXECUTE/owner/search_path e caminhos service-role. Mapear views/materialized views/SQL dinâmico por corpo além dos tokens. A enumeração de função não prova chamada real em comentários/nomes homônimos e não encontra SQL montado por fragmentos: esses casos permanecem triagem explícita.

Famílias completas da enumeração conservadora de políticas: accounts_receivable/parcelas, alertas, aplicacao_emails/evidencias/vinculos/aplicacoes, aprovacoes, arquivos, cliente_contatos/documentos/clientes, clima, campanhas/partners/products, preferencias comunicação, CQ, entregas e todos filhos, envase, estoque e movimentações, fazendas, financial_documents/fiscal_invoices, lotes, monitoramento/notificacoes, OS/onfarm/status/os_faturamento, partner_accounts/catalog_access/clientes/metrics/orders e todos filhos/templates/preços/simulações/carteiras, portal_notificacoes/solicitacoes, production_planning/timeline, etiquetas/eventos/programacao, recomendacao_comentarios/registros_consultor e filhos/PDF/status, solicitacoes_atribuicoes/timeline, talhoes/safras, technical_visit_assignments e visitas/diagnosticos/checkin/logs, **storage.objects** (entrega-documentos/aplicacao/branding/clientes-docs/storage1 e contenções B2B). Todas são escopo de prova de revogação, não autorização para reabrir seus módulos.