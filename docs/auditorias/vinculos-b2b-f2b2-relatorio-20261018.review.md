# F2-B2 — projeção técnica PUC→PTC contida — 18/10/2026

## Resultado executivo

**PASS: inventário delimitado, experimento SQL e regressões locais. NO-GO: pacote instalável/execução hospedada.** O sync mínimo corrige transições quando um evento PUC alcança o AFTER trigger, mas não fecha revogação independente, não supera legitimamente o BEFORE validator e não prova propriedade da linha PTC compartilhada. Não basta passar testes positivos para pré-aprovar instalação.

Nenhuma escrita em produção/homolog, mudança de policies/roles/Auth, deploy ou publicação. Apenas SELECT no binding canônico `swzpzcwiasxmjutrmvkm`, conferido em `supabase/config.toml`. O commit `f47d87a422bb17d6d62212d7afbcd19b334ecd36` e relatório F2-B1 foram revisados: registram bloqueadores/candidatas, não correção implantada. Homologação não presumida equivalente.

## 1. Baseline hospedado confirmado

SELECTs em 18:03–18:08 UTC; sem PII. Consulta final novamente confirmou **PUC=0, PTC=0**, hashes inalterados e containment vigente. Zero linhas não elimina risco futuro.

| Objeto | Evidência atual |
|---|---|
| `sync_puc_to_ptc_fn()` | MD5 definição `4dc955897950bf70ee8e1072bbae1ff2`; postgres; VOLATILE, SECURITY DEFINER; search_path public; EXECUTE postgres/service_role somente |
| `validate_partner_user_client_fn()` | `dcafec82ec7147ab67ce17ab934d3619`; mesmo owner/DEFINER/path/ACL. Valida alvo e partner_clients ativo; NÃO autoriza ator |
| `trg_validate_puc` | BEFORE INSERT OR UPDATE ROW, habilitado O |
| `trg_sync_puc_to_ptc` | AFTER INSERT OR UPDATE ROW, habilitado O; não DELETE nem mudanças em profiles/user_roles/partner_users |
| `trg_puc_updated` | BEFORE UPDATE → tg_set_updated_at |
| `trg_ptc_updated_at` | BEFORE UPDATE → tg_ptc_updated_at; somente updated_at |
| partner_users | cinco triggers F1/gate/touch permanecem; nenhum deles sincroniza PTC |
| PUC | UNIQUE(partner_id,user_id,cliente_id), tipo CHECK monitoramento/tecnico/comercial/gestao, sem FK da projeção PTC |
| PTC | UNIQUE(partner_id,technician_user_id,cliente_id), sem coluna de origem PUC, assigned_by não prova origem |
| Ambas tabelas | RLS true, FORCE RLS false; grants CRUD e demais privilégios para anon/authenticated/service_role/postgres no snapshot |
| Policies | Sete nas duas tabelas, digest completo `04715951097eb34ad7e8f735f663d15a` |

PUC: `bf02_assignment_contract_containment` RESTRICTIVE ALL para anon/authenticated, USING false / WITH CHECK false, coexistindo com permissivas puc_insert/select/update. PTC: ptc_insert/select/update permissivas, sem containment equivalente. A regra PUC não contém automaticamente DEFINER ou serviços. **Não alterada.**

### Writers e consumidores SQL com referência direta às carteiras

| Assinatura | MD5 / papel |
|---|---|
| `assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text)` | `05938fe942c150b7c1f80d9486778d72`: sempre termina B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE após autenticação/tenant; EXECUTE postgres/service_role |
| `sync_puc_to_ptc_fn()` | Projeção por trigger, não writer autorizado pelo ator |
| `platform_private.b2b_save_technical_simulation(jsonb)` | `daad3c1554f370bb0456b4ea3afdeea7`: consumidor de carteira; não reaberto |
| `get_b2b_technician_client_detail_secure(uuid)` | `304d33925c6047ace48827405f77d426` |
| `get_b2b_technician_clients_secure(uuid,uuid)` | `959c240612344cfb2b8cd8a2052e384d`, lê active PTC |
| `get_b2b_user_client_detail_secure(uuid,text)` | `ec3014ffb145b12edd3ce0ca5b54d1cf` |
| `get_b2b_user_client_simulations_secure(uuid)` | `c35038e6e7c66889364ffebf462f92ce` |
| `get_b2b_user_clients_secure(uuid,text)` | `12165f5d4775a82fe07db9ca6eadadca` |
| `can_user_access_cliente(uuid,uuid)` | `c610786fc9f6d6a44453b9e63c91e974`: técnico aceita active PUC OU PTC; branches gestor/interno distintas |
| `can_user_access_cliente(uuid)` | `4c2eaf7ab10e204e7ad57d41cb418554`: ator auth.uid, parceiro escalar; técnico PTC, gestor PTC/partner_clients |

Busca lexical de funções é delimitada, não detecta necessariamente SQL dinâmico. ACL desses consumidores (exceto sync/writer fechado) inclui authenticated/service_role/postgres, DEFINER. Não confundir reader com writer nem afirmar auditoria funcional total deles.

Investigação read-only de código confirmou PTC independente em `src/pages/portal-parceiro/TecnicosProdutores.tsx:87–107` (insert/toggle), rota existente em App.tsx; hook PUC contido. Histórico `supabase/migrations/20260702145433_a3b67258-4f0a-42d0-8521-55790aa9d3a7.sql:257–281` fez backfill **PTC→PUC**. Logo existência de PUC e mesma chave não prova que PTC nasceu como projeção. Nenhum desses arquivos runtime foi alterado.

## 2. Contrato mínimo e limites

Experimento substitui **somente body do sync existente**, preservando assinatura, owner, DEFINER, path e ACL. Não instala helpers, tabelas, RPCs, triggers novos ou políticas. Não copia usuários nem transfere carteira.

- Identidades partner/user/cliente imutáveis no UPDATE: erro específico 23514 antes de qualquer escrita da projeção.
- Projeta ativo somente para active=true, tipo técnico, stored role técnico **e** role técnico atual, vínculo por par não revogado/vigente, parceiro ativo/não deletado com owner e tenant_id coerente. Não impõe profile.organization_id=owner universal, preservando o recorte de contexto legado; has_role segue contrato existente.
- Nos demais eventos PUC: UPDATE da **chave exata** PTC para active=false, sem DELETE, sem alterar identidade, assigned_by, notes ou registros de outro parceiro. Cleanup não exige elegibilidade atual do alvo.
- Repetição sem mudanças não escreve PTC/updated_at; upsert só altera active/notes se distintos. assigned_by existente é preservado como baseline.
- Isso **não autoriza o ator**. Exigir alvo elegível para projeção ativa não confere poder de criar/reativar. Não há branch de bypass por service_role/postgres, GUC ou claims inventadas.

### NO-GOs específicos reproduzidos

1. **Proveniência compartilhada:** direct PTC grant e projeção ocupam a mesma linha UNIQUE; experimento desativa também o grant independente de mesma chave. Não é seguro afirmar propriedade pelo assigned_by/timestamp/notes. Requer decisão explícita de semântica da relação ou reconciliação auditável, sem estruturas paralelas.
2. **BEFORE validator:** quando alvo fica inativo/sem role válido ou carteira partner_clients inativa, UPDATE cleanup pode falhar antes do sync. Mudar apenas AFTER não resolve. Não desabilitar validator em produção nem inventar exceção ampla.
3. **Revogação fora de PUC:** UPDATE user_roles/profiles/partner_users não dispara sync. Revogação sozinha deixa PTC ativo. Touch privilegiado PUC foi apenas simulado para provar limite, não proposto como fluxo paralelo.
4. **Concorrência de dependências:** updates da mesma PUC serializam pelo lock de linha; UPDATE de revogação em partner_users pode confirmar durante projeção e deixar revoked_at + PTC ativo. Lock só da PUC/ON CONFLICT não resolve revogação global; precisa contrato transacional coordenado e reader fail-closed.
5. **Ator:** writer canônico permanece indisponível, PUC contido e PTC possui escrita independente. Não há contrato provado de quem pode limpar grant legado/compartilhado. NO-GO de execução, sem bloquear preparação local de projeção.

## 3. Matriz e evidências locais efetivas

PostgreSQL descartável via socket `/tmp`, schema reduzido e Auth/has_role/h15 sintéticos claramente rotulados; bodies baseline sync/validator/helpers reais. **Não simula paridade de guards, JWT nem sessões Supabase.**

| Caso | Resultado observado |
|---|---|
| Baseline técnico→comercial | Resíduo active=true reproduzido |
| Candidato técnico INSERT / UPDATE→técnico | Projeção criada/reativada; fixture INSERT revertida |
| Técnico→comercial, stored role técnico→gestor | PTC desativado na chave exata |
| Role atual técnico→gestor + evento PUC | Desativado; role sem evento não possui gatilho de sync |
| active false/repetição false ou active sem mudanças | Desativado; repetição não altera PTC/updated_at |
| Revogação + evento PUC | Experimento desativa; revogação isolada mantém resíduo |
| Alvo inativo, sync isolado | Desativa sem consultar elegibilidade no branch cleanup |
| Mesmo alvo inativo com validator real | Erro esperado e nenhuma mudança — NO-GO pipeline |
| Mudança identidade | Candidato rejeita pelo código específico; validator também pode rejeitar antes |
| Parceiro B, mesmo usuário/cliente | Linha B independente preservada; isolamento de chaves, NÃO prova RLS tenant A/B |
| Direct grant na mesma chave A | Experimento desativa grant: NO-GO proveniência |
| Dois updates concorrentes na mesma PUC | Último serializado coerente com PTC, sem duplicação |
| Revogação concorrente fora PUC | Revogação confirmada com PTC ativo: NO-GO coordenação |
| Transação PUC rollback | PUC/PTC voltam ao snapshot |
| Containment local RESTRICTIVE false | INSERT authenticated negado; UPDATE zero linhas; nenhuma concessão ao sync |
| Rollback body | Hash exato baseline restaurado; dados não reativados |

**23 checks** no harness F2-B2; testes de bloqueadores são assertions do defeito, não PASS de segurança nem de instalação. Failures só aceitas com mensagem esperada e diferenças auditadas; nenhum SKIP/PASS mascarado.

Snapshots por cenário comparam PUC/PTC e confirmam profiles/policies inalterados; cenários intencionais de mudança de role/vínculo são isolados no setup. Snapshots NÃO abrangem todas as 286 tabelas nem constituem audit log persistente em produção. Corridas usam duas conexões e handshake após lock/projeção, não apenas espera para presumir ordenação. Não se certifica todas ordens, níveis de isolamento, deadlocks ou cargas.

Comandos executados:

- `bun run test -- src/test/saas/b2b-f2b2-sync-postgres.test.ts src/test/saas/b2b-f2b1-context-postgres.test.ts src/test/saas/b2b-f2b-helpers-postgres.test.ts`: **3 arquivos / 3 testes passaram**, rodada 18:07 UTC (F2-B2 23 checks, F2-B1 35, escalar 26).
- `python3 scripts/tests/b2b-f2b2-sync-local.py`: **23 checks**, audit de diffs e rollback exato, executado novamente.
- `bunx eslint src/test/saas/b2b-f2b2-sync-postgres.test.ts`: exit 0; não lint global.
- Typecheck separado não executado (harness automático); sem alegar PASS individual. Build automático observado **OK às 18:08:49 UTC** em `/tmp/observability/build-errors.log`, sem build manual. Teste F2-B2 final reexecutado às 18:08:57 UTC: 1/1 passou após adicionar assertion de 23 checks.

Não realizados: sessão real/login/logout/MFA, testes RLS hospedados A/B, mutation real, limpeza legada, APIs Storage/TTL, autorização de ator, homologação global, concorrência hospedada. Nada publicado.

## 4. Cliente, documentos e Storage

Desativar PTC remove **um** caminho técnico de leitura. Não revoga automaticamente acesso de PUC ainda ativo, partner_clients, roles internos, outras atribuições ou conteúdos já obtidos.

- Dois argumentos: ativo PUC ainda autoriza técnico mesmo após limpar PTC; gestor via partner_users não filtrando revoked_at. Não modificado.
- Um argumento: usa parceiro escalar e PTC para técnico; outros ramos mantidos. Não modificado.
- Live `can_user_access_arquivo(text,uuid)`, MD5 `1e83ee139ec2badd52195aa4e31843a3`: ramo cliente chama um argumento; admin/gestor possuem caminhos próprios.
- Live `cliente_storage_object_permitted(text)`, `bf3d7953c87973ed1abae5922d72c3a4`: path estrito, h15 tenant, cliente do mesmo tenant e `can_user_access_cliente(c.id)`. Não removidos esses guards.
- `check_cliente_dependencies(uuid)` `3d9ebe37fe49ce01a61d2ce56ab1662c`: prova ator/cliente no tenant antes de overload dois argumentos. Não transforma parâmetro alvo em impersonation.
- Policies de documentos e Storage permanecem intactas; nenhuma URL assinada testada/revogada. Cache e TTL podem conservar acesso temporário; limpeza da projeção não prova invalidação distribuída.

## 5. Pacote e rollback

Em `docs/auditorias`:

1. `vinculos-b2b-f2b2-baseline-20261018.sql`: body exato sync, hash/metadata/ACL; referência, não installer.
2. `vinculos-b2b-f2b2-preflight-readonly-20261018.sql`: SELECT de bodies/ACL, policies/triggers/constraints e contagens sem PII; classificação de linha sem PUC não prova origem.
3. `vinculos-b2b-f2b2-candidato-20261018.sql`: preflight baseline/ACL/overloads/trigger/validator/containment/digest; **parada incondicional** `F2B2_ACTOR_AND_PROJECTION_PROVENANCE_UNPROVEN`. Body experimental após marcador só executado no cluster descartável. Não pré-aprovável no estado atual.
4. `vinculos-b2b-f2b2-rollback-20261018.sql`: body candidato/ACL/owner/path verificados, restaura baseline e confirma hash. Não reativa grants nem reconstrói estados antigos; restores bug baseline exigem decisão/contenção. Nenhum DROP CASCADE.
5. Este relatório; regressões persistidas em `scripts/tests/b2b-f2b2-sync-local.py` e `src/test/saas/b2b-f2b2-sync-postgres.test.ts`.

Preflight completo local foi recusado por digest de policies sintéticas, corretamente. Body candidato e rollback executados integralmente no cluster descartável. **Não afirmar que preflight integral passou hospedado**. Não remover barreira para executar em produção por conta desses testes.

## 6. Próximo gate limitado — sem travar desenvolvimento independente

1. Definir com proprietário/auditor se PTC é relação independente ou projeção subordinada da mesma chave; sem prova, nenhuma desativação automática de grant compartilhado.
2. Provar gestão do registro original pelo ator via contrato existente e tenant correto; só então projetar cleanup monotônico active→false com identidades/capacidades imutáveis e auditoria/idempotência. Não abrir o RPC atualmente fechado.
3. Desenhar exceção mínima de cleanup no validator **dependente de autorização comprovada**, não de elegibilidade do alvo; sem essa autorização, parar esse writer.
4. Coordenar revogação/role e readers vigentes server-side; sync AFTER PUC isolado não é mecanismo de revogação global. Tratar em próximo recorte separado.
5. Revisão independente e RLS real A/B em ambiente fiel antes de qualquer autorização de instalação; manter policies falsas e UI de escrita fechadas.

F2-B2 preparação/testes localmente entregues. **Execução NO-GO por contrato/proveniência/pipeline**, não por dívidas não relacionadas de fiscal/SMTP/global parity.
