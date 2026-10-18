# Cultivo Farm — F2-B3.3-A revisão de contratos

**PASS preparação; NO-GO instalação/release.** Auditoria canônica read-only e protocolo local realizados. Sem DDL/DML produção/homolog, alteração runtime/rota/ACL/policy, publicação ou dados reais usados como fixtures. Backup/restauração, infraestrutura protegida de receipt, writers/revokers/readers coordenados e JWT/RLS A/B reais continuam bloqueadores. Não instalar metadata neutra B3.2 como pré-requisito.

## A0 — evidências atuais
18/10/2026, aproximadamente 20:13–20:17 UTC. Integração aponta **swzpzcwiasxmjutrmvkm**, corroborada pelo config canônico; não se usou current_database/GUC/literal para identificar destino. Somente SELECT de catálogo/contagens, sem PII/tokens. A ferramenta devolve apenas último resultset de queries múltiplas: contagens, ACL e policies foram reconsultadas separadamente. Homolog não acessada. Commit `9c09f01fbd25c69b8ac8f46dc4558f670ab2cea8` conferido via git show.

PUC/PTC **0/0** reconfirmados; **29 policies** referenciam os quatro helpers. PUC mantém `bf02_assignment_contract_containment`, RESTRICTIVE ALL anon/authenticated false/false. PTC mantém ptc_select/insert/update permissivas. Grants live de tabela PUC/PTC/partner_audit_logs incluem anon/authenticated/service_role ALL; RLS continua necessária, sem policy anon nesse recorte. Não alterados.

| Função / assinatura | MD5 live | Segurança/contrato |
|---|---|---|
| assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text) → uuid | 05938fe942c150b7c1f80d9486778d72 | DEFINER postgres, path vazio; EXECUTE postgres/service_role apenas; auth+h15 então B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE |
| unassign_b2b_user_client_secure(uuid,uuid,text) → boolean | 5c7f03da446b73331c1949f233f68784 | idem, sempre fechado |
| sync_puc_to_ptc_fn() → trigger | 4dc955897950bf70ee8e1072bbae1ff2 | DEFINER, public, postgres/service_role; UPSERT por tripla sem source |
| validate_partner_user_client_fn() → trigger | dcafec82ec7147ab67ce17ab934d3619 | DEFINER, public, postgres/service_role; elegibilidade alvo/carteira inclusive cleanup |
| b2b_commercial_context() → jsonb | 02158d4204dea67308558f649113ba6d | DEFINER path vazio, authenticated/service_role; papel/contexto único, catalogo_precos, modos owner/legacy |
| b2b_phase1_partner_visible(uuid,boolean) | 35cfda5d5988fb6ad57944bd11a51c3c | DEFINER public,pg_temp; authenticated/service_role, ramo superadmin |
| b2b_actor_scope(uuid) → TABLE | c85cb35201682c3c86b9a327d24c8482 | DEFINER public,pg_temp; postgres/service_role; alvo-param não prova mandato |
| can_user_access_cliente(uuid) | 4c2eaf7ab10e204e7ad57d41cb418554 | DEFINER public, authenticated/service_role; ramo técnico PTC active/helper |
| can_user_access_cliente(uuid,uuid) | c610786fc9f6d6a44453b9e63c91e974 | idem; ramo B2B partner_users direto sem revoked_at; técnico PUC OU PTC active |
| cf_user_guards_v1.acquire_gate() | b0dd9a14d5fd799a40df0975baf4c5a6 | DEFINER path vazio, owner-only; UPDATE singleton state |
| cf_user_guards_v1.touch_related_profiles() | e5911c3801be399f9de57e038b390e79 | idem; profiles ordenados/reentrada gate |

PUC triggers: trg_puc_updated BEFORE UPDATE; trg_validate_puc BEFORE INSERT/UPDATE; trg_sync_puc_to_ptc AFTER INSERT/UPDATE. PTC: somente trg_ptc_updated_at BEFORE UPDATE, sem guard de origem. partner_users conserva a00 gate/no truncate, a10 derive, a20 bump, z90 touch; profiles/user_roles participam do gate.

