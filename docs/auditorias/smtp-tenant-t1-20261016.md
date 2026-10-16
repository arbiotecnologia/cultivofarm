# SMTP-T1 — fundação revisável por empresa

## Decisão
**Fundação fechada aplicada pelo auditor, conforme relato de 2026-10-16 00:27 UTC; NO-GO para credencial real, abertura de gates, implantação pelo agente, conexão ou envio.** A execução local histórica abaixo não é a aplicação remota. Redaction autenticada permanece pendente; gates comerciais/fiscais continuam inalterados.

## Delta focal após revisão independente c2509c6613553ce9126e420acb6f321c84000d1c
- Evidência externa recebida em 2026-10-16 00:15 UTC: 104 Vitest PASS, typecheck PASS, lint novos PASS, scanner PASS. Não confundir com QA próprio abaixo nem com homologação integral.
- Correção do bloqueador: preflight usa identidades **create_secret(text,text,text,uuid)** / **update_secret(uuid,text,text,text,uuid)**, verifica default final e EXECUTE do executor. Chamadas omitindo UUID default permanecem válidas. A alegação inicial de compatibilidade estava incompleta: os stubs antigos reproduziam assinaturas incorretas. Owner supabase_admin, postgres EXECUTE e anon/auth sem EXECUTE são evidência read-only externa do auditor, sem nova consulta ou mudança remota pelo agente.
- Gate privado agora é exigido após autorização, ANTES de validação/uso Vault, e após lock/rechecagem de ator; trigger permanece defesa adicional. Antes só o trigger revertia efeitos: não impedia a tentativa. Teste com sequência não transacional local comprova ausência de tentativa; nenhuma sequência/objeto foi criada no Vault conectado.
- Scope/get/save privilegiados movidos a platform_private; públicos viraram INVOKER de search_path vazio, ACL explícita mínima incluindo cores autenticados que revalidam identidade. Sem parâmetro org; USAGE privado existente verificado pelo preflight, não concedido globalmente. Rollback revoga também cores. GET não usa SELECT *.
- Worker/global/Auth/UI/gates intactos. Não houve aplicação, publicação, envio ou leitura de segredo. T1 permanece pacote revisável e fechado; nenhuma nova fase/plano.
- QA próprio do delta: PostgreSQL descartável **52 checks PASS** (antes 46), incluindo identidades reais sem overload curto, INVOKER/DEFINER/ACL e gate antes de config inválida com zero attempts; **53/53 Vitest PASS** em dois arquivos. Scanner ajustado para não confundir argumento write p_password de wrapper com leitura de coluna password; valida também wrappers INVOKER e ausência de wildcard. Manifesto regenerado após delta.
- Falha instrumental do delta: separador SQL ausente no harness inicialmente gerou syntax error, corrigido; scanner original gerou falso positivo em SELECT privado com argumento p_password, regra refinada. Não omitir esses resultados iniciais; reexecuções finais constam da entrega.
- Typecheck PASS do snapshot c2509c6 é evidência externa; delta SQL/Python/docs sem mudança TS/UI. Typecheck separado do delta não executado manualmente, frontend/produção e concorrência hosted continuam UNVERIFIED.

Solicitação: 2026-10-15 22:34 UTC; execução/QA atravessou 2026-10-16 UTC. HEAD inicial observado `98c74c3f`. Nenhum commit Git manual; snapshots são geridos pela plataforma.

## Estado externo informado pelo titular
Auth global configurado separadamente no painel Supabase; titular informou recover200, recebimento, senha e login Produtor. Informação externa, não prova própria desta entrega. Auth SMTP, credenciais, templates, hooks, recuperação429 e alteração administrativa de senha permaneceram intocados. Remetente provisório do Auth não foi copiado para configuração tenant nem tratado como verificado.

## Inventário próprio somente leitura
Ferramenta `lovable supabase info --json` confirmou antes do banco: ref `swzpzcwiasxmjutrmvkm`, managed_by_lovable=false, production=true, sem development. Nenhum ref alternativo usado.

