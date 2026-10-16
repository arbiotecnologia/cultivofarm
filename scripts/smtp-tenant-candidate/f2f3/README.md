# F2/F3 SMTP por empresa — candidato fechado

Base solicitada: `c922a18d57d998c347ae85f3c2e4db05212af310`. Não aplicar automaticamente.

## Revisão e promoção
1. Provar externamente o ref `swzpzcwiasxmjutrmvkm`; executar apenas `preflight.sql` read-only, comparar todos os triggers/constraints/ACL. Não reaplicar T1.
2. Auditor informou `smtp_tenant_controlled_diagnostics_closed` já aplicada: **não reaplicar** `20261016_smtp_f2f3.sql` nem T1. Revisar somente sucessor `20261016_smtp_executor_schema_acl.sql`, fora migrations até promoção pelo auditor. Exige gatefalse/service semUSAGEplatform_private, move apenas os dois coresprepare/finish preservando OID/body/owner/search_path/guards; schema `tenant_smtp_executor` não exposto via PostgREST, USAGE+EXEC somente service, sem CREATE e sem ampliar acesso às outras57funções. Wrappers públicos continuam INVOKER/contrato idêntico; rascunho/config/Vault/gates sem escrita.
3. Espelho completo revisável em `deploy/supabase/`: entrypoint real `functions/tenant-email-settings/index.ts`, GET/PUT intactos, POST teste/prova separados, deno.json/lock, imports `../../_shared/` resolvidos, compartilhados inclusos; config.toml é **somente fragmento** `verify_jwt=true`, não substitui config global. `entry-integration.ts.review` agora é cópia do entrypoint completo. `sync_mirror.py` mantém fontes espelhadas sem deploy. Aplicação futura deve preservar configuração/JWT e demais funções; não copiar paths scripts para runtime.
4. Provar Deno.resolveDns A/AAAA, TCP para literal IP e startTls+handshake com hostname original no runtime hospedado, usando somente fixtures públicas autorizadas e certificados válidos/invalid-host. `TENANT_PINNING_PROVEN=false` não pode mudar por prova local.
5. Somente depois da prova hospedada/revisão abrir gate específico e homologar sessão Admin real: conexão, cooldown 60s, envio confirmado após PASS da mesma versão em até 5min. Nenhum SMTP real foi exercitado pelo agente.

## Limitações importantes
- Parser numérico estrito/testado expande IPv6 comprimido, inclusive `2804:10:8016::216:80`. IPv4 192/8,198/8,203/8 e IPv6 2001/16 **não bloqueados integralmente**: aplica ranges especiais (IPv4 privado/CGNAT/link-local/documentação/protocolo/benchmark/multicast; IPv6 global2000::/3 sem2001::/23/documentação/6to4/6bone/AS112). Mapped/translated/NAT64/Teredo/ULA/zone/sintaxe ambígua rejeitados; validar TODOS A/AAAA antes de socket. Registro de ranges requer revisão continuada, não certificação universal.
- A/AAAA efetivos devem conter todos os endereços terminais; sem cadeia CNAME explícita enumerada. Se o resolver hosted não comprovar esse contrato, permanece NO-GO para host arbitrário. Pinning literal impede re-resolução na conexão, não substitui revisão do resolver/CA runtime.
- Alternativa se pinning/DNS hosted indisponível: somente rotas de provedores server-side previamente aprovadas e homologadas; não implementada aqui. Sem proxy genérico, host do browser ou TLS degradado.
- Service executor recebe credencial de Vault para um job/fence não consumido. Clientes anon/authenticated não executam prepare, nem leem refs/receipts/gate. HTTPS/Vault não garantem ausência de resposta RPC em logs de PostgREST/gateway/SQL: risco residual explícito, sem afirmar vazamento.
- Jobs órfãos bloqueiam novos testes; ambiguidade bloqueia novo envio mesmo com rotação. Sem retry/reclaim/reset automático. Recuperação humana auditada ainda não implementada, não desbloquear editando recibos manualmente.
- Outbox existente: diagnostics processing sem lease, max_attempts=1; claim global não os retoma. Gate/worker global/Auth permanecem fechados. SMTP250 não verifica domínio nem inbox.

## Testes locais
`bun run test -- src/test/comunicacao/tenant-smtp-f2f3.test.ts src/test/comunicacao/tenant-smtp-ui.test.tsx src/test/comunicacao/tenant-smtp-foundation.test.ts src/test/config/authProviderTopology.test.ts`

`python3 scripts/smtp-tenant-candidate/f2f3/test_sql.py` usa PostgreSQL descartável e marcador sintético somente, inclusive duas sessões concorrentes. `scan_local.py` é scanner focal, não certificação global. Checagem efetiva app exige `-p tsconfig.app.json`, não script raiz com references.

## Prova hosted temporária sem credencial
Após revisão/implantação **pelo auditor**, usar a mesma Edge com POST `?proof=pinning`, **sem corpo**, bearer do Admin AR real. Não capturar/exibir bearer. HOSTED_PROOF_ENABLED=true somente para esse caminho restrito e temporário; TENANT_PINNING_PROVEN=false continua independente. A RPC `tenant_smtp_test_context` precisa estar instalada/autorizada previamente; se ausente, falha fechada. Não usa prepare/finish/Vault/service client, nem envelope/AUTH/email; não lê ou altera configuração, nem salva a prova como conexão AUTH.

Servidor fixa AR007bb519-cba0-4704-be2c-cb93ad010048 e smtpi.kinghost.net/465, resolveA/AAAA, exige ambos presentes e todos públicos; TCP literal+startTls/handshake em todos resultados, inclusive IPv6. Negativo usa o mesmo IP e nome `smtp-name-mismatch.invalid`: só falha normalizada específica de certificado/hostname conta como rejeição, erro de rede não é PASS. Um deadline12s cobre toda prova e fecha retornos tardios; cooldown local60s/exclusão de invocation, não limite distribuído. Retorna só booleanos/códigos, nenhum IP/host/certificado/erro bruto. Indisponibilidade IPv6/TLS/DNS => FAIL, jamais habilitação automática.

Auditor deve conferir no runtime real ausência de re-resolução, SNI/certificado obrigatório e respostas terminais DNS, guardar somente códigos/booleanos e desativar/remover o caminho (`HOSTED_PROOF_ENABLED=false`) após coleta. Prova não abre gate SQL nem valida AUTH/config/remetente/inbox. O agente não executou a prova hosted nem fez conexão remota nesta rodada.

## Correções do núcleo compartilhado
readSmtpResponse espera CRLF completo (250 O incompleto), verifica status multiline consistente,16KiB/64linhas e um deadline por resposta, preserva resto do chunk em WeakMap por socket sem credenciais. Comandos e MIME usam writeSmtpBytes integral, short writes/zero/deadline sem loop tardio. F2/F3 deixou de depender do wrapper redundante. DNS+TCP+TLS têm **um prazo4s**, inferior ao step padrão5s; core fecha conexões/upgrades que chegam após timeout, inclusive timeout absoluto do probe.

## Rollback
Fechar Edge pinning/gate primeiro; `rollback.sql` revoga wrappers e cores, restaura trigger fechado, preserva histórico/outbox/settings/Vault. Não apagar jobs nem segredos. Não executado remotamente.
Se deltaACL aplicado, executar **primeiro** `rollback_executor_schema_acl.sql` (fecha gate, revoga executor, move cores de volta semEXECservice, revogaUSAGEdedicado, mantém schema vazio), depois rollback.sql. Rollback fechado, não restaura capacidade operacional; ambos idempotentes em testes. Sem grantUSAGEglobal, sem tocarACLdas funções alheias. Harness reproduz erro hosted antes do delta, prepare/finish positivos e negativos sob SETROLEservice_role real, e fixtureB sintética emBEGIN/ROLLBACK com settings/receipts/refs0 e gatefalse; históricoA local preservado. Não equivale a execução hosted.