**Blocker novo específico:** acquire_gate só aceita TG_LEVEL STATEMENT e TG_RELID profiles/user_roles/user_clientes/partner_users/auth.users. Não pode ser anexado diretamente a PUC/PTC ou chamado como função comum. Adaptar esse contrato exige recorte próprio e revisão de ordem de TODOS escritores. Lab usa singleton sintético, não esse guard real.

authz_tickets(txid,scope,target,created_at) tem owner-only ACL/RLS sem policies no recorte. issue_ticket(text,uuid) MD5 c32ad23a9db8574af85da8fcfc45af43 e has_ticket MD5 29adae3347e8a5ff23327fa86fceb54b são owner-only: não vinculam ator/tenant/source/conteúdo/CAS. Inventário lexical encontrou 20 callers em organização/assinatura/planos/senha, sem caller B2B nesse recorte. Emissor direto adicional issue_saas_plan_version_ticket(text,uuid), MD5 116f010bf91daae67ba3587aac3212a6, authenticated/service_role: exige superadmin e whitelist EXCLUSIVA de scopes de planos. Não serve para B2B. Busca lexical não cobre SQL dinâmico/externos universalmente.

partner_audit_logs já existe com partner_id/usuario_id/acao/dados_anteriores/dados_novos/created_at; pal_select permite administrador/gestor_comercial. Não há prova de imutabilidade/private receipt/unique idempotência/tenant adequada. RLS sem UPDATE não garante append-only contra DEFINER/privilegiado. Não promover JSON client-editable a source.

## A1 — evolução compatível escolhida, sem DDL
Preservar assinaturas antigas e seus corpos/ACL fechados. Futuramente overloads **mesmos nomes**, controles obrigatórios SEM defaults para evitar ambiguidade PostgREST:

```text
assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text,
 p_partner_id uuid,p_expected_version bigint,p_idempotency_key uuid) → uuid
unassign_b2b_user_client_secure(uuid,uuid,text,
 p_partner_id uuid,p_expected_version bigint,p_idempotency_key uuid) → boolean
```

Não esconder controles em notes/reason nem criar endpoint paralelo. Chamadas antigas continuam fechadas; compatibilidade não significa sucesso sem controles. PUC precisa revisão própria, ainda não existente: não confundir com version de partner_users. expected=0 ausência, >0 CAS exata. Unassign true = aplicado/replay autorizado; source ausente/ambígua = erro explícito, não false mascarado. Schema cache/overloads/tipos exigem teste posterior autorizado.

Ator **auth.uid** + readiness canônica + papel gerenciador + tenant/contexto + entitlement de GESTÃO aprovado. catalogo_precos no contexto atual não prova mandato de escrita; chave/role exatos são gate pendente, não inventados. Alvo distinto é legítimo sob mandato; seu user_id não autentica. Partner parâmetro também não dá mandato. Cliente requer carteira expressa e tenant de dados provado.

Separar actor_org de data_tenant (commercial_owner). Preservar commercial_owner e legacy_partner_tenant comprovado via organizations.partner_account_id/visibilidade/readiness; não impor owner=profile.organization_id universal. Zero/múltiplos contextos negam. Admin/superadmin só contexto explícito autorizado/auditado; sem transferência de carteira ou privilégios cruzados. UNIQUE(user_id) preservada.

## A2 — protocolo coordenado e source
PUC canônica futura; PTC projeção compatível e direct/unknown preservadas. Adaptar trilha existente com source/evento protegidos, **sem segundo modelo de grants**. Representação física ainda NÃO fechada: imutabilidade/ACL/retention/tenant/emitters e comportamento delete precisam prova. lab.source/lab.audit são instrumentos descartáveis, não novas tabelas propostas para produção.

