# SMTP F2/F3 — revisão local, não homologação de produção

## 1. Decisão
HTTPS + Vault vigente; KMS adiado. Candidato conexão e envio controlado, sem aplicação SQL, deploy/publicação ou email real.

## 2. Base
Base recebida c922a18d57d998c347ae85f3c2e4db05212af310; snapshots/commits geridos pelo ambiente, nenhum checkout/commit manual. Diff contra essa base.

## 3. Evidência externa
Titular informou inicialmente AR Bio007bb519-cba0-4704-be2c-cb93ad010048/versão1, e em02:02 confirmou correção **pelo Admin** para smtpi.kinghost.net/versão2. DNS informado A191.6.216.80/AAAA2804:10:8016::216:80; TLS local oficialPASS1.3/hostantigoFAILnameMismatch, nenhumaAUTH. São evidências externas, não reproduzidas pelo agente. Configuração/credencial reais não lidas nem editadas nesta revisão; flags DRAFT/dispatchfalse/sender_verifiedfalse preservadas.

## 4. Auditoria do existente
Revisados native-smtp-client, smtp-provider-probe/deno, test-communication-email, worker e migrations outbox. Diagnóstico global e worker continuam indisponíveis; reutilizado núcleo TLS/EHLO/AUTH/SMTP existente, não fila/módulo paralelo.

## 5. Autoridade
getUser+bearer, auth.uid, Admin ativo/pronto não Superadmin, organização ativa e email confirmado server-side. Contexto inclui actor/org/version; resposta tardia revalidada. Claim guarda iat real e prepare revalida invitation fence, sem substituir identidade pelo JWT service.

## 6. Contrato
POST somente modo/version/idempotency_key/confirm_send; rejects tenant/host/credencial/destinatário/actor arbitrários. Corpo 1KiB, no-store, erros sanitizados. GET/PUT de rascunho preservados.

## 7. SQL/ACL
SQL aditivo fora migrations, gate privado false; wrappers públicos INVOKER e cores privados DEFINER/search_path vazio. Prepare/finish service-only, prepare por job/fence/actor não consumido; cliente nunca recebe senha. Preflight compara schema/triggers antes de qualquer promoção. Sem nova tabela pública.
Delta02:10 move somente coresprepare/finish para tenant_smtp_executor, comUSAGE+EXECservice específico/semCREATE, schema não exposto PostgREST. ALTERFUNCTIONSETSCHEMA preservaOID/body/owner/guards e acessos internos comoDEFINER. Não concedeUSAGEplatform_private nem alteraEXECdas demais57funções; wrappers públicosINVmantidos. Preflight exige gatefalse eACLcanônica, colisões/schemaowner inválidos falham fechados; aplicação idempotente testada.

## 8. Outbox
Eventos sintéticos processados e jobs na outbox existente. Ticket privado txid/actor/org prova única exceção INSERT; caminhos legados continuam NULL. Jobs processing/max_attempts1/leaseNULL não elegíveis ao claim global. Recibos privados são autoridade, não fila paralela.

## 9. CAS e concorrência
Lock por organização antes de row locks, CAS claim+prepare, chave idempotente por actor/org. Replay não fornece novo executor. Cooldown60s, conexão da mesma versão+actor em5min para send. Dois clientes PostgreSQL locais provaram apenas um claim.

## 10. SSRF/TLS
A+AAAA completos validados antes de TCP, literal IP pinado, hostname original em startTls/handshake, certificado obrigatório. Parser numérico testado aceita IPv6 comprimido KingHost e públicos em192/8,198/8,203/8,2001/16, sem bloquear inteiros arbitrários. Exclui faixas especiais/mapped/translated/NAT64/Teredo/6to4/documentação/ULA e sintaxe ambígua. DNS+TCP+TLS compartilham deadline4s; sem fallback. CNAME terminal/resolver hosted permanece critério de prova, não fato já certificado.

## 11. Prova runtime e portas
Docs Supabase limits bloqueiam25/587;465 candidata, não disponibilidade garantida. Deno2.6.10 local comprovou literalIP+hostname original e rejeitou hostname errado em fixture TLS local. Source upstream sugere APIs presentes, mas não prova build hosted. TENANT_PINNING_PROVEN=false. CNAME terminal/resolver hosted não comprovados; alternativa segura descrita no README: rotas server-side homologadas, não implementadas.

## 12. Partial writes/timeouts
Núcleo compartilhado agora espera CRLF completo/status multiline consistente/16KiB/64linhas e deadline único por resposta, preserva próximo frame por socket. writeSmtpBytes completa comandos e MIME, zero/invalid write falha, timeout não retoma loop. F2/F3 não depende de completeWrites redundante. Core fecha connect/startTls tardios e probe com deadline absoluto; AUTH/conexão15s/SMTPresponse3s permanecem. Pós-DATA incerto ambiguous sem retry;550 explícito definitivo.

## 13. Segredo e logs
Credencial somente Vault->prepare service autorizado->memória executor, sem UI/cache/audit/console/exceptions brutas; JS não promete zeroização física. HTTPS em trânsito/Vault em repouso não provam ausência de bodies RPC de prepare, p_password T1 ou parâmetros/contextos SQL em logs de infraestrutura. Revisar retenção/acesso/configuração administrativa; nenhum vazamento afirmado nem KMS exigido.

## 14. Estado/ambiguidade
Conexão somente TLS+AUTH, nenhum envelope/DATA. SMTP250 significa aceite, não inbox/remetente verificado; flags permanecem false. Finish audit sanitizado mesmo após revogação; falha de finish/prepare deixa job bloqueado, sem segunda execução. Ambiguous impede novos sends; recuperação humana auditada não implementada e permanece blocker de recuperação, não de segurança fail-closed.

## 15. UI
Na seção existente, conexão+confirmação+envio, senha limpa, lock, generation/scope fencing e mensagens seguras. Vitest verifica troca de identidade/respostas tardias/duplo clique/cache. Playwright sintético1280×1800/390×844: conexão->envio, duas chamadas, senha vazia/sem overflow, screenshots inspecionadas. Erros iniciais de import CommonJS do harness corrigidos; não erro do app. Não E2E autenticado hosted.

## 16. Evidências locais
Vitest focal e regressões, SQL descartável com Auth/Vault sintéticos e rollback, lint/scanner/diff-check executados; resultados finais no adendo abaixo. Build automático observado OK. Typecheck efetivo app **UNVERIFIED nesta rodada**: execução manual proibida pelo ambiente; build/root files[] não são substitutos. Auditor precisa checar -p tsconfig.app.json antes de promoção. Nenhum teste Edge remoto usado, ref externo não comprovável nessas ferramentas.

## 17. Arquivos e rollback
Pacote scripts/smtp-tenant-candidate/f2f3 inclui espelho deploy completo, hosted-proof/sync_mirror e entrypoint completo; compartilhados smtp-provider-probe/native-smtp-client corrigidos, testes/AGENTS/roadmap/relatório/manifesto. Sem dependência/rota/Auth/global/worker/configuração hosted alterada. Rollback fecha gate/revoga cores+wrappers/restaura INSERT fail-closed preservando dados; desativar HOSTED_PROOF_ENABLED no entrypoint remove a prova temporária. **Revisável, não ativado hosted** até revisão independente, typecheck e prova pinning/DNS+E2E Admin reais pelo auditor; não solicitar credencial real ao titular.

### Revisão independente179e84e — delta02:02
135VitestPASS informado externamente, typecheck app ainda em execução. SQL42501 de contexto agora HTTP403 (sem execução). Prova temporária na Edge existente, somente Admin AR server-proven, hostfixo465, TLSA/AAAA e negativo hostname mismatch, sem senha/secret/Vault/AUTH/email/config write, resposta boolean/códigos. Deadline12s e cooldown60s locais; não rate-limit distribuído. TENANT_PINNING_PROVEN=false, não abre gates. Descrição operacional precisa no README; prova não executada hosted pelo agente.

Referências: https://supabase.com/docs/guides/functions/limits ; https://docs.deno.com/api/deno/~/Deno.startTls ; https://docs.deno.com/api/deno/~/Deno.connectTls ; https://github.com/supabase/edge-runtime/blob/main/ext/runtime/ops/net.rs .

### Resultado final local
Revisão atual:194/194 Vitest (58hardening,65F2/F3,57fundação,11UI,3topology),15/15 Deno core,32 checks SQL descartável incluindo corrida de duas sessões,21/21 scanner focal,lint focal sem achados e diff-check limpo. Espelho deno check --frozen PASS com imports completos. Build automático02:08:29Z OK. Typecheck efetivo app não executado/verificado nesta rodada (erro inicialTS2493 no mockrpc corrigido, sem confirmação app dedicada posterior); auditor segue responsável por -p tsconfig.app.json. Prévia desktop/mobile anterior apenas sintética, não prova de conexão/envio reais, nenhuma nova prova hosted executada nesta revisão. Snapshot observado537423ddd7e5bed4245ac17bb5f0b29b5d939648 antes da finalização documental; manifesto/documentação geram sucessor automático. SQL/preflight/rollback candidatos inalterados nesta revisão, nenhuma migration remota/fundação reaplicada.

### Achado hospedado02:10 — aplicação externa e sucessor ACL local
Auditor informou migration smtp_tenant_controlled_diagnostics_closed(SQL179e84e) aplicada comgatefalse/configARv2 preservado;31SQLPGlitePASS/7identidades reais comclaims simulados context/deny/ACL/gatefalsePASS. FixtureFSFsintéticaROLLBACKservice_role falhou prepare por permission denied for schema platform_private; has_schema_privilege=false,57coresprivados jáEXECservice. Auditor informou rollbacktotal gatefalse/receipts0/FSFsettings0, nenhuma senhaARlida. Não reproduzido remotamente pelo agente.

Entregues 20261016_smtp_executor_schema_acl.sql e rollback_executor_schema_acl.sql fora migrations (não aplicação remota). Ordem rollbackACL antes do legado; fecha gate/revoga executor/movecoresdevolta semEXECservice/schema vazio preservado. SQLfundaçãoF23 não reaplicado no hosted; execução repetida somente descartável para teste. Harness agora retiraUSAGEplatform_private(service) antes do delta e usaSETROLEservice_role emprepare/finish/replay/forgedactor/invitationfence/sendambiguous; funçãoalheiaEXECservice permanece inacessível. FixtureB transacional comprova settings/receipts/refs0, outboxbaseline e gatefalse semDELETElimpeza; não lê segredoAR. Demais resultados anteriores permanecem históricos, typecheck app/prova hosted ainda pendentes; sem Auth/global/outboxruntime/UI alterados neste delta.
Validação final do delta:47SQLchecks incluindo reproduçãoexata permissiondeniedschema e corrida,65/65Vitest F23,23/23scanner,diff-checkPASS; build automático02:13:26OK. Nenhum arquivoTS alterado nesta revisãoACL; lintTS/typecheck anteriores não reclassificados como prova nova. Falha inicial do harness de fixture por TEMPwork ausente emnova sessão foi corrigida com tabela temporária própria por sessão e testes repetidosPASS, não errohosted. Manifesto regenerado para incluir ambosSQLnovos e docs/testes; aplicação e prova runtime ficam a cargo do auditor.