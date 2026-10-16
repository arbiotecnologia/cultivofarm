# SMTP-T1 — candidato de rascunho HTTPS + Vault

> Histórico T1 preservado. Continuação autorizada F2/F3 sobre c922a18d está em `smtp-tenant-f2f3-candidate-20261016.md`: candidato fechado, sem aplicação remota nem senha real; prova hosted pinning/typecheck/E2E pendentes. Não interpretar as propostas futuras abaixo como implementação homologada.

## 1. Decisão vigente e alcance
Titular substituiu a dependência de KMS/criptografia no navegador e de redaction absoluta por HTTPS em trânsito + Vault existente em repouso. Revisão ACL/Vault e controles da aplicação continuam obrigatórios. Entrega somente candidato de cadastro/edição DRAFT; sem promoção, gate remoto, conexão ou email. NO-GO anterior é histórico, não veto à nova decisão.

## 2. Base e rastreabilidade
Base solicitada ff98eec consultada por `git show`; formulário comparado com ela. HEAD recebido durante a execução era 7cc3cef4 (snapshots geridos pelo ambiente); não houve checkout/reset nem substituição de Auth. Alterações limitadas ao candidato, formulário e documentação/testes. Nenhuma credencial real utilizada.

## 3. Destino e auditoria própria somente leitura
`lovable supabase info --json` confirmou swzpzcwiasxmjutrmvkm, URL canônica, produção e backend externo. Consulta CLI gerenciada foi recusada por ser backend externo; consulta read-only autorizada posterior retornou ledger/objetos/ACL/RLS/gate e pg_settings. Nenhum destino alternativo, escrita remota, segredo, referência individual de Vault, claims ou sessão foi consultado.

## 4. Fundação instalada — resultado próprio
Ledger 20261016002102/smtp_tenant_t1_draft_foundation presente; settings/audit/refs contagens zero; gate privado false. Settings/audit RLS+FORCE com fence restritivo por actor org e leitura Admin; refs/gate sem client ACL. Wrappers públicos INVOKER, cores privados DEFINER owner postgres/search_path vazio. Save deriva tenant, revalida após lock, CAS antes de Vault, audit restrito e erros constantes. Readback não equivale a execução autenticada.

## 5. Evidência externa do auditor
Aplicação da migration e Edge tenant-email-settings v1 verify_jwt=true/reviewed=false; UI56be97d bloqueada desktop/mobile/Admin AR. Readback Edge 5/5 arquivos e HTTP sem JWT401/origem ruim403/OPTIONS oficial204 informados pelo auditor, não reproduzidos neste turno. Claims simulados com identidades reais e Vault oficial sintético save/rotate/CAS em ROLLBACK PASS externos; não são browser E2E nem garantia de logs. Sem endpoint de inspeção remota de código usado neste turno.

## 6. ACL e limites de autoridade
Admin ativo/pronto da própria organização, não Superadmin/global, com auth.uid/role/tenant server-side. Sem tenant no payload. GET/PUT usam caller anon+bearer/getUser. Grants mínimos de RPC/cores e leitura RLS; cliente não escreve tabelas nem lê Vault. Gate é defesa adicional, nunca autorização. PUBLIC/anon/service não executam RPCs tenant. Auth SMTP global/recuperação e singleton global não mudaram.

## 7. Persistência e Vault
Contrato existente usa create_secret(text,text,text,uuid) e update_secret(uuid,text,text,text,uuid), UUID final default. Hosted ACL permite postgres e não anon/authenticated; referências privadas. Save/rotate e incremento/audit transacionais, lock por org, CAS esperado. GET allowlist só ok/version/config/credential_configured/state/sender_verified/dispatch_enabled. Não há decrypted reader. SQL executável não precisou mudar: arquivo completo tem só comentário atualizado, não reaplicar fundação.

## 8. Aplicação — senha e memória
Campo limpo antes de IO; schema estrito, corpo limitado 32768 bytes, sem console/logger, erro allowlist, resposta no-store (incluindo OPTIONS agora). Senha não vai a auditoria, Query cache, local/session storage ou toast. Fencing de render por scope+transport evita campos/actions da identidade anterior antes do effect; generation protege retornos tardios, ref lock impede submit duplicado. JavaScript não garante zeroização física da memória; payload transitório precisa existir para HTTPS.

## 9. Infraestrutura — distinção obrigatória
HTTPS protege trânsito; Vault cifra repouso. Isso NÃO prova ausência de bodies/headers em Invocations/gateway/drains, p_password em PostgREST ou parâmetros/erro/contexto SQL. Não foi constatado vazamento. pg_settings lidos: log_statement=ddl, log_min_error_statement=error, log_parameter_max_length=-1, on_error=0, duration_statement=-1, duration_sample=-1, pgaudit.log=none, pgaudit.log_parameter=off. São configuração observada daquela sessão, não garantia de gateway/PostgREST/conexões/drains. Auditor deve revisar retenção/acessos/logs administrativos sem capturar senha/JWT do navegador. Ausência de console não certifica infraestrutura; risco residual aceito pelo titular, sem KMS obrigatório.

## 10. Gates e promoção mínima
UI TENANT_SMTP_REVIEWED=false, entry reviewed=false e gate SQL false preservados. Após revisão/autorização específica o auditor promove arquivos e abre somente esses gates de rascunho; dispatch/sender_verified permanecem false. Nenhuma configuração humana efetuada pelo agente. Gate fechado pode retornar FORBIDDEN pelo tratamento atual SQL — manter indisponibilidade segura, não ampliar erro para conteúdo remoto. GET direto autorizado já fornece metadados, não senha.

## 11. Preflight e delta revisável
`scripts/smtp-tenant-candidate/preflight.sql` é READ ONLY: ledger/gate/counts, colunas, ACL efetiva/RLS/policies, Vault identities/defaults e logging. Provar ref externamente antes; SQL sozinho não prova project ref. Parar se drift. Auditor compara fontes completas já instaladas e conteúdo do pacote; não aplicar 20261016_smtp_t1.sql por IF NOT EXISTS. Delta de runtime: no-store OPTIONS, fencing render UI e comentários de critérios. Nenhuma nova tabela/RPC/dependência/rota/permissão.

## 12. Testes focais e evidência
Vitest: handler/contrato51, UI8 = SMTP59/59; regressão topology3/3; total62/62 PASS. Testes cobrem senha limpa, read/save tardios após identidade, erro bruto, duplo submit, CAS conflito/reload/readback, GET metadata/no-store e gates. SQL descartável:52 checks PASS com SQL real e Auth/Vault stubs, zero conexão canônica; não prova criptografia Vault hosted. Lint focal seis arquivos exit0/zero saída. Scanner expandido15/15 PASS. Build automático observado01:27:15Z OK (não executado manualmente). **Typecheck efetivo -p tsconfig.app.json desta rodada UNVERIFIED**: instrução do ambiente proíbe execução manual e só forneceu build OK; não confundir root files[] ou build com typecheck app. Checagem app PASS de00:33 é histórica, não nova certificação. Auditor deve executar checagem app antes de promoção.

## 13. Prévia desktop/mobile e limite E2E
Playwright montou formulário real isolado com transporte mock no localhost: desktop1280×1800 e mobile390×844 salvaram um rascunho simulado, senha limpa, exatamente uma escrita e sem overflow; screenshots inspecionadas. Mock sem claims, sem JWT e sem troca de identidade real. Não houve UI→Edge→PostgREST autenticado; backend externo não permite sessão gerenciada. Validação positiva hosted fica para auditor após promoção autorizada. Não pedir senha real ao usuário.

## 14. Auditoria de adapter/test existente
Revisados email-adapter/native-smtp-client/smtp-provider-probe-deno/smtp-readiness e test-communication-email. Núcleo nativo usa Deno TLS/EHLO/AUTH e classifica resultado pós-DATA como ambíguo; suporta contrato injectable. Readiness bloqueia25/587. test-communication-email está contido por diagnosticContractAvailable=false; código legado global/superadmin/service_role/recipiente fixo não deve ser adaptado por simples troca de host/tenant. Reutilizar somente primitivas auditadas após guards tenant, sem fallback global. Nada foi ativado.

## 15. Fase seguinte — conexão tenant com gate técnico
T2 proposta, não implementada: carregar versão aprovada server-side e segredo via core exclusivo de worker, derivar org do actor; aceitar host somente da configuração persistida. Provar DNS A/AAAA/CNAME completo, mixed answers/ranges privados e especiais (IPv4/IPv6/mapped/NAT64), rebinding, pinning de destino e TLS SNI/certificado/timeout antes de socket. Restrição oficial atual Edge: saída25 e587 bloqueada,465 apenas candidata. Deno.connectTls(hostname) atual pode resolver novamente e não prova pinning com SNI separado; é limitação técnica real. Gate de go/no-go exige harness de transporte em Edge; se API não sustentar destino pinado e nome TLS validado, interromper suporte arbitrário e recomendar rotas de provedores fixas server-side explicitamente homologadas, sem proxy genérico. Não prometer587 nem contornar política Edge.

## 16. Fases funcionais concretas após T2
T3: conexão AUTH sem envelope/DATA e readiness vinculada a org/version/fingerprint, prazo de validade e auditoria sanitizada. T4: envio controlado somente ao email confirmado do Admin autenticado resolvido server-side, confirmação explícita, rate-limit e recibo; remetente exige prova de titularidade/autorização do provider/domínio, não considerar recebimento teste como prova de domínio. Rotação invalida readiness/verification. T5: ativação/pausa server-side somente Admin próprio tenant; estado pronto+remetente verificado; entrega operacional ainda sob gates. T6: integrar outbox já existente com origem/tenant/job/destinatário provados e worker service-only, sem fila paralela; quotas/cooldown por tenant/destinatário, claim/fencing, idempotência e snapshots, recuperação de jobs e falhas seguras. Resultado ambíguo pós-DATA não retry automático: confirmação humana auditada antes de novo claim. Nenhuma fase seguinte iniciada nesta entrega.

## 17. Arquivos, rollback e decisão de entrega
Arquivos: TenantEmailSettings.tsx, tenantSmtp.ts, handler.ts, index.ts.review, SQL completo (comentário), dois testes SMTP, scanner, preflight, README, SHA256SUMS, AGENTS/roadmap, este relatório e adendo no relatório histórico. Memória atualiza decisão do titular. Dependências/target/lib/Auth/config.toml/migrations/deploy intactos.

Rollback do delta local: voltar fencing/no-store à base revisada, conservar gates false; nenhum dado novo neste turno. Contenção após futura promoção: fechar gate privado e UI/Edge primeiro; `rollback.sql` revoga acessos tenant e preserva settings/audit/Vault. Não destruir segredos/dados nem reaplicar fundação para restaurar grants sem revisão. SQL de rollback existente não executado remotamente. **Candidato pronto para revisão, não homologado em produção**; promoção bloqueada pelo auditor/preflight/check app/E2E e gate técnico SMTP futuro. Sem KMS obrigatório e sem promessa de logs invisíveis.