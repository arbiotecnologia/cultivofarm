# Cultivo Farm F2-B3 — proveniência PUC/PTC — 18/10/2026

**PASS: inventário delimitado e preparação local. NO-GO: instalação/cutover.** Nenhum DDL/DML em produção/homolog, mudança runtime, policies/ACL/Auth ou publicação pelo agente. Candidata F2-B2 não promovida.

## 1. Objetivo
Impedir cleanup indevido de concessão PTC independente da mesma chave e preparar revogação segura sem abrir containment PUC. Decisão preferida para aceite, não regra já implantada.

## 2. Diagnóstico comprovado
SELECT próprio no binding canônico, `supabase/config.toml:1=swzpzcwiasxmjutrmvkm`, às 18:16–18:19 UTC corroborou auditor externo: **PUC=0, PTC=0**. UNIQUE PUC `(partner_id,user_id,cliente_id)` e PTC `(partner_id,technician_user_id,cliente_id)` preservadas. PUC: BEFORE validator/timestamp e AFTER sync; PTC: somente BEFORE timestamp.

`TecnicosProdutores.tsx:60–106` lista/insere/atualiza PTC diretamente; rota `App.tsx:517`. Portanto **concessão independente existe no código**; não prova mutation autorizada por sessão real. Backfill histórico PTC→PUC e sync PUC→PTC tornam matching key/assigned_by/notes/timestamp insuficientes para origem.

### Baseline vivo de funções (MD5 pg_get_functiondef)
| Assinatura | MD5 |
|---|---|
| sync_puc_to_ptc_fn() | 4dc955897950bf70ee8e1072bbae1ff2 |
| validate_partner_user_client_fn() | dcafec82ec7147ab67ce17ab934d3619 |
| can_user_access_cliente(uuid) | 4c2eaf7ab10e204e7ad57d41cb418554 |
| can_user_access_cliente(uuid,uuid) | c610786fc9f6d6a44453b9e63c91e974 |
| get_b2b_technician_clients_secure(uuid,uuid) | 959c240612344cfb2b8cd8a2052e384d |
| get_b2b_technician_client_detail_secure(uuid) | 304d33925c6047ace48827405f77d426 |
| platform_private.b2b_save_technical_simulation(jsonb) | daad3c1554f370bb0456b4ea3afdeea7 |
| platform_private.b2b_commercial_context() | 02158d4204dea67308558f649113ba6d |
| assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text) | 05938fe942c150b7c1f80d9486778d72 |
| unassign_b2b_user_client_secure(uuid,uuid,text) | 5c7f03da446b73331c1949f233f68784 |
| get_b2b_partner_clients_for_assignment_secure(text) | 0d377692ee8013d132909cd14f9cdbe4 |

Sync/validator: postgres, DEFINER, path public, ACL postgres/service_role. Overloads cliente/readers técnicos: mesmos owner/DEFINER/path, authenticated também EXECUTE. Contexto/writer simulação: DEFINER/path vazio. Assign/unassign/lista elegível: DEFINER/path vazio, postgres/service_role, **sempre B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE** após Auth/tenant. Nenhum grant alterado.

Busca lexical atual: **9 funções com PUC/PTC** (sync, 2 overloads cliente, 2 readers técnicos, 3 readers PUC, writer simulação). Validator consultado separadamente. Não cobre dynamic SQL/callers indiretos. Policies PUC/PTC: 7; containment PUC RESTRICTIVE ALL false para anon/authenticated; PTC sem containment equivalente. `partner_simulations_insert` aceita PUC OR PTC. **29 policies por helpers anteriores intactas**, não recertificadas individualmente nesta rodada.

## 3. Dados e decisão preferida
**PUC como fonte única final de grants; PTC somente compatibilidade transitória.** PUC já possui assignment_type, can_monitor/can_create_simulation e contratos RPC; evita duas autoridades permanentes. A documentação `docs/portal-b2b-usuarios-clientes.md:18–48` também favorece PUC, mas runtime independente contradiz essa direção.

Alternativa PTC independente permanente com origem preservaria curto prazo, mas duas intenções na mesma UNIQUE não cabem em um único discriminador: exigiria semântica de coexistência mais complexa. Não preferida. Não migrar UI para writer PUC fechado.