Receipt vincula actor/actor_org/data_tenant/partner/alvo/cliente/operação, PUC id/geração, PTC id, versão esperada/resultante, conteúdo canônico e resultado. Chave única por actor+actor_org+partner+idempotency_key. Reautorizar antes do replay; chave igual/conteúdo diverso nega. Retry igual não reaplica efeitos, especialmente grant anterior depois de revoke. Hash compara conteúdo, não autoriza. Ticket privado txid/escopo/target somente após checks/locks; jamais GUC/claims inventados/assigned_by/current_user/trigger depth/rótulo como prova.

Ordem candidata: gate global → contexto/perfis/roles/vínculos/partner/cliente → tripla/IDs ordenados → PUC/PTC → trilha; revalidar depois da espera. Conferir TODOS writers/revokers e custo/contensão do gate. Row lock ausente não serializa inexistência: writer direto necessita guard comum ou conflito único com rollback determinístico. Não ampliar TG_RELID do guard silenciosamente.

**Grant tx:** ator/mandato → locks/revalidação → alvo/carteira elegíveis → CAS/replay → PUC → validator/sync coordenados → projected PTC com source protegida → audit/revisão → commit. Colisão direct/unknown/projected sem prova: erro/rollback integral, nunca adoção por chave.

**Revoke tx:** autoridade sobre relação original → mesmos locks/CAS → ramo monotônico inativação → validator permite cleanup privado apesar do alvo inativo/sem papel → sync só projected própria → audit/revisão → commit. Mudança técnico→comercial/gestor utiliza cleanup antes da transição; não regrant via cleanup. Direct/unknown preservadas. Erro reverte todos efeitos.

Revogar partner_users/profile/role deve fechar reader canônico e revisão na mesma transação; cleanup somente projected daquela relação. Direct preservada materialmente não pode autorizar sem vínculo/papel/tenant válido. Não retirar outros papéis/vínculos. Writer direto mantém INSERT/inativação direct sob RLS vigente, mas guard impede tocar projected/source. Guard PTC+validator+sync+revokers+readers precisam release coordenado: sync isolado não basta.

Source apagada/recriada não vira direct nem herda projeção por chave. Preservar histórico/snapshots; não instalar FK RESTRICT/CASCADE indiscriminadamente. Delete de pais continua gate separado. Novas consultas READ COMMITTED depois do commit devem negar; snapshot em curso, bytes obtidos e URLs assinadas até TTL não são recolhíveis.

## A3 — impactos/readers/rota
Contexto comercial/actor_scope ainda contam vínculos sem filtro F1 revoked_at/tenant. Overload cliente(uuid,uuid) e ptc_select técnico active podem admitir resíduo; ptc_insert testa existência de vínculo sem revogação nesse predicado. Fechamento transacional **hosted não comprovado**. Revisar leitores por família, preservando consultas de alvo autorizadas e ramos internos; não mudar automaticamente 29 policies. Gates: portal, cliente/documentos/Storage/URLs, simulações/pedidos, financeiro/fiscal, callers privilegiados.

TecnicosProdutores.tsx: partner_users sem filtro de revogação (31–38), queryKey clientes global sem tenant/contexto (49), PTC explícita por partner (60–70), update active/insert direto (87–107), invalidação apenas b2b-partner-vinculos (110). Rota App.tsx:517 preservada. Gaps estáticos, não vazamento browser reproduzido; sem refatoração neste turno. Futuro cutover exige scope/generation fencing e erro de colisão claro, sem substituir por RPC fechada prematuramente.

## A4 — resultados reais, não RLS hospedada
20:16:31 UTC: **4 arquivos/4 testes Vitest PASS** (B3.3-A novo, B3.2 review, B1 context, commercial-context). Reexecução direta auditada: **44 checks PG**, sem SKIP. Negativas exigem mensagem específica e digest de todas tabelas de estado inalterado. Sequence identity pode consumir números em rollback, comportamento normal PG, sem reciclar source.

