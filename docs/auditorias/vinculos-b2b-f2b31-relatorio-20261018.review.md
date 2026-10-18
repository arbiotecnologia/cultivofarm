# Cultivo Farm — F2-B3.1 — contrato em etapas — 18/10/2026

## Decisão executiva
**Revisão B3.2: instalação NO-GO por backup recuperável não comprovado e riscos adicionais de rowshape/dependências automáticas no rollback. Adiar metadata é recomendado. Ver `vinculos-b2b-f2b32-relatorio-20261018.review.md`; o PASS local abaixo permanece histórico, não autoriza aplicar os candidatos.**

**PASS preparação e compatibilidade estrutural local. GO somente para revisão externa do estágio neutro B3.2; instalação não autorizada neste turno. NO-GO para origem confiável, cleanup, cutover ou certificação RLS.**

Menor mudança: duas colunas nullable em PTC, **sem default, backfill, CHECK, FK, índice, guard novo, mudança de função/policy/ACL ou uso em autorização**. São campos NÃO CONFIÁVEIS; o cliente continua podendo preenchê-los sob os grants atuais. Não chamar `puc` de projeção comprovada nesta etapa. Nenhuma tela muda para RPC fechada. O candidato B3 anterior com FK RESTRICT não é promovido; este pacote o substitui apenas no recorte de staging.

Nenhum DDL/DML executado em produção/homolog pelo agente, nenhuma publicação, nenhuma alteração de dados/Auth. Supabase canônico confirmado em `supabase/config.toml:1`, binding informado `swzpzcwiasxmjutrmvkm`; literal SQL e `current_database()` não constituem confirmação independente de destino. Commit `0d24f681d3168000bf1bba2c99ff942d828b6543` revisado: sete arquivos documentais/testes/roadmap, sem runtime implantado.

## 1. Baseline read-only próprio
Leituras de catálogo e contagens entre 18:24 e 18:26 UTC corroboram auditor: **PUC=0, PTC=0**, 0 colunas `grant_origin/source_puc_id`, 0 funções/policies lexicalmente consumidoras desses nomes; nenhuma FK recebida pelas duas tabelas. A ausência lexical não prova ausência de SQL dinâmico ou integração externa.

PTC: PK id, UNIQUE `(partner_id,technician_user_id,cliente_id)`, FKs parceiro/cliente **ON DELETE CASCADE**; único trigger `trg_ptc_updated_at`, BEFORE UPDATE. PUC: PK id, UNIQUE `(partner_id,user_id,cliente_id)`, FKs parceiro/cliente CASCADE e CHECK assignment_type; `trg_puc_updated` BEFORE UPDATE, `trg_validate_puc` BEFORE INSERT/UPDATE e `trg_sync_puc_to_ptc` AFTER INSERT/UPDATE. Nenhum trigger DELETE de histórico/cleanup.

Ambas RLS=true/FORCE=false; ACL existente postgres/anon/authenticated/service_role CRUD/TRUNCATE/REFERENCES/TRIGGER (catálogo, **não recomendação de ampliar acesso**); policies controlam chamadas comuns. Containment PUC `bf02_assignment_contract_containment`, RESTRICTIVE ALL para anon/authenticated, USING/WITH CHECK false. Não foi aberta.

Manifesto determinístico de **59 entradas** (14 funções, 30 policies na união do recorte, 4 triggers, 9 constraints, 2 tabelas): MD5 **`97e96aa537418f63d7a9b32574dbf7cc`**. Inclui bodies/owner/ACL de funções, expressões/roles/comando de policies, definição/estado de triggers, constraints, RLS/ACL tabelas. A consulta inicialmente falhou por concatenação `text || "char"`; cast explícito `tgenabled::text` corrigiu somente o SELECT. Digest é detecção de drift, não assinatura de segurança. Colunas/defaults/índices fora do manifesto exigem revisão externa separada. Repetir preflight e confirmar zero linhas sob locks; qualquer drift/linha nova aborta, não atualizar hash cegamente.

## 2. Assinaturas, escopo e escritores
| Consumidor | Escopo atual/evidência | Efeito desta etapa |
|---|---|---|
| `TecnicosProdutores.tsx:60–110` | SELECT, INSERT e UPDATE direto PTC; parceiro de useMyPartner, alvo técnico; invalidação b2b-tecnicos-produtores | Preservado; código não prova autorização JWT real |
| `sync_puc_to_ptc_fn()` | DEFINER postgres, search_path public, EXECUTE postgres/service_role; AFTER PUC I/U | Corpo exato preservado; NÃO marca origem |
| `validate_partner_user_client_fn()` | DEFINER postgres/public, EXECUTE postgres/service_role; valida elegibilidade NEW.user_id e carteira ativa, não contrato de ator | Preservado; cleanup de alvo inelegível continua gap |
| `assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text)` | DEFINER path vazio, postgres/service_role; autenticação/tenant e erro B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE | Fechado; não substituir escritor UI por ele |
| `unassign_b2b_user_client_secure(uuid,uuid,text)` | Mesmo contrato fechado | Não libera revoke/cleanup |
| `get_b2b_partner_clients_for_assignment_secure(text)` | Contrato fechado, postgres/service_role | Sem abertura |
| `UsuariosClientesB2B.tsx:114–133` | Chama assign/unassign existentes | Sem mudança |

### Leitores e autorizadores vivos
| Assinatura | Contrato atual / próxima revisão |
|---|---|
| `can_user_access_cliente(uuid)` | auth.uid, técnico PTC ativo + parceiro escalar; gestor PTC ou partner_clients; ramos internos amplos. Metadata ignorada |
| `can_user_access_cliente(uuid,uuid)` | Elegibilidade de terceiro por papel; técnico PUC OR PTC ativo, gestor partner_users direto; sem assumir parâmetro como autorização de ator |
| `get_b2b_technician_clients_secure(uuid,uuid)` | Técnico próprio/parceiro; gestor parceiro; admin/comercial ramos amplos; agregado simulação por cliente sem parceiro no agregado |
| `get_b2b_technician_client_detail_secure(uuid)` | PTC ativo em técnico/gestor; admin/comercial ramos amplos; agregados por cliente |
| `get_b2b_user_clients_secure(uuid,text)` | Contrato interno comercial, h15 organization, owner/cliente/identidade coerentes; NÃO equivalente à carteira técnica UI |
| `get_b2b_user_client_detail_secure(uuid,text)` | scopes meus_produtores/equipe/admin; PUC/partner_clients; técnico ramo sem parceiro explícito, subqueries LIMIT 1 |
| `get_b2b_user_client_simulations_secure(uuid)` | PUC ativo; técnico simulações próprias/parceiro, gestor parceiro; admin ramo amplo |
| `platform_private.b2b_save_technical_simulation(jsonb)` | Escritor simulação; PUC OR PTC ativo e gates de fase/feature; não escritor de grants |
| `platform_private.b2b_commercial_context()` | Ator pronto, papel exclusivo, único partner_users, parceiro ativo/owner, feature; modos commercial_owner e legacy_partner_tenant |

Essas funções são DEFINER postgres; EXECUTE authenticated/service_role/postgres, exceto três RPCs fechadas, sync/validator (somente postgres/service_role). Path public nos leitores antigos; path vazio no contexto, writer privado e get_b2b_user_clients. MD5 individuais mantidos do relatório B3, reconfirmados pelo catálogo: sync `4dc955897950bf70ee8e1072bbae1ff2`; validator `dcafec82ec7147ab67ce17ab934d3619`; overload cliente 1 `4c2eaf7ab10e204e7ad57d41cb418554`; overload 2 `c610786fc9f6d6a44453b9e63c91e974`; contexto `02158d4204dea67308558f649113ba6d`.

Hooks/telas: useMyPartner valida contexto retornado pelo servidor (`:22–43`); MeusProdutoresTecnico `:32–42`, DashboardTecnico `:20–30`, DetalheProdutorTecnico `:39–61` usam carteira/RPCs, não novo grant. Rotas/telas preservadas. Busca estática anterior e investigação nesta rodada: nenhum escritor literal PUC/PTC nas Edges TS atuais; indiretos via RPC e integrações externas não certificados. Backfill histórico PTC→PUC em migration `20260702145433...:257–281` impede inferência pela chave, assigned_by ou datas.

## 3. As 29 policies atuais, inventário próprio
Nenhuma alterada; expressão íntegra participa do digest, não teste comportamental RLS.

1. commercial_campaign_partners.campanhas_partners_self
2. commercial_campaign_products.campanhas_products_partner
3. commercial_campaigns.campanhas_partner_select
4. partner_catalog_access_logs.pcal_select
5. partner_clients.pc_select
6. partner_engagement_metrics.pem_self
7. partner_order_idempotency.poi_select_scoped
8. partner_order_items.partner_order_items_select
9. partner_order_message_attachments.poma_insert
10. partner_order_message_attachments.poma_select
11. partner_order_messages.msg_partner_insert
12. partner_order_messages.msg_partner_select
13. partner_order_templates.templates_partner_delete
14. partner_order_templates.templates_partner_insert
15. partner_order_templates.templates_partner_select
16. partner_order_templates.templates_partner_update
17. partner_orders.partner_orders_select
18. partner_product_prices.ppp_self_select
19. partner_simulation_items.partner_simulation_items_select
20. partner_simulations.partner_simulations_insert
21. partner_simulations.partner_simulations_select
22. partner_simulations.partner_simulations_update
23. partner_technician_clients.ptc_insert
24. partner_technician_clients.ptc_select
25. partner_technician_clients.ptc_update
26. partner_user_clients.puc_insert
27. partner_user_clients.puc_select
28. partner_user_clients.puc_update
29. production_planning.d51_5_production_planning_tenant_guard

ptc_insert consulta pertencimento do alvo partner_users; ptc_update autoriza ator administrador/comercial ou gestor no parceiro escalar, sem equivalente de validator PUC. ptc_select técnico exige próprio alvo e active. Papel do alvo não valida ator. Containment PUC é a 30ª policy na união do manifesto. As políticas de simulação/partner_clients aceitam caminhos PUC/PTC existentes. Hardenings de helpers escalares/revoked_at continuam revisão separada, não herdaram PASS deste pacote.

## 4. Guard BEFORE PTC isolado: decisão NO-GO
O sync existente entra como DEFINER postgres e faz UPSERT sem source. Um BEFORE PTC recebe NEW/OLD e profundidade de trigger, não recibo imutável da operação original. `pg_trigger_depth`, current_user, role, assigned_by, chave semelhante, GUC ou claims enviados pelo cliente NÃO provam ator nem source. current_user pode separar parte do caminho comum, mas owner/serviço e outros DEFINER podem escrever; não prova que veio deste PUC. Não usar isso como autorização.

É possível no futuro proteger colunas contra alterações comuns e derivar metadata mediante caminho servidor coordenado **com alteração do sync existente e contrato de operação comprovado**. Não está demonstrado exclusivamente por novo BEFORE sem mudar produtores. Guard que rejeita todo PTC direto quebra UI; guard que rotula toda operação postgres como projetada falsifica origem; guard que busca PUC pela chave converte direct/unknown indevidamente. Nenhum desses foi preparado como release.

## 5. Contrato futuro de grant/revoke e limpeza
PUC continua direção canônica final proposta, PTC compatibilidade até cutover aprovado; não duas fontes permanentes nem novo modelo. Writer direto atual fica até replacement realmente liberado. **Metadata deste estágio nunca identifica linha projetada confiável.**

Contrato futuro exigido:
- Ator autenticado/pronto, tenant/parceiro/cliente e poder de gestão provados no servidor antes/depois locks; alvo terceiro permitido somente se elegível, sem target=actor universal.
- Grant PUC e projeção PTC com source imutável, mesmo parceiro/alvo/cliente e mesma operação autorizada; source inclui identidade/versionamento/receipt suficiente para distinguir exclusão/recriação de PUC, não apenas UUID enviado.
- direct/unknown na chave: abortar transação e exigir reconciliação auditada; nunca converter/sobrescrever/desativar pelo sync. Projected só atualiza/desativa com source comprovada e estável.
- Cleanup monotônico active→false depende da autoridade sobre relação original, NÃO da elegibilidade atual do alvo; validator atual necessita recorte autorizado, não bypass.
- Revogar papel/partner_users/perfil não aciona sync atual. Revogação efetiva exige coordenação ou readers fail-closed imediatamente após commit; locks ordenados, CAS/version/receipt/idempotência comuns. Não revogar outros vínculos/papéis nem transferir carteira.
- Histórico grant/revoke: preservar actor, target, tenant/contexto, source/version, motivo e antes/depois usando trilha existente comprovada. Não tratar campos editáveis como audit append-only. Sem backfill presumido de legado futuro; hoje 0/0 não dispensa nova contagem.

**Gap reproduzido, não corrigido:** sync atual UPSERT desativa/sobrescreve PTC direct/unknown na mesma chave ao receber PUC técnico active=false. Metadata neutra não muda isso. Containment de escrita comum PUC permanece fechado, mas caminhos privilegiados continuam exigindo cautela; staging NÃO autoriza executá-los.

## 6. DELETE pai, histórico e FKs
RESTRICT do candidato anterior pode bloquear DELETE PUC isolado e interagir com cascades dos pais; portanto retirado deste staging. **Nenhuma FK PTC→PUC inicialmente.** Exclusão PUC não desativa/apaga PTC nesta etapa e pode deixar source candidata órfã — permitido somente porque não confiável e ignorada. Exclusão de parceiro/cliente segue cascades existentes e pode remover ambas carteiras; metadata não conserva histórico nem autoriza apagar pais reais. Local executa DELETE e ROLLBACK somente em fixtures sintéticas.

Alternativas futuras: (a) arquivamento/inativação auditada, preferida, com evidência histórica existente; (b) FK SET NULL preserva PTC porém perde source se não houver snapshot/receipt histórico e deve nunca converter a direct; (c) CASCADE PUC→PTC apaga projeção/histórico e não é aceitável sem contrato específico; (d) RESTRICT somente após audit de todos deletes/cascades e retirada legítima da fonte. Não mudar FKs de pais por conveniência. Estabilidade da source e efeitos ON DELETE pertencem à fase server-owned, não ao staging.

## 7. Tenant/legado e impactos
Preservar contexto `commercial_owner` quando org=owner com checks existentes, e `legacy_partner_tenant` quando org.partner_account_id=parceiro e visibility/entitlement/ator pronto confirmados. Não exigir owner=profile.organization_id universal, nem inferir mandato entre tenants. Origem/source não autorizam tenant.

Cliente/documentos: can_user_access_arquivo→overload cliente 1; Storage cliente_storage_object_permitted combina h15/path e autorização de cliente. Não mudaram; metadata não fecha acesso residual. Readers/RPCs antigos com ramos internos amplos/agregado por cliente são riscos pré-existentes a recortar, não exploração comprovada nem motivo para bloquear teste estrutural independente. Pedidos/financeiro/fiscal mantêm vínculos/snapshots e técnico sem finanças; nenhum transferido.

Cache/URL: invalidações UI existentes não garantem revogação servidor; epoch/fencing/identity/tenant e reload/foco/dois dispositivos precisam provas futuras. URL assinada pode sobreviver TTL, conteúdo já obtido não é recolhível. Sem login/logout/JWT/RLS/Storage real nesta rodada.

## 8. Pacote e instalação em etapas
Arquivos em `docs/auditorias`, fora de supabase/migrations:
- `vinculos-b2b-f2b31-preflight-readonly-20261018.sql`: manifesto, contagens, colunas, FKs recebidas, 29 policies.
- `vinculos-b2b-f2b31-metadata-neutra-candidato-20261018.sql`: transação, lock_timeout=3s/statement_timeout=30s, locks nas duas tabelas, aprovação externa por dois literais originalmente NULL, manifesto exato antes/depois, zero linhas e zero metadata consumers, duas colunas/comentários somente.
- `vinculos-b2b-f2b31-rollback-20261018.sql`: aprovação independente, digest antes/depois, tipos/defaults, recusa qualquer metadata preenchida, DROP COLUMN RESTRICT sem CASCADE. Não apagar metadata para satisfazer gate. Dependências vistas bloqueiam, mas SQL dinâmico exige auditoria externa. Pós-consumo/cutover precisa forward-fix ou compensação, não rollback simples.
- Harness `scripts/tests/b2b-f2b31-neutral-local.py` e Vitest `src/test/saas/b2b-f2b31-neutral-postgres.test.ts`.

Os dois literais de aprovação não são mecanismo de segurança nem comprovam endpoint: auditor precisa primeiro comprovar destino no painel/cliente privilegiado, autorização específica/registro, backup schema+dados seguro e revisão de deployments/integradores fora do checkout. Arquivos originais recusam execução; cópia revisada só muda atestação, nunca relaxa digest. Sem auto-retry de DDL/mutation. Após instalar externamente, reauditar zero linhas/metadados, grants/policies/bodies/triggers e acesso legítimo A/B; não anunciar revogação resolvida.

Fases propostas:
1. **B3.1 entregue:** auditoria, staging preparado e testes locais.
2. **B3.2 exclusivamente neutra:** revisão independente/aceite de metadata não confiável, backup, preflight/locks, instalação externa autorizada e post-audit; nenhuma mudança funcional/grants.
3. **B3.3 origem confiável:** contrato ator/receipt/source e escritores coordenados existentes, collision guard, validator cleanup e revogação; sem abrir PUC por antecipação.
4. **B3.4 prova real:** JWT/RLS Admin A/B, parceiro A/B, técnico, alvo distinto, commercial_owner/legacy, Storage/doc/cache, concorrência e manutenção legítima.
5. **Cutover posterior:** migrar writer PTC direto somente para RPC efetivamente autorizada e disponível; PUC única, PTC deixa de autorizar após equivalência provada. Não executar nesta fase.

## 9. Evidências reais de testes e limites
PostgreSQL descartável local com tabelas sintéticas e `has_role` stub false apenas para resolver overload do **body exato sync**: **22 checks estruturais**. Não replica guards/RLS/Auth/tenant de produção e não constitui mock de segurança aprovado. Statements locais transacionais/rollback verificam diferenças após casos; recursos removidos ao final.

Cobertura: preflight SELECT; gate recusa; drift recusa; DDL rollback; instalação/rollback dos arquivos COMPLETOS com hash/contagem exclusivamente sintéticos; tipos/defaults/FKs inalterados; repetição; INSERT/toggle direto sob role local; falsificação metadata explicitamente aceita e não interpretada; recusa perda; colisões unknown/direct reproduzidas; parceiro B preservado; cascades parceiro/cliente + ROLLBACK; DELETE PUC preserva PTC/source órfã; dependência VIEW impede rollback; rows/active/ACL/body/reader preservados. Nenhuma exceção mascarada: erro esperado deve conter mensagem exata; erro inesperado falha suite. A primeira tentativa do teste completo errou contagem fixa de manifesto sintético e falhou; corrigida para contagem realmente lida, sem alterar digest de produção.

Vitest às **18:28:51 UTC: 4 arquivos / 4 testes passaram**, novo B3.1 (22), regressões B3 (14), B2 (23) e B1 (35): **94 checks locais**. Lint focado novo teste exit 0. Build automático observado OK **18:27:48 UTC**; nenhum typecheck manual permitido/executado nesta rodada, nenhum lint global ou browser; não alegar PASS desses. Concorrência B2 regressiva continua demonstrando gap, não solução de B3.1; nenhuma concorrência hosted nova.

## 10. Gates e decisão B3.2
| Recorte | Status | Bloqueador essencial |
|---|---|---|
| Auditoria/preparação | PASS delimitado | Não certifica integrations externas/dynamic SQL |
| Metadata neutra sem FK/uso | Pré-aprovável para revisão | Autorização externa específica, destino, backup, ausência consumers fora checkout e drift/zero sob locks |
| Guard BEFORE isolado/origem autorizadora | NO-GO | Não prova source/ator do sync sem coordenação; writer direto não pode ser bloqueado |
| Cleanup/grant/revoke | NO-GO | Ator/source/receipt, colisões, validator e revogação independente/concurrent não fechados |
| FK/cutover | NO-GO | Source estável/histórico/deletes e replacement writer não provados |
| RLS A/B/legado/Storage/cache | NÃO VERIFICADO | Sessões reais e isolamento/positivo legítimo necessários |

**Decisão final B3.2:** permitir avançar somente prompt específico de revisão/instalação externa do staging neutro; não instalar candidata B3 com origem confiável/FK RESTRICT e não promover a metadata para autorização. Os demais NO-GO não impedem preparação neutra, mas impedem alteração funcional/cutover.

### Prompt final implementável
> Cultivo Farm B3.2: revisar somente metadata neutra B3.1 em produção comprovada swzpzcwiasxmjutrmvkm. Agente não executa SQL/publica. Auditor externo confirma autorização específica, backup, manifesto 59/digest exato, zero PUC/PTC sob locks e zero consumidores metadata (incluindo integradores). Duas colunas nullable sem default/CHECK/FK/índice/backfill, sem mudança de grants/policies/triggers/bodies/UI. Arquivo original permanece bloqueado até cópia atestada; drift exige nova auditoria. Post-audit comparar ACL/RLS/29 policies/bodies/rows e manter PUC containment. Metadata é falsificável e nunca usa para acesso/cleanup. Rollback recusa preenchimentos/dependências; nenhuma limpeza de dados para forçar rollback. Origem server-owned, colisão, ator/alvo, revogação, source/histórico/deletes e RLS A/B real são próximos recortes, não autorizados por instalar staging.