Aditivo proposto: PTC `grant_origin` nullable + `source_puc_id` nullable; NULL=desconhecido, direct=independente revisado, puc=projeção comprovada. FK composta para PUC verifica MESMO parceiro/alvo/cliente; UNIQUE adicional PUC suporta FK. Sem tabela/modelo paralelo. São metadados transitórios, **não nova autoridade**. Nenhum DEFAULT/backfill. Zero linhas hoje não dispensa contagem sob locks no cutover.

Conflito direct/unknown PTC versus nova projeção PUC na mesma chave deve **abortar**, não sobrescrever ou converter automaticamente. Reconciliar somente via operação canônica autorizada com snapshot/motivo/audit. NULL nunca autoriza cleanup como projeção. Após cutover, novos grants diretos cessam.

## 4. Regras
- Preservar UNIQUE atuais, inclusive partner_users UNIQUE(user_id); não promover multivínculos.
- Acesso exige identidade ativa, tenant/contexto provado, vínculo não revogado/vigente, parceiro ativo/não deletado/owner comprovado, cliente/carteira/papel/capacidade compatíveis.
- Respeitar `commercial_owner` e `legacy_partner_tenant` mediante provas; não universalizar profile.organization_id=owner nem criar mandato cross-tenant.
- Origem escrita pelo cliente não é prova: futuros guards devem tornar origem/referência server-owned antes de utilizá-las para cleanup.
- FK/CHECK estático não provam ator, tenant, tipo técnico, vigência ou active; não usar now() em CHECK.
- Não remover outros papéis, transferir carteira/financeiro/fiscal nem apagar histórico.

## 5. Fluxo e revogação atômica
Reusar RPCs existentes. Provar ator antes de locks; resolver contexto server-side; ordenar locks compartilhados entre grant/revoke (vínculo, perfil/papéis pertinentes, partner_clients, PUC, PTC), revalidar após locks. Ordem total/timeout/receipt precisam contrato antes de implementação.

Grant: alvo elegível → PUC → projeção com source comprovada, mesma transação. Cleanup: ator autorizado sobre relação original, alvo pode estar inelegível; somente active→false, identidade/capacidades/origem imutáveis. BEFORE validator precisa exceção mínima autorizada, nunca desabilitação/bypass GUC/claims.

Revogação independente de perfil/papel/parceiro precisa coordenação transacional e readers fail-closed após commit, mesmo com PTC residual. Limpar somente origem puc/source exato. Reutilizar auditoria/receipt/CAS/idempotência existentes comprovados; não inventar endpoint alternativo nem prometer atomicidade presente.

## 6. Permissões: ator versus alvo
| Operação | Ator | Alvo / gate |
|---|---|---|
| Atribuir/editar | Gestão explícita tenant/parceiro/cliente/feature antes/depois lock | Elegível; writer fechado |
| Revogar/cleanup | Poder sobre relação original com motivo/audit | Pode estar inativo; contrato pendente |
| Técnico consultar | auth.uid/contexto/grant próprio/capacidade | Si próprio, parâmetro não impersona |
| Admin/gestor interno | Escopo servidor, não global pelo nome do papel | Terceiro somente tenant autorizado |
| Superadmin/serviço | Ação explícita auditada, sem bypass genérico | Testes próprios |

Não impor target=actor em helpers de elegibilidade usados por validator de terceiros. has_role do alvo não autoriza ator.

## 7. Impactos e consumidores
| Canal | Evidência / próxima mudança |
|---|---|
| Técnicos × Produtores | TecnicosProdutores:87–106 escritor PTC; migrar para RPC somente liberada |
| Usuários × Clientes | UsuariosClientesB2B:76–135 chama RPCs fechadas; reaproveitar tela/contratos |
| Carteira PUC | MeusProdutoresTecnico:32–42, DashboardTecnico:20–30, DetalheProdutorTecnico:39–61; reconciliar titular versus contrato administrativo atual |
| Readers técnicos PTC | Dois bodies hospedados; futuro PUC/contexto/capacidades preservando acessos legítimos |
| Cliente | Overload 1 técnico PTC+escalar; overload 2 técnico PUC OR PTC e gestor partner_users; uniformizar contrato por recorte |
| Simulação | Writer privado/policy INSERT OR PUC/PTC; retirar fallback só no cutover provado |
| Documentos/Storage | Cadeia F2-B2 can_user_access_arquivo→overload 1 e cliente_storage_object_permitted h15/path; provas A/B/TTL pendentes |
| Pedidos/financeiro/fiscal | Contextos/vínculos próprios, sem transferência; técnico sem finanças |

