# P1 técnico — candidato local sobre 85eeb6c

## Adendo focal UI/GPS — 2026-10-09 21:19 UTC
Continuação em `visita-wizard-gps-20261009.md`: GPS ativo8s/melhorfix, enums diagnóstico, flags/workspace e campo serializado;33/33tests locais, sem fixtures/banco/publicação. Check-in35cc6812-f845-47c2-8130-6e82d707dec2 com precisão4116m, campo031d8f12-ea00-4b09-a142-5f44ef6d039f e diagnósticoaac6ca1d-d106-4917-87de-6c0a495e75db são persistências independentes relatadas, preservadas sem coordenadas nos artefatos.
Migration20261009210536 approval tenant fence aplicada independentemente no canônico foi arquivada pelo SQL exato fornecido, **sem reaplicar**. FSF reprovar passou de status_invalido para forbidden_visita; reabrir/ajuste forbidden_visita.7claimsSQLrollback/29frontendPASS independentes não equivalem JWTFSF, não somados a testes Lovable. Culturas8/dropdown consultorPASSfocal relatado, sem inserts. Writers automáticos/DEFINERglobais e NO-GOintegral permanecem.

## Adendo supersedente — aplicação independente 2026-10-09 20:46 UTC
**Contenção RPC/helper/RLS aplicada independentemente; PASS focal SQL relatado. Auditoria global de writers e fases maiores continuam NO-GO/UNVERIFIED.** As seções anteriores abaixo descrevem o estado histórico anterior à aplicação, não o estado remoto atual.

O solicitante informou aplicação por Supabase MCP oficial, com `project_id=swzpzcwiasxmjutrmvkm`, link canônico e `success:true`. Migration `technical_tenant_rpc_containment`, ledger versão **20261009204546**. Nesta continuação houve somente leitura do ledger e arquivamento, **sem reaplicar, executar testes remotos ou modificar banco**. A comprovação de destino da aplicação é a evidência independente explícita; o literal `requested_ref` das consultas anteriores continua não sendo prova.

### Arquivo exato e diferença verificada
Arquivo permitido: `scripts/rbac-audit/20261009204546_technical_tenant_rpc_containment.sql`, extraído dos statements do ledger, sem reconstruir SQL a partir do candidato. Ledger contém um statement; bytes UTF-8 preservados via base64, MD5 conferido com o retorno SQL: `dd48a1241ca0b81636e047d49ae78723`; 32.234 bytes; SHA-256 `b7f68715dd1e6396694a936a901b7a214754a5e7eefc9cf6c1053af07513bc47`.

Comparação com candidato histórico **c19774e**: conteúdo exato após remover o bloco inteiro iniciado em `-- Definer writes must cross...` até antes de `rpc_listar_atendimentos_tecnicos_v1`, além das duas linhas de comentário explicativas acrescentadas no início do aplicado. Demais helpers, policies e RPCs coincidem. **`technical_row_tenant_guard` e seus dois triggers NÃO foram aplicados.** O candidato e harness locais permanecem históricos, sem alteração.

Motivo da exclusão: revisão independente identificou writer service-role em `supabase/functions/sync-calendar-event/index.ts:139` que atualiza `portal_solicitacoes.external_event_id`; o trigger indiscriminado poderia bloquear essa integração ainda não certificada. Não se declara a integração segura nem seu funcionamento testado. Auditoria automática/DEFINER global permanece **UNVERIFIED**; não há contenção geral de writers por esse trigger no subset aplicado.

### Reteste independente relatado — claims SQL no canônico
| Ator | Resultado informado |
|---|---|
| Consultor responsável | view/manage true; lista 1; resumo todos 1; fazendas 1 |
| Administrador AR Bio | view/manage true; lista 1; fazendas 2 |
| Administrador FSF | view/manage false; lista 0; resumo todos 0 |
| Financeiro | view false; lista forbidden |
| Superadmin sem tenant | ready false; lista unauthenticated |
| Ator forjado admin AR Bio sob outros atores | false |

Estes resultados são **medições independentes relatadas**, não execução Lovable, não JWT real e não reteste browser pós-fix. As **37 asserções locais anteriores testaram o candidato completo, incluindo trigger excluído**, e **não certificam o subset aplicado**; os 25 testes Vitest anteriores também não foram reexecutados nesta continuação nem transferidos como PASS do subset.

### Fixtures e preparação autorizada
Ocorrência real fictícia `098fa34f-1cce-4820-af52-7b22a07a49b7`, código **VT-2026-0001**, foi criada pelo consultor na prévia **antes** da aplicação e permanece rascunho, segundo relato independente. O UPDATE pré-fix para cliente controle sem carteira foi rejeitado com **42501**, seguido de rollback; fixture preservada. Isso não é prova de escrita pós-fix nem certificação completa de lifecycle.

Seed `user_clientes` **751e07ea-cdcd-4843-b76d-ed2dfa1416df**, via conector, é **preparação autorizada** para o cliente principal, execute/principal; **não é fluxo de atribuição pela UI certificado**. Não criamos/alteramos/excluímos fixtures ou identidades nesta rodada.

### Decisão atual e rollback
Bloqueio histórico de aplicação superado pela aplicação independente explícita, sem alteração de binding local. **PASS focal de contenção nos canais retestados por claims SQL; NO-GO integral/fases maiores**. Writers automáticos/DEFINER, concorrência e browser/JWT pós-fix seguem UNVERIFIED. Forward-fix deve preservar contenção e revisar writers individualmente; não restaurar helpers globais nem instalar o trigger excluído sem revisão/provas próprias. Sem publicação, emails/push/WhatsApp, cobrança ou fiscal; B2B gatesfalse, Executivo19 e emailv9 preservados.

## Estado e bloqueio concreto
**Estado histórico pré-aplicação:** PASS local focal / NO-GO remoto; migration ainda não aplicada naquele momento. Supersedido pelo adendo acima.

A ferramenta de leitura não comprova o destino: `supabase.project_ref`, `app.settings.project_ref` e `app.settings.supabase_url` retornaram NULL. O `requested_ref` das consultas anteriores era literal enviado na consulta, **não prova do destino**. Configuração/cliente apontam para `swzpzcwiasxmjutrmvkm`, mas a ferramenta de migration não aceita ref nem fornece preflight de binding. A regra canônica exige interromper escrita sem prova; nenhuma tentativa de migration foi feita.

Desbloqueio: ferramenta oficial deve comprovar `swzpzcwiasxmjutrmvkm` antes da escrita. Não trocar cliente nem usar Cloud. Depois revisar/submeter candidato completo por migration oficial e executar provas rollback canônicas. Não pedir novas credenciais/identidades.

## Evidências separadas
- Relato independente: consultor real criou ocorrência `098fa34f-1cce-4820-af52-7b22a07a49b7`; browser mostrou fazenda principal e dois talhões após refresh. Carteira foi seed administrativo, não prova provisionamento UI. Admin FSF com claims simulados: SELECT zero/helper true/lista um/resumo 1/1/1. Não reproduzimos esse request autenticado.
- DDL retornado pela ferramenta: bypass administrador sem tenant nos helpers; lista/resumo DEFINER herdavam autorização; solicitações sem restrictive tenant. Leitura não comprova binding operacional.
- MD5 de bodies históricos coincide com retorno para criar `9e53b44a5af92f7c22dfd89762b98f29`, iniciar `572535a7d0d98983e03d640070e61f86`, listar `a6e5ff8c68212a7b990125ddb04aa4c6`, resumo `4e030226470b06ea68a52e9084984383`.
- PostgreSQL isolado executa quatro RPCs reais, policies representativas e claims/Auth simulados. DDL reduzido; não prova RLS global/triggers/FKs completos, JWT ou browser.

## Candidato auditável
`scripts/rbac-audit/technical-tenant-containment.sql` não é migration aplicada:
- Ator igual a auth.uid, iat positivo/numérico, perfil ativo/permanente, organização ativa e fence de primeiro acesso existente. Claims malformados retornam false antes de casts legados.
- Helpers view/manage/responsável/participante/gestor exigem tenant e cliente→fazenda→talhão. Técnicos dependem de carteira vigente/não revogada; manage mantém responsável com execute/manage. Admin/gestor somente no próprio tenant.
- Solicitações e visitas recebem restrictive de referências sem consultar a própria tabela dentro do predicado, evitando recursão. Policies permissivas não são substituídas; produtor usa vínculo canônico existente no helper.
- Trigger de INSERT/UPDATE cobre escritores DEFINER, sem bypass service-role. Produtores sem ator ficam fechados; revisar todos os callers automáticos antes da aplicação.
- Lista/resumo filtram demandas pelo helper; visita invisível não suprime demanda. Assinaturas e payload preservados.
- Criação autoriza antes do replay; ambos os ramos exigem visita administrável e referências iguais. Iniciar valida solicitação antes do lock e visita antes de retornar replay.
- P2 fazendas conta fazendas acessíveis pela carteira/listagem no tenant, inclusive antes da primeira visita, não fazendas presentes em visitas.
- Nenhuma mudança UI/guard/papel/catálogo/B2B gate/Executivo19/emailv9.

## Testes e limites
37 asserções PostgreSQL: quatro baselines de vazamento; negativas FSF/ator forjado/financeiro/noorg/anon, iat ausente/malformado/antigo, perfil inativo, papel/carteira revogados, referências cruzadas; positivos responsável/admin A, request e update próprios, criar/repetir/iniciar pelos bodies reais e fazenda antes da primeira visita. Banco descartável/transação rollback, sem inserts com IDs reais.

Runner persistente `src/test/visita/technicalTenantPostgres.test.ts`; resultados da rodada registrados no roadmap, sem somar contagens sobrepostas. Helpers auxiliares/DDL reduzidos: positivos produtor/participante e concorrência multiconexão ainda não certificados. Triggers atuais e writers automáticos exigem revisão antes de aplicar.

Validação desta execução: **25/25 Vitest em quatro arquivos PASS**, incluindo runner PostgreSQL com 37 asserções (não somar como 62 testes); lint focal do runner, scanner de segredos e diff-check PASS. Prévia automática build OK20:35:57UTC. Typechecks app/node separados **NOT RUN** por proibição ambiental de execução manual; não atribuídos a outra medição. Lint global não reexecutado, sem alegação de PASS integral.

Arquivos: candidato SQL, harness Python/SQL, teste Vitest, este relatório, adendo `retomada-delta-2026-10-08.md`, `roadmap.md` e regra em `AGENTS.md`. Nenhum arquivo em `supabase/migrations/` criado/editado manualmente. Commit observado após artefatos/testes: `7678576cd7ea446e9599c783097fb9d1d9db3938`, antes deste fechamento documental; Git stateful não executado.

## Rollback e decisão
Rollback seguro é forward-fix ou fechamento temporário, nunca restaurar bodies/policies globais vazantes. Sem aplicação não há rollback remoto. Candidato não faz backfill, update ou exclusão de registros. Fixtures fornecidos intactos; sem Auth novo/senha/envios/fiscal/cobrança/publicação.

**Authenticated path: UNVERIFIED.** Pós-fix remoto/JWT/browser/Storage/concorrência real UNVERIFIED. Contenção produção NO-GO até aplicação comprovada e testes canônicos.