| Fonte | Evidência hospedada lida | Consequência |
|---|---|---|
| communication_provider_settings | singleton id, sem organization_id; ACL postgres/service_role, RLS | preservar global |
| communication_provider_settings_audit | sem organization_id; grants anon/auth/service amplos, restrictive false para clients | não ampliar/remover contenção |
| comunicacao_eventos | sem organization_id direto; restrictive false client + policy admin legada | não inferir tenant de payload/recipiente |
| comunicacao_outbox | sem organization_id direto; restrictive false client + policy admin legada | não roteável tenant nesta fase |
| rpc_service_load_provider_runtime_config | DEFINER, search_path public/vault, EXECUTE postgres/service_role; definição lê decrypted_secrets | definição inspecionada, RPC nunca invocada |
| platform_actor_access_ready | DEFINER search_path vazio; ativo, senha_provisoria=false e invitation fencing | reutilizado sem mudar corpo/ACL |
| tabelas SMTP tenant | busca de nomes smtp/email-setting em public retornou vazia | extensão aditiva candidata |
| Vault | extensão supabase_vault 0.3.1 | sem ler valores/referências existentes |

As quatro policies `notif3_global_client_containment` foram confirmadas **RESTRICTIVE**, não apenas presença de qual=false. As queries information_schema.role_table_grants retornaram vazias neste contexto; não interpretadas como ausência de grants: relacl de pg_class foi consultado separadamente.

Worker **local** `process-communication-outbox/index.ts:64–66` retorna503 antes de runtime/claim, com deliveryContractAvailable=false. Não foi consultado deployment remoto nem logs/corpos de emails. Runtime local mantém DB > env > fail-closed para o ramo global; nada foi alterado nele.

## Artefatos
Pacote `scripts/smtp-tenant-candidate/`:
- `20261016_smtp_t1.sql`: schema/grants/RLS/RPCs/trigger DRAFT, referências privadas Vault, auditoria e gate persistente inicialmente false. **Candidato, não aplicado**, fora de supabase/migrations.
- `rollback.sql`: gate false + revoga acesso; preserva configuração/audit/Vault, sem DROP/backfill.
- `handler.ts`, `_shared/contract.ts`, `index.ts.review`, `deno.json.review`: handler real testável e entrypoint revisável, fora do diretório de deploy. Nenhuma Edge existente/config.toml editada.
- `test_local.py`: PostgreSQL descartável, corpo SQL candidato executado duas vezes e rollback; stubs Auth/readiness/Vault sem criptografia.
- `scan_local.py`: scanner focal sem equivalência a scanner de segurança global.
- README e SHA256SUMS: instalação controlada e manifesto.

Frontend: seção Email da empresa em Configurações → Perfil da empresa; `TenantEmailSettings.tsx` e transporte `tenantSmtp.ts`. Usa componentes/tokens existentes, chave de identidade/tenant e geração para respostas tardias, sem rota/dependência nova. Oculta do Superadmin, cujo caminho global na Plataforma foi preservado. A renderização não autoriza o servidor.

## Contrato e segurança
- Campos genéricos: host/porta/implicit_tls ou starttls_required/username/from_email/reply_to/from_name, sem provider preset, OAuth/API ou plaintext.
- Admin ativo/pronto da própria organização deriva de auth.uid/perfil/organization. Superadmin negado mesmo junto a role Admin; tenant/actor não entram no payload. Guard exige resultado true, incluindo NULL fail-closed.
- Apenas RPC actor pode salvar; credencial em Vault via API oficial. Public settings sem senha/referência, private ref sem grants clients/service. GET somente config e boolean credential_configured. Audit somente identidade/versão/ação; nenhum valor de config ou credencial.
- Versionamento monotônico, lock de empresa inclusive primeira inserção, CAS sem retry automático. Rotação e alteração mantêm DRAFT/sender_verified=false/dispatch_enabled=false. Triggers negam ativação mesmo por atualização privilegiada normal; owner PostgreSQL é trusted boundary.
- Três gates: frontend false, entrypoint reviewed=false, registro privado approved=false. Gate persistente impede contorno da UI via RPC direta; falha do gate também reverte Vault na mesma transação local. Não há API de ativação do gate.
- Privilegios novos somente nos objetos candidatos; grants/DDL globais e schemas reservados não modificados. Revokes explícitos PUBLIC/anon/service das RPCs; search_path vazio nas funções candidatas.
- Nenhum reader de credential, worker, adapter, DNS resolver, conexão SMTP, fila paralela ou global fallback novo.