Readers técnicos vivos agregam simulações por cliente sem filtro parceiro visível no agregado: risco delimitado a investigar, não exploração comprovada. 29 policies não alteradas.

## 8. Performance
Índice UNIQUE redundante ao PK PUC para FK composta e parcial source_puc_id PTC têm custo de escrita/DDL locks. 0/0 não representa volume futuro. Exigir EXPLAIN/paginação/planos tenant/parceiro; índices active/vigência apenas com evidência. Candidata lock_timeout=3s/statement_timeout=30s. Sem auto-retry de mutation.

## 9. Histórico, legacy e ON DELETE
Sem backfill presumido por matching key. Reclassificar apenas com prova de operação original/auditoria, sem cortar acessos reais por suposição. Hoje não há legacy de carteira; repetir baseline no cutover.

FK proposta ON DELETE/UPDATE RESTRICT impede descolar/apagar origem. **FKs atuais PUC/PTC para parceiro/cliente são ON DELETE CASCADE**; combinação pode bloquear delete do pai com projeção. Gate explícito de compatibilidade/exclusão/arquivamento, sem mudar FKs atuais nem substituir por SET NULL/CASCADE por conveniência. Preferir desativação auditada; metadados não são histórico append-only nem audit log imutável.

## 10. UX/cache
Mesmas telas/rotas, futuros RPCs liberados; confirmação, erro/pendência explícitos, CAS/tentativa preservados e read-back. Não anunciar sucesso de chamada fechada. Chaves atuais b2b-partner-vinculos, b2b-user-vinculos, b2b-partner-clientes-assign, b2b-user-clientes/dash/simulador precisam identidade/tenant/revisão/fencing e invalidação. Não abrir epoch gate neste plano. Cache não autoriza; sessão/dispositivo secundário nega novo read após commit; conteúdo baixado não recolhível e URL assinada pode sobreviver TTL.

## 11. Integrações
Busca literal própria em `supabase/functions -g '*.ts'` encontrou **zero PUC/PTC** no checkout atual. Não repetir achado histórico de harness como consumidor vigente. Calls indiretos via RPC/JWT/service ainda requerem inventário. Auth/MFA/SMTP/SEFAZ/secrets intocados, envios OFF, sem copiar PII/homolog nem presumir paridade.

## 12. Riscos/blockers
**G1** aceite da semântica PUC única pendente.
**G2** contrato ator/cleanup/audit/receipt/validator não provado; writer fechado.
**G3** colisões direct/unknown e origem client-editable sem guard futuro.
**G4** readers/revogação atômica não fechados em todos os canais; aditivo não resolve acesso.
**G5** RESTRICT versus cascades/deletes pai ainda sem prova operacional.
**G6** sessões reais A/B/legado, manutenção de acesso legítimo, Storage/cache/concorrência hosted não realizadas.
Bloqueiam instalação/cutover, não preparação independente por dívidas fiscais/SMTP não relacionadas.

## 13. Aceite
Containment false/ACL/bodies intactos no estágio metadados; PTC projected source exato; colisão independente aborta sem perda; ator A não lê/grava/revoga B; alvo diferente legítimo funciona; inativo pode receber cleanup autorizado, não grant novo; revogação fecha novo read mesmo com resíduo; legado válido preservado sem igualdade owner universal; histórico/papéis/UNIQUE preservados; hashes/ref/gates revisados independentemente antes de release. Origem sem guard não habilita cleanup.

## 14. Testes e provas
`python3 scripts/tests/b2b-f2b3-provenance-local.py`: **14 checks estruturais**, PostgreSQL descartável/tabelas sintéticas/sem Auth ou RLS. Gate instalador recusado, origem NULL preservada, CHECK incluindo lógica NULL/source, FK rejeita parceiro/alvo/cliente diferente, RESTRICT, rollback conserva linhas/chaves e recusa perda de origem. **Gap reproduzido:** PUC active=false não desativa PTC pelo aditivo; PASS do teste do gap não é PASS da solução.

Regressões reexecutadas 18:19 UTC: três suítes F2-B/B1/B2 **3/3 testes**, checks 26/35/23. Checkpoint 18:22 UTC: `bun run test -- src/test/saas/b2b-f2b3-provenance-postgres.test.ts` **1 arquivo/1 teste passou** (executa os 14 checks); `bunx eslint src/test/saas/b2b-f2b3-provenance-postgres.test.ts` **exit 0**. Build automático observado **OK 18:21:57 UTC**; sem build/typecheck manual ou lint global nesta rodada, não alegados PASS individuais.

Matriz futura **não executada**: Admin A/B, gestor A/B, parceiro A/B mesma chave, técnico ativo/revogado/inativo, técnico→gestor/PUC→comercial, produtor/interno, commercial_owner/legacy, zero/dois contextos, superadmin/service; cada cenário exige JWT/RLS/read-back/diff, negativo cross-tenant e positivo legítimo. Concorrência duas sessões grant/revoke/replay; documentos/Storage URLs/cache/login/logout/foco/dois dispositivos; pedidos/financeiro/fiscal sem transferência. SQL privilegiado/local nunca certifica RLS hosted.

## 15. Fases
1. **B3.0 entregue:** baseline/decisão/preparação bloqueada/testes locais.
2. **B3.1:** aceite proprietário, mapping completo writers/readers/deletes, contratos ator/legado/cleanup.
3. **B3.2 aditiva:** revisar G5/ref/digests/ACL/contagens sob locks; instalar só metadados após autorização externa. Não autorizada agora.
4. **B3.3:** origem server-owned, conflito, validator cleanup, writers/revoke existentes coordenados e reader ativo; candidatas separadas, containment intacta.
5. **B3.4:** homolog fiel + sessões A/B/legado/Storage/concorrência/deletes/rollback, sem copiar Auth/PII.
6. **B3.5 cutover:** writers guardados/readers e fechamento escrita direta PTC coordenados; classificar legados somente comprovados; remover OR somente após equivalência comprovada, sem reabrir policy PUC.
7. **B3.6 UI:** adaptar telas aos RPCs efetivamente liberados, confirmação/cache/fencing, compatibilidade servidor primeiro.
8. **B3.7:** PTC história/compatibilidade não autorizadora; retirada estrutural só autorização separada/zero callers, nunca apagar neste plano.

## 16. Rollback
SQL separado bloqueado, sem CASCADE, somente pré-cutover/metadados não classificados. Recusa origem/source preenchidos; não apagá-los para satisfazer gate. Dependências novas falham, snapshot protegido/compensação auditada se necessário. Após cutover não restaurar OR vulnerável/reativar grants; forward-fix/contenção da operação afetada. Não prometer rollback fácil de acessos divulgados. Esquema no arquivo não remove UNIQUE nem altera grants atuais.

## 17. Prompt final implementável
> Cultivo Farm B3.1: somente preparação no ref comprovado swzpzcwiasxmjutrmvkm. Obter aceite PUC única/PTC transitória; revisar writer direto TecnicosProdutores, RPCs fechadas, callers/deletes/Storage e commercial_owner/legacy. Produzir contrato ator versus alvo, cleanup monotônico autorizado, locks grant/revoke, audit/receipt/idempotência reutilizados e recusa de colisão de origem. Desenhar guards server-owned para grant_origin/source e reader fail-closed pós-revogação, sem fallback residual. Não modificar 29 policies/containment nem executar DDL/DML/publicar. Preparar candidatas/diffs/testes por recorte e matriz JWT/RLS A/B/legítimos/legado/concorrência/cache/Storage. Revisar cascades versus RESTRICT antes de autorizar B3.2. G1–G6 não provados = NO-GO específico; local/mock não vale PASS hosted. Não migrar UI para RPC indisponível.

## Pacote
`vinculos-b2b-f2b3-preflight-readonly-20261018.sql`, `vinculos-b2b-f2b3-esquema-candidato-20261018.sql`, `vinculos-b2b-f2b3-rollback-candidato-20261018.sql`, este relatório; harness `scripts/tests/b2b-f2b3-provenance-local.py`, teste `src/test/saas/b2b-f2b3-provenance-postgres.test.ts`. Roadmap/regra arquitetural atualizados. SQL fora de supabase/migrations, gates incondicionais: **não instalável** antes de nova revisão. Preflight proposto é manifesto para comparação, não detecção automática do ref (current_database=postgres não o prova). Produção/homolog preservadas, nenhuma migration executada.