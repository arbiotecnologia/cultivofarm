# SMTP F2/F3 — revisão local, não homologação de produção

## 1. Decisão
HTTPS + Vault vigente; KMS adiado. Candidato conexão e envio controlado, sem aplicação SQL, deploy/publicação ou email real.

## 2. Base
Base recebida c922a18d57d998c347ae85f3c2e4db05212af310; snapshots/commits geridos pelo ambiente, nenhum checkout/commit manual. Diff contra essa base.

## 3. Evidência externa
Titular informou AR Bio 007bb519-cba0-4704-be2c-cb93ad010048, versão1, smtpi.refilinformatica.com.br,465 implicit_tls, remetente teste@refilinformatica.com.br, credential_configured=true/DRAFT/dispatch=false/sender_verified=false. Informação não relida pelo agente; configuração e credencial reais intocadas.

## 4. Auditoria do existente
Revisados native-smtp-client, smtp-provider-probe/deno, test-communication-email, worker e migrations outbox. Diagnóstico global e worker continuam indisponíveis; reutilizado núcleo TLS/EHLO/AUTH/SMTP existente, não fila/módulo paralelo.

## 5. Autoridade
getUser+bearer, auth.uid, Admin ativo/pronto não Superadmin, organização ativa e email confirmado server-side. Contexto inclui actor/org/version; resposta tardia revalidada. Claim guarda iat real e prepare revalida invitation fence, sem substituir identidade pelo JWT service.

## 6. Contrato
POST somente modo/version/idempotency_key/confirm_send; rejects tenant/host/credencial/destinatário/actor arbitrários. Corpo 1KiB, no-store, erros sanitizados. GET/PUT de rascunho preservados.

## 7. SQL/ACL
SQL aditivo fora migrations, gate privado false; wrappers públicos INVOKER e cores privados DEFINER/search_path vazio. Prepare/finish service-only, prepare por job/fence/actor não consumido; cliente nunca recebe senha. Preflight compara schema/triggers antes de qualquer promoção. Sem nova tabela pública.

## 8. Outbox
Eventos sintéticos processados e jobs na outbox existente. Ticket privado txid/actor/org prova única exceção INSERT; caminhos legados continuam NULL. Jobs processing/max_attempts1/leaseNULL não elegíveis ao claim global. Recibos privados são autoridade, não fila paralela.

## 9. CAS e concorrência
Lock por organização antes de row locks, CAS claim+prepare, chave idempotente por actor/org. Replay não fornece novo executor. Cooldown60s, conexão da mesma versão+actor em5min para send. Dois clientes PostgreSQL locais provaram apenas um claim.

## 10. SSRF/TLS
A+AAAA completos validados antes de TCP, literal IP pinado, hostname original em startTls/handshake, certificado obrigatório. DNS/TCP/TLS com deadline4s e sem fallback; algoritmo conservador bloqueia ranges especiais e desconhecidos. IPv6 comprimido e blocos públicos amplos recusados: disponibilidade limitada explicitamente.

## 11. Prova runtime e portas
Docs Supabase limits bloqueiam25/587;465 candidata, não disponibilidade garantida. Deno2.6.10 local comprovou literalIP+hostname original e rejeitou hostname errado em fixture TLS local. Source upstream sugere APIs presentes, mas não prova build hosted. TENANT_PINNING_PROVEN=false. CNAME terminal/resolver hosted não comprovados; alternativa segura descrita no README: rotas server-side homologadas, não implementadas.

## 12. Partial writes/timeouts
Wrapper completa short writes, zero/invalid write falha, socket fechado impede continuação. AUTH/conexão15s, SMTP response3s, late sockets fechados; DNS travado não inicia TCP. Pós-DATA incerto vira ambiguous, nunca retry automático;550 explícito é falha definitiva.

## 13. Segredo e logs
Credencial somente Vault->prepare service autorizado->memória executor, sem UI/cache/audit/console/exceptions brutas; JS não promete zeroização física. HTTPS em trânsito/Vault em repouso não provam ausência de bodies RPC de prepare, p_password T1 ou parâmetros/contextos SQL em logs de infraestrutura. Revisar retenção/acesso/configuração administrativa; nenhum vazamento afirmado nem KMS exigido.

## 14. Estado/ambiguidade
Conexão somente TLS+AUTH, nenhum envelope/DATA. SMTP250 significa aceite, não inbox/remetente verificado; flags permanecem false. Finish audit sanitizado mesmo após revogação; falha de finish/prepare deixa job bloqueado, sem segunda execução. Ambiguous impede novos sends; recuperação humana auditada não implementada e permanece blocker de recuperação, não de segurança fail-closed.

## 15. UI
Na seção existente, conexão+confirmação+envio, senha limpa, lock, generation/scope fencing e mensagens seguras. Vitest verifica troca de identidade/respostas tardias/duplo clique/cache. Playwright sintético1280×1800/390×844: conexão->envio, duas chamadas, senha vazia/sem overflow, screenshots inspecionadas. Erros iniciais de import CommonJS do harness corrigidos; não erro do app. Não E2E autenticado hosted.

## 16. Evidências locais
Vitest focal e regressões, SQL descartável com Auth/Vault sintéticos e rollback, lint/scanner/diff-check executados; resultados finais no adendo abaixo. Build automático observado OK. Typecheck efetivo app **UNVERIFIED nesta rodada**: execução manual proibida pelo ambiente; build/root files[] não são substitutos. Auditor precisa checar -p tsconfig.app.json antes de promoção. Nenhum teste Edge remoto usado, ref externo não comprovável nessas ferramentas.

## 17. Arquivos e rollback
Pacote scripts/smtp-tenant-candidate/f2f3/{SQL,rollback,preflight,contract,handler,dispatch,executor,pinned-transport,review runtime/integração,test_sql,scanner,README,SHA256SUMS}; tenantSmtp.ts, TenantEmailSettings.tsx, dois testes, AGENTS/roadmap/relatório. Não alterou dependências/rotas/Auth/global/worker/deployed functions. Rollback fecha gate/revoga cores+wrappers/restaura INSERT fail-closed preservando dados. **Revisável, não pronto para ativação hosted** até revisão independente, typecheck e prova pinning/DNS+E2E Admin reais pelo auditor; não solicitar credencial real ao titular.

Referências: https://supabase.com/docs/guides/functions/limits ; https://docs.deno.com/api/deno/~/Deno.startTls ; https://docs.deno.com/api/deno/~/Deno.connectTls ; https://github.com/supabase/edge-runtime/blob/main/ext/runtime/ops/net.rs .

### Resultado final local
135/135 Vitest (64 F2/F3,57 fundação,11 UI,3 topology),32 checks SQL descartável incluindo corrida de duas sessões,17/17 scanner focal,lint focal sem achados e diff-check limpo. Build automático01:58:23Z OK. Typecheck efetivo app não executado/verificado nesta rodada. Prévia desktop/mobile apenas sintética PASS, não prova de conexão/envio reais. Snapshot funcional observado8edcbd6b3bd6614675c93800467c5a3abec625f4; documentação/manifesto podem gerar snapshot sucessor automático.