Casos: ator≠alvo; admin A→B, alvo/cliente estrangeiros negados; owner/legacy positivo e legacy sem prova; superadmin 0/2 contextos negado e explícito positivo; readiness/entitlement; CAS/replay/conteúdo divergente; falha audit rollback; ACL client negada; audit/source imutáveis; GUC não autoriza; direct/unknown colisão; projected tampering; cleanup inelegível/direct preservada; reader residual; delete/recriação de source.

**6 disputas psql entre sessões reais:** grant/grant mesma chave, grant/link-revoke, link-revoke/grant, revoke/revoke mesma chave, direct/projection, projection/direct. Barreiras observam wait_event_type=Lock antes de commit; não presumem ordem por sleep. Estado final conferido após cada disputa. Nenhum deadlock observado nesses cenários, não prova ordem multitable real.

Lab tem actor textual fornecido pelo harness, contextos/gate/readers/tabelas sintéticos e nenhuma Supabase Auth: **NÃO autenticação, RLS real, guard de produção replicado ou installer funcional**. Transições técnico→comercial/role reais, reader families/Storage, timeout/deadlock de todos writers externos, JWT/browser e recuperação seguem pendentes. Nenhum mock usado para dar PASS de segurança hosted.

ESLint focado exit 0; build automático observado OK 20:16:22 UTC. Typecheck/build manuais não executados conforme ambiente; sem PASS independente de typecheck. Sem teste browser/login/logout/A-B hosted/backup/restore.

## Fases, critérios de aceite e rollback
**A PASS preparação. B/C/D/release NO-GO.** B precisa mandato/feature, extensão protegida da trilha existente, emissores, guard global e writers aprovados + backup ID/retention/RPO/RTO/restore ensaiado. C precisa leitores/revokers por família e positivo interno/legado. D precisa JWT/RLS A/B gestor/técnico/admin/superadmin/produtor/interno, parceiros A/B, Storage/documentos/financeiro/fiscal, browser/troca tenant e concorrência real, fixtures autorizadas/delivery OFF. Release exige autorização posterior específica.

Aceite: source não falsificável; replay/CAS seguro sem endpoint paralelo; direct/unknown preservadas e projected source durável; cleanup inelegível sem regrant; novas leituras negadas após commit; outros papéis intactos; todos writers na ordem aprovada; erro/deadlock/timeout rollback sem retry cego; containment/ACL históricos preservados até revisão pontual; backup/restore/JWT/RLS reais evidenciados.

SQL candidato e rollback **sempre recusam 42501**, sem DDL operacional depois do gate; não retirar DO para instalar. Nenhum rollback banco necessário agora. Pré-consumo: inversa exata com manifesto ampliado/data/dependencies. Pós-consumo: forward-fix/compensação preservando source/eventos/direct/histórico; nunca restaurar sync vulnerável ou DROP CASCADE. Restore integral requer reconciliar escritas legítimas posteriores.

## Arquivos e próximo mínimo útil
Novos: relatório, preflight-readonly, candidato-bloqueado e rollback-bloqueado `docs/auditorias/vinculos-b2b-f2b33a-*`; `scripts/tests/b2b-f2b33a-protocol-local.sql/.py`; `src/test/saas/b2b-f2b33a-protocol-postgres.test.ts`. Atualizados roadmap/AGENTS; históricos B3.2 preservados. Nenhum arquivo supabase/migrations/runtime alterado.

> Próximo B3.3-B SOMENTE preparação: provar mandato/entitlement gerenciador real; escolher extensão protegida de partner_audit_logs/infra privada sem duplicar grants; auditar emissores/ordem cf_user_guards em todos writers/revokers. Preparar guard PTC+validator+sync coordenados com recusa e testes das transições técnicas/readers/legado. Nenhuma abertura ACL/PUC, alteração de rota ou instalação sem backup/restore e provas reais/autorização posterior.