# F2-B3.3 — contrato server-owned (somente desenho revisável)

**GO somente para desenho/experimentos locais. NO-GO para implementação hospedada, reabertura de RPC/PUC, mudança de ACL/policy ou cutover.** B3.2 neutra não é pré-requisito: os campos não confiáveis, se ausentes, podem ser introduzidos diretamente com proteção coordenada na futura fase autorizada. Se presentes, tratá-los como desconhecidos até prova servidor, nunca promovê-los por valor existente.

## 1. Âncoras existentes e limitações comprovadas no código
- `assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text) RETURNS uuid`; `unassign_b2b_user_client_secure(uuid,uuid,text) RETURNS boolean`; `get_b2b_partner_clients_for_assignment_secure(text) RETURNS TABLE(...)`: bodies fechados, path vazio, ACL comum revogada e erro `B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE`. Fonte: `supabase/migrations/20261008173204_54750128-42c5-4dfd-a9d1-4774eb2f71be.sql:11–44`. Nenhuma dessas assinaturas contém partner_id, expected_version ou chave idempotente. Não esconder tais valores em notes/reason nem selecioná-los por `LIMIT 1` do alvo.
- `sync_puc_to_ptc_fn()` faz UPSERT por chave, pode sobrescrever direct/unknown; `validate_partner_user_client_fn()` valida elegibilidade do alvo/carteira, também na desativação. Fonte histórica: `20260702145433_a3b67258-4f0a-42d0-8521-55790aa9d3a7.sql:191–253`; bodies atuais foram registrados em B3.1, não reconfirmados hospedados neste turno.
- `platform_private.authz_tickets(txid,scope,target)` e `issue_ticket/has_ticket(text,uuid)` são infraestrutura privada existente (`20261001120810_33328c65-e209-471b-841c-059c61497063.sql:1–25`), **não receipt completo**. Há emissores/callers privilegiados a inventariar antes de reutilizar escopo novo. Não assumir que um ticket genérico autoriza ator/tenant/source/version/conteúdo.
- PTC direct writer na tela existente permanece; PUC comum permanece RESTRICTIVE false. Nenhum acesso já existente é removido neste desenho. Ledger/histórico autoritativo não é criado em paralelo: primeiro avaliar trilhas existentes e suas políticas de imutabilidade/tenant/retention; adaptar somente após contrato aprovado.

## 2. Autoridade e dataflow
```text
chamador autenticado
  -> RPC existente (ainda fechada durante preparo)
  -> contexto canônico do ATOR + poder de gerir relação
  -> parceiro e tenant provados, nunca derivados do alvo arbitrário
  -> pré-autorização sem revelar recursos/replay
  -> locks globais existentes + locks ordenados do escopo
  -> revalidação ator/contexto + CAS/receipt de conteúdo
  -> decisão: GRANT (alvo elegível) OU REVOKE (autoridade relação original)
  -> PUC existente -> validator coordenado -> sync existente
  -> PTC projected com source/identidade original comprovadas
  -> audit/revision/resultado no MESMO commit
```

Ator ≠ alvo é legítimo para gestor autorizado. Alvo não fornece mandato. Resolved tenant/contexto deve preservar `commercial_owner` e `legacy_partner_tenant` comprovados; owner=profile.organization_id NÃO é condição universal. Admin interno/superadmin só operam contexto explícito autorizado, não recebem carteira cruzada implicitamente. As assinaturas sem partner_id não suportam escolha explícita de múltiplos parceiros: enquanto UNIQUE(user_id) vigorar, somente resolução canônica determinística autorizada do ator pode ser considerada; zero/múltiplos/ator interno sem contexto provado = negar. Ampliar assinatura/contexto persistido exige autorização posterior e revisão de callers, sem endpoint paralelo.

## 3. Source confiável, preservação direct e colisão
Prova precisa vincular **ator, tenant/contexto, operação, PUC id, identidade imutável do par/tripla, versão/geração, PTC id e hash de conteúdo**. `grant_origin='puc'`, UUID enviado, assigned_by, current_user, profundidade de trigger, JWT custom ou GUC não provam isso.

Plano preferido: emissão de autorização privada transacional **após** checks e locks; o sync/guard coordenado consome prova privada do escopo/row exata, sem client ACL para emissão. Tickets atuais podem fornecer fencing de txid, mas só bastam se target corresponder a receipt protegido que amarre todos os campos, com emissor revisado e não reusável para outra row/operação. Não reutilizar `org_write` ou ticket de outro módulo. Este contrato/receipt ainda não existe de forma comprovada para PUC/PTC.

| Estado encontrado | Operação futura permitida |
|---|---|
| PTC inexistente + source PUC autorizada | Criar projeção e registrar source/receipt atômicos |
| PTC projected + source id/geração/identidade comprovados | Atualizar somente conteúdo/estado previsto, usando CAS |
| PTC direct/unknown na chave | **Abortar transação inteira**, sem alterar active/notes/source/PUC; reconciliar auditavelmente |
| PTC rotulada projected mas sem receipt confiável | unknown; nunca cleanup por rótulo |
| Recriação PUC com nova identidade/geração | Não herdar a projeção antiga; colisão exige decisão auditada |
| Writer PTC direto toca linha projected | Negar conversão/tampering via guard server-owned; UX só deve expor ação compatível após release autorizada |

Writer direto ainda precisa poder criar/desativar **direct** legítimo sob RLS atual. Guard futuro não pode rotular todo postgres/serviço como projected nem reinterpretar linhas preexistentes. Mudança de tripla/source deve ser proibida em projected; inativar/arquivar relação original, criar nova operação explícita. Testar compatibility antes de impor guard.

## 4. Fronteiras transacionais e revogação
**Tx-GRANT:** pré-autorização -> adquirir gate global existente na ordem canônica -> locks contexto/identidade/vínculo/carteira/PUC/PTC em ordem estável por IDs (validar ordem real de TODOS writers) -> revalidar -> exigir alvo ativo/elegível e cliente no parceiro -> receipt/CAS -> PUC + projected PTC + auditoria + revisão -> commit. Sem linha PTC ainda existente: lock lógico por tripla deve usar recurso servidor comum a todos writers ou unique+tratamento atômico; não basta `SELECT FOR UPDATE` em row ausente. Não inserir dummy em tabela real para obter lock.

**Tx-REVOKE:** provar ator e mandato sobre relação original -> mesmos locks -> revalidar -> somente active true→false / marca revogação prevista, sem trocar tenant/par/notes permissivas -> validator permite o ramo monotônico só com prova privada da operação -> sync desativa **apenas projected com source comprovada** -> auditoria e revisão -> commit. Alvo já inativo, revogado ou sem papel não impede cleanup autorizado. Direct/unknown preservado, nunca convertido. Falha em qualquer passo reverte tudo.

**Revogação partner_users/role/profile:** sync PUC atual não é disparado. Todos caminhos reais de revogação devem compartilhar a ordem de locks e invalidação; guard de leitura deve negar vínculo revogado imediatamente em **novas consultas depois do commit**, mesmo que cleanup materializado ainda não aconteça. Para volumes pequenos, cleanup projected na mesma transação é preferível; se batch for inevitável, reader fail-closed precisa estar comprovado ANTES e batch é só higiene, não autoridade. Não revogar outros vínculos/papéis. `user_roles parceiro_b2b` somente removível se nenhum outro vínculo ativo que precise do papel e ação autorizada; esta fase não remove UNIQUE nem promove múltiplos.

**Concorrência:** grant que iniciou antes da revogação deve revalidar após obter locks; revoke que espera grant deve fechar todo resultado anterior ao seu commit. Tentar uma ordem local diferente do singleton cf_user_guards pode gerar deadlock; reconfirmar guards e writers atuais antes de fechar ordem final. Deadlock/timeout retornam erro explícito e rollback, sem auto-retry que duplique efeito. CAS/idempotência precisam decisão de evolução das assinaturas existentes ou receipt compatível; atualmente **bloqueador**, não contrato implementado.

**Snapshot/cache:** REPEATABLE READ/consulta em curso pode observar snapshot pré-revogação; TTL de URL assinada e bytes já baixados não são recolhíveis. Sem prometer "instantâneo" para esses casos. Novas leituras auth/read-committed, refetch/pending/identity fencing e invalidação servidor são provas diferentes; gate cache permanece fechado. Não trocar revisão global por UPDATE profiles em massa/fan-out.

## 5. Delete/histórico
Preferir revogar/arquivar, preservar snapshots financeiros/pedidos/documentos e trilha original. PUC DELETE não é revoke suficiente. FKs atuais dos pais CASCADE não preservam histórico; não corrigi-las silenciosamente. FK PTC→PUC RESTRICT só após inventariar cascades; SET NULL perde source sem receipt durável; CASCADE destrói projeção/histórico. Source que desaparecer deve falhar fechado como projected órfã, não virar direct. Nenhum backfill baseado na chave e nenhuma deleção de reais nesta fase.

## 6. Fases revisáveis (sem SQL de alteração autorizada)
| Fase | Pacote mínimo | Gate de aceite |
|---|---|---|
| B3.3-A agora | Resolver decisão ator/contexto, recibo, CAS/idempotência e order locks; testes locais sem RPC real aberta | Contratos explícitos e blockers abaixo resolvidos por revisão |
| B3.3-B futura | Candidata coordenada de source privada/guard PTC + sync + validator, se preciso metadata protegida adicionada nesta mesma candidata | Backup recuperável, bodies/ACL live, trilha/receipt comprovados, direct writer compatível; PUC/RPC continuam fechadas |
| B3.3-C futura | Recorte leitores/revogações completo por família, preservando ramos internos/legado | Provas RLS/JWT A/B, positivo legítimo e concorrência; sem política genérica permissiva |
| B3.4 futura | Rehearsal fiel e browser autenticado com fixtures explicitamente autorizadas | Sem SKIP, entrega OFF, cleanup por IDs e logs sem PII |
| Release posterior | Liberar RPC/policy/tela existentes somente após aceite integrado | Nova autorização específica; nenhum release implícito por metadata |

Rollback pré-consumo pode reverter pacote coordenado sob manifest/data gates; pós-consumo deve preservar provenance/audit e usar forward-fix/compensação. Nunca restaurar sync vulnerável onde projected já tenha contrato autoritativo sem plano de migração/fechamento de writers. Não prometer rollback trivial por DROP COLUMN.

## 7. Matriz de testes exigidos (ainda não executados como contrato B3.3)
1. Gestor A atribui técnico distinto em parceiro A/tenant coerente; técnico não gere outro alvo; admin A não gere B; superadmin precisa contexto autorizado.
2. Grant novo, repetido e resposta perdida: efeito único e receipt mesmo conteúdo; mesma chave/conteúdo divergente nega; CAS antiga nega.
3. Zero/múltiplos contextos e contexto interno indefinido negam; commercial_owner e legacy válido preservam acesso positivo; legacy sem prova nega.
4. Falsificação de metadata/GUC/assigned_by/claims e emissão ticket indevida negam; rollback da tx descarta prova; prova de A não vale para B/source diferente.
5. INSERT/UPDATE tecnico→comercial/role→gestor/active false desativam só projected própria; direct/unknown colisão aborta tudo; cliente/parceiro B permanece intacto.
6. Cleanup alvo sem papel/inativo/revogado funciona sob ator autorizado; ativação inversa por "cleanup" nega; alterar tripla/source nega.
7. Dois processos com grant/revoke, revoke/revoke, insert direct/projection e partner_users revoke: verificar lock order, ausência de deadlock não tratado, atomicidade e revalidação; auditar dados após CADA teste.
8. DELETE/arquivamento PUC/cliente/parceiro e source recriada: histórico intacto ou gate explícito; nenhum projected vira direct.
9. RLS real A/B por sessões, portal/RPC/clientes/documentos/Storage/financeiro/fiscal, positivo legítimo e negativa cruzada; queries privilegiadas não contam.
10. Logout/login/troca tenant, dois dispositivos, foco/offline/erro/cache delayed e signed URL TTL; medir limites sem prometer recolhimento de bytes.

## 8. Próximo prompt mínimo útil
> Cultivo Farm B3.3-A: somente auditoria/design e PostgreSQL descartável. Fechar contrato de contexto do ator para assign/unassign existentes sem partner_id, estratégia CAS/idempotência/receipt sem abuso de notes, ordem de locks cf_user_guards em todos writers e trilha existente protegida para source. Preservar RPCs/PUC fechados e writer PTC direct; não instalar metadata neutra. Extrair read-only baseline no ref comprovado mediante ferramenta que mostre destino. Simular operações concorrentes com source privada e colisão direct/unknown, reportando limites de fixtures, sem afirmar RLS hospedada. Se receipt/contexto/guard não for demonstrado, manter NO-GO específico e entregar candidata explicitamente bloqueada. Nenhum DDL/DML hosted, publicação, novo modelo de grants ou remoção de UNIQUE.