## QA executado
| Evidência | Resultado | Limite |
|---|---|---|
| Vitest novos contract/handler/UI | 53/53 PASS | SDK/transporte simulados |
| Vitest total selecionado, 12 arquivos | **190/190 PASS** (144 +46) | não suíte global |
| PostgreSQL candidato + repetição + rollback | **46 checks PASS** | tabelas reduzidas, Auth/readiness/Vault stubs |
| Scanner focal | **9/9 PASS** | não advisors/scanner hosted/global |
| ESLint arquivos novos TS/TSX/testes | 0 erros/avisos | Configuracoes mantém baseline18 erros/2 avisos; sem lint globalPASS |
| git diff --check | PASS | checagem local |
| Build automático observability | build OK, última evidência conferida00:09:28Z | não build manual/produção |
| Typecheck | **UNVERIFIED separado** | harness automático não expôs sinal dedicado; não executado manualmente conforme instrução da plataforma |
| Playwright formulário real local | desktop1280×1800/mobile390×844 PASS, zero pageerrors, sem overflow | montagem isolada por imports Vite/transporte simulado, NÃO navegação autenticada real |
| Persistência/releitura real no canônico | **UNVERIFIED** | expressamente proibida nesta entrega |

Testes SQL concretos: Admin A/B own draft, A/B read RLS, audit scoped, roles gestor/financeiro/produtor/B2B técnico/gestor/Superadmin negadas, inativo/provisório/sem org/sem JWT/org inativa negados, grants privados, acesso anon/service fechado, escrita direta negada, rotação, conflito, atomic rollback Vault, injeção, tenant forjado, imutabilidade, gate OFF e rollback preservando dados/Vault. Guards canônicos reais não foram substituídos no projeto; os mocks só existem no harness.

Falhas instrumentais transparentes: primeiro teste SQL de injeção falhou42804 por `to_jsonb` sem cast no teste, corrigido para text sem alterar regra; dois ensaios browser iniciais falharam pelos imports CJS React/DOM no harness, corrigidos para export default. Reexecuções passaram; não atribuídas a falha SMTP real.

Screenshots temporários `/tmp/browser/smtp-t1/saved-390.png`, `blocked-1280.png` inspecionados: formulário coeso, senha vazia após tentativa, status de rascunho e envio bloqueado; também saved-1280/blocked-390. Somente dados fictícios, nenhum screenshot de segredo/sessão real.

## Bloqueios reais e próxima fase
1. **Redaction hosted não comprovada**. Banco consultado: log_parameter_max_length=-1, log_parameter_max_length_on_error=0, log_statement=ddl, pgaudit.log=none/log_parameter=off. Nenhum deles comprova que gateway/telemetria nunca capturam corpo. Portanto credencial real e gates continuam fechados. Não alterar config automaticamente.
2. **SSRF não certificado**: validação estática rejeita IP/URL/loopback/nomes reservados/injeção. Domínio válido ainda pode resolver privado/metadata; sem conexão, não há SSRF executável novo. Antes de conexão: resolver toda cadeia A/AAAA/CNAME, ranges especiais/IPv4-mapped/NAT64/mixed answers, IP pinning e SNI/certificado contra DNS rebinding. Regex de links de notificação não prova SSRF SMTP.
3. **Remetente/domínio** precisam verificação real; nenhuma label VALIDATED/ready foi inventada. Auth global confirmado pelo titular não prova tenant sender.
4. **Teste controlado** somente após transporte TLS e SSRF homologados, quotas/rate limits e consentimento explícito; zero emails enviados nesta fase.
5. **Outbox/worker tenant**: provar origem da mensagem server-side, distinguir global/tenant e quarantinar legado sem ownership, versionar snapshot de config, actor/tenant/recipient e recibos/idempotência/quotas; sem inferir organização pelo destinatário e sem fallback global. Reusar fila/módulo existente. Planejamento somente, não iniciado.
6. **Concorrência real hosted e Auth/Vault/RLS/API/browser** pendentes auditor. O lock/CAS local e UI simulada não certificam essas superfícies reais. Não iniciar outra grande auditoria até fechar este recorte SMTP.

## Rollback e revisão
README contém ordem de instalação, contrato de imports e três gates. Antes de aplicar: auditor deve validar ref, APIs Vault, owner/ACL existentes, schema drift, redaction e empacotamento Deno. Após aplicar, revalidar A/B com identidades autorizadas, sem emails; manter operacional OFF. Em rollback fechar UI/entrypoint/gate e revogar acesso com rollback.sql sem apagar histórico/secret. Reaplicar candidato depois de rollback restabeleceria grants: exige nova revisão.

**Nenhuma migration/secret/Edge/publicação/SMTP/Auth/configuração de produção foi alterada remotamente nesta entrega.** Arquivos locais revisáveis entregues; homologação e aplicação controlada aguardam auditor.

## Delta 6d801c — ajustes finais pré-instalação (2026-10-16)
1. **Pin exato da dependência**: `index.ts.review` agora importa `npm:@supabase/supabase-js@2.110.8` (antes `@2` móvel). SHA256SUMS regenerado para todo o pacote candidato.
2. **Teste de topologia compatível com Windows**: `src/test/config/authProviderTopology.test.ts` passa a usar `relative(ROOT, p).replaceAll("\\","/")` (helper `sourcePath`) nos filtros `/test/`, nos mapas das duas definições e na comparação do hook canônico. Nenhuma mudança runtime de Auth. Resultado local: 3/3 PASS.
3. Verificações locais pós-delta: scanner focal **11/11 PASS**, `git diff --check` PASS, pin confirmado no arquivo. Regressões independentes relatadas pelo auditor (admin-password 29, callback 21, recovery 18, PortalGuard 9) não foram reexecutadas pelo agente.

Escopo preservado: gates OFF, nenhum SQL remoto aplicado, nenhuma publicação, Auth/configuração global/worker intocados. Auditor segue instalação canônica fechada após preflight.

## Atualização externa 2026-10-16 00:27 UTC — instalação fechada, NÃO reaplicar
Informação recebida do auditor, **não execução nem verificação hospedada própria nesta rodada**:
- Canônico `swzpzcwiasxmjutrmvkm`: migration `20261016002102_smtp_tenant_t1_draft_foundation` aplicada somente como fundação fechada.
- Edge `tenant-email-settings` v1, `verify_jwt=true`, `reviewed=false`; UI publicada `56be97d`, observada no Admin AR com campos bloqueados.
- SQL hosted com claims simulados e identidades reais AR/FSF/Consultor/Financeiro/Superadmin/B2B/Produtor PASS externo. Identidade real com claims simulados não equivale a JWT/browser real de cada perfil.
- APIs oficiais Vault save/rotate/CAS com marcador sintético em ROLLBACK PASS externo; estado final informado settings/audit/refs=0 e gate=false. ROLLBACK não apaga logs nem prova redaction.
- Não arquivamos como SQL exato do ledger: o conteúdo integral dessa migration não foi fornecido/lido nesta rodada. Não reaplicar o SQL candidato para reconstruir histórico.

## Revisão de segurança T1 — delta documental desta rodada
Diagnóstico detalhado e intervenção mínima em [smtp-tenant-t1-redaction-20261016.md](./smtp-tenant-t1-redaction-20261016.md).

A documentação oficial Supabase confirma que **Invocations contém request/response, headers e body**. O contrato recebe `password` na Edge e envia `p_password` ao PostgREST; criptografia Vault em repouso e mensagens seguras não eliminam esses pontos de captura. Não foi demonstrada configuração gerenciada de supressão na origem. Os valores SQL anteriormente observados são históricos e não foram reconsultados.

Com todos os gates false, o transporte da UI não chama a Edge; o handler retorna503 antes de auth/body/RPC. Portanto a prova completa não é executável pelo caminho atual. A recomendação é primeiro obter intervenção/garantia efetiva do proprietário/Supabase sobre logs, e só então revisar uma exceção temporária exclusivamente sintética no mesmo PUT, mantendo auth/RBAC/tenant e gate SQL false. Isso altera a semântica do bloqueio pré-auth e exige autorização específica; **nenhuma exceção foi implementada**. Sem suporte verificável de logs, manter NO-GO, não trocar a arquitetura por conta própria.

Nesta rodada: apenas memória/documentação/roadmap/README e manifesto; nenhum runtime, Auth, identidade, ACL, SQL remoto, secret, envio, publicação ou gate alterado; nenhum subagente, navegador autenticado, HAR, trace ou log remoto com bodies/token acessado. QA documental e regressões locais são registrados no protocolo, sem certificação hospedada.
