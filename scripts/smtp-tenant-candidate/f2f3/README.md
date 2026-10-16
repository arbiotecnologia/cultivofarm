# F2/F3 SMTP por empresa — candidato fechado

Base solicitada: `c922a18d57d998c347ae85f3c2e4db05212af310`. Não aplicar automaticamente.

## Revisão e promoção
1. Provar externamente o ref `swzpzcwiasxmjutrmvkm`; executar apenas `preflight.sql` read-only, comparar todos os triggers/constraints/ACL. Não reaplicar T1.
2. Revisar delta `20261016_smtp_f2f3.sql`; após aprovação independente, atribuir versão nova de migration. Gate F2/F3 nasce false, sem tocar rascunho/config/Vault existente.
3. Integrar os arquivos ao **mesmo** `tenant-email-settings`, conservando GET/PUT e verify_jwt. `entry-integration.ts.review` é trecho de integração, não entrypoint executável. Colocar arquivos em `f2f3/`; imports compartilhados deste diretório deverão apontar para `../../_shared/`, e imports T1 para `../handler.ts`/`../_shared/contract.ts`. Não usar paths de `scripts` em deploy.
4. Provar Deno.resolveDns A/AAAA, TCP para literal IP e startTls+handshake com hostname original no runtime hospedado, usando somente fixtures públicas autorizadas e certificados válidos/invalid-host. `TENANT_PINNING_PROVEN=false` não pode mudar por prova local.
5. Somente depois da prova hospedada/revisão abrir gate específico e homologar sessão Admin real: conexão, cooldown 60s, envio confirmado após PASS da mesma versão em até 5min. Nenhum SMTP real foi exercitado pelo agente.

## Limitações importantes
- IPs especiais/ desconhecidos são recusados conservadoramente: IPv4 192/8,198/8,203/8 inteiros; IPv6 comprimido e 2001/16 inteiro também recusados. Não é suporte universal a provedores. Nunca relaxar para resolver falha de DNS.
- A/AAAA efetivos devem conter todos os endereços terminais; sem cadeia CNAME explícita enumerada. Se o resolver hosted não comprovar esse contrato, permanece NO-GO para host arbitrário. Pinning literal impede re-resolução na conexão, não substitui revisão do resolver/CA runtime.
- Alternativa se pinning/DNS hosted indisponível: somente rotas de provedores server-side previamente aprovadas e homologadas; não implementada aqui. Sem proxy genérico, host do browser ou TLS degradado.
- Service executor recebe credencial de Vault para um job/fence não consumido. Clientes anon/authenticated não executam prepare, nem leem refs/receipts/gate. HTTPS/Vault não garantem ausência de resposta RPC em logs de PostgREST/gateway/SQL: risco residual explícito, sem afirmar vazamento.
- Jobs órfãos bloqueiam novos testes; ambiguidade bloqueia novo envio mesmo com rotação. Sem retry/reclaim/reset automático. Recuperação humana auditada ainda não implementada, não desbloquear editando recibos manualmente.
- Outbox existente: diagnostics processing sem lease, max_attempts=1; claim global não os retoma. Gate/worker global/Auth permanecem fechados. SMTP250 não verifica domínio nem inbox.

## Testes locais
`bun run test -- src/test/comunicacao/tenant-smtp-f2f3.test.ts src/test/comunicacao/tenant-smtp-ui.test.tsx src/test/comunicacao/tenant-smtp-foundation.test.ts src/test/config/authProviderTopology.test.ts`

`python3 scripts/smtp-tenant-candidate/f2f3/test_sql.py` usa PostgreSQL descartável e marcador sintético somente, inclusive duas sessões concorrentes. `scan_local.py` é scanner focal, não certificação global. Checagem efetiva app exige `-p tsconfig.app.json`, não script raiz com references.

## Rollback
Fechar Edge pinning/gate primeiro; `rollback.sql` revoga wrappers e cores, restaura trigger fechado, preserva histórico/outbox/settings/Vault. Não apagar jobs nem segredos. Não executado remotamente.