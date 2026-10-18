# P1 — contenção de mensagens e metadados B2B

## Estado e candidata

READ-ONLY canônico `swzpzcwiasxmjutrmvkm`: mensagens **0**, metadados **0**, órfãos relacionais **0**. Policies filhas sem restritivas, branches admin/gestor sem pai confirmados. **P1 estrutural; não exploit hospedado comprovado.** Não leu Auth users, tokens ou secrets.

`scripts/b2b-message-p1/candidate.sql.review` adiciona exatamente duas policies:

1. `p1_message_order_tenant_guard`, ALL RESTRICTIVE authenticated, USING e WITH CHECK: EXISTS pedido sob RLS + parceiro sob RLS + owner comercial igual a h15 da própria empresa.
2. `p1_attachment_message_tenant_guard`, ALL RESTRICTIVE authenticated, USING e WITH CHECK: EXISTS mensagem visível, que já atravessa a primeira contenção.

Sem helper DEFINER novo, grants, alteração/substituição de guards ou policy permissiva. Sem UI, bucket, Edge ou migration instalada. Cadeia anexo→mensagem→pedido/parceiro não consulta anexo de volta; não cria ciclo RLS.

O owner explícito é mais estrito que somente EXISTS pedido: NULL/legacy de outra organização falham fechados. A restritiva vigente do parceiro e a do pedido continuam aplicadas, portanto não reabre B2B comercial/técnico bloqueado. Superadmin não recebe exceção cross-tenant nova. Revisar eventual compatibilidade de legados antes de instalar.

## Arquivos revisáveis

- `candidate.sql.review`, `preflight.sql.review`, `rollback.sql.review`.
- `live-manifest.json`: MD5 policies, ACL, colunas, índices, triggers/FKs e corpos live. `live-guards.sql.review`, `live-partner.sql.review` contêm corpos com whitespace normalizado, não SQL live byte-a-byte. MD5 live é pg_get_functiondef, não hash desses arquivos.
- `fixture-policies.sql`: expressões capturadas das três relações e do parceiro, normalizadas.
- `test-local.py` e `results.local.json`: ensaio transacional reproduzível.
- `live-counters.sql.review`: achado residual separado, não proposta de instalação.
- `sha256.json`: hashes dos dez artefatos principais.

SHA256 candidata `d075984c58dde8a53b907f301c6af4ad1a5a8603a45aa875fa9695ab3a5fae28`.

## Auditoria ACL/triggers/FKs/writers

Authenticated possui privilégios de tabela; policies permissivas existentes continuam limitando cada operação. Mensagem não tem policy DELETE permissiva: DELETE intra e cross segue zero apesar do grant. Anexo DELETE intra autorizado, cross zero após contenção. UPDATE continua sem policy permissiva nas duas filhas.

- Messages.order_id → orders.id ON DELETE CASCADE.
- Metadata.message_id → messages.id ON DELETE CASCADE.
- Metadata.uploaded_by → auth.users.id NO ACTION: capturado, não acessou essa tabela hosted; FK Auth não reproduzida no harness para evitar simular identidades Auth reais.
- Índices live `(order_id,created_at)`, `(message_id)` e PKs oferecem caminhos para EXISTS. Nenhum índice novo.
- Triggers `trg_audit_messages` INSERT/DELETE/UPDATE e `trg_audit_attachments` INSERT/DELETE chamam `tg_commercial_audit`, DEFINER, corpo/ACL capturados. Mantidos no ensaio. Audit grava old/new; nenhuma trigger apaga Storage.
- Hook `useCommercial.ts` cria mensagem direta e upload antes de metadata; falha metadata pode deixar objeto órfão. Cascades relacionais não apagam bytes Storage. Bucket order-attachments ausente; não criar ou remapear para tratar esse P1.
- `rpc_message_set_status` live tem actor ready/org/owner/partner/cliente e locks m/po/pa; hash `640950a7d6f0071ccfeb3c0250cd4067`. Não alterado.
- **Residual:** `rpc_partner_message_counters` DEFINER aceita admin/gestor e filtra só partner opcional, não tenant. MD5 `5b049aa45efddf8aff1b92b14a759a46`. Policies novas NÃO contêm esse contador nem service_role/BYPASSRLS/owner. Não certifica módulo inteiro; requer recorte próprio. Não demonstrado com dados reais, pois filhas vazias.

## Testes próprios

**34/34 checks SQL locais PASS** em PostgreSQL descartável. Cada cenário cria fixtures em BEGIN e termina ROLLBACK; AR/FSF são labels de identidades sintéticas, não contas reais. Bodies de readiness/roles/h15/B2B scope/entitlements/partner context e auditoria capturados, sem resolver stub. Tabelas de dependência reduzidas: não prova schema integral, todos writers/guards de fixture provisioning ou HTTP.

- Baseline sintética reproduz leitura de filhas A pelo admin B enquanto pai A é invisível; após candidata B lê zero A e A lê próprios.
- Gestor próprio positivo/cross zero; mensagem/anexo insert próprio positivo e order/message/uploader forjado negados.
- DELETE anexo próprio1/cross0, inclusive uploaded_by do invasor. DELETE mensagem intra/cross0; UPDATE segue0.
- B2B comercial e técnico bloqueados; remoção partner_users continua negada. Não existe revoked_at em partner_users: não inventou flag. Vínculo Cliente/Produtor não autoriza mensagens nesta cadeia, portanto teste de user_clientes.revoked_at não é prova relevante de acesso aqui.
- Perfil inativo/provisório, invitation processing (readiness revogada), partner inativo e owner NULL negados.
- Anon0; FKs order/message impedem órfão; cascade privilegiada remove metadata dentro rollback, sem alegar DELETE authenticated ou apagar Storage.
- Counter DEFINER residual reproduz contagem cross na fixture mesmo após policies novas.
- Fixtures/audit finais0; rollback candidato falha fechado.

Scanner fiscal OK, diff-check OK, build automático observado 13:14:54 UTC OK. Não runtime TS alterado; Vitest/typecheck dedicado não rerodados neste delta SQL, não reatribuir evidências anteriores.

## Preflight/rollback e acesso faltante

Preflight SELECT-only compara policies/ACL/triggers+corpos/FKs/índices/colunas, nomes disponíveis e hashes de dependências. Catálogo live coletado; **script completo ainda deve ser executado e revisado pelo auditor**. Não aprovação automática. Ref validado em config; executor deve validar destino canônico também, pois SQL catálogo sozinho não prova ref.

Rollback contém somente DROP das duas policies, em ordem filha antes mensagem, mas aborta por padrão. Remover contenção restaura P1 estrutural: exige revisão do instalado e contenção substituta, preferir forward-fix. Não reinstala policies antigas nem muda grants.

Hosted BEGIN/ROLLBACK com identidades reais **não executado**: ferramenta disponível read_query aceita somente SELECT; migration é persistente e não será usada para ensaio disfarçado. Auditor precisa executar script transacional num canal SQL canônico autorizado, após revisar candidata e fixtures de schema integral. Não falta senha/token do usuário e nenhum é solicitado.

Cache/Blob gates false, vínculos fechados; cache/ledger suspensos. Assinatura, pagamento, perfis, Auth/SMTP preservados. Sem instalação/publicação/deploy/novos buckets. SHA HEAD observado `c90ef69b94262e747ef21f80e8ee139dec32ef59`, sem commit manual.
## Adendo 2026-10-18 — fechamento P1 (candidata v2, producao canonica)

- Escopo confirmado pelo proprietario: trabalho EXCLUSIVO em producao swzpzcwiasxmjutrmvkm; dados atuais sao de testes; homolog nao e dependencia.
- Residual `rpc_partner_message_counters` fechado na candidata v2: `ALTER FUNCTION ... SECURITY INVOKER` minimo, preservando corpo (md5 5b049aa45efddf8aff1b92b14a759a46), assinatura, owner e ACL (postgres/service/authenticated). A contagem passa a ser contida pela RLS filha + 2 policies RESTRICTIVE; o guard interno de permissao permanece como defesa em profundidade.
- Compatibilidade com helpers Entrega 2 rev 2.3 verificada: `get_user_partner_id` (b334c3a4...) e `b2b_commercial_context` (a31d198c...) respeitam revoked_at/tenant_id e NAO sao sobrescritos; preflight atualizado para esses hashes + `get_partner_papel` (f84f898e...).
- Harness local atualizado aos contratos atuais: fixtures com revoked_at, cardinalidade 0/2+ fechada, contadores INVOKER contidos (FSF nao conta AR; admin AR positivo), revogacao nega e restauracao devolve partner original. Suite local PASS exit 0 — laboratorio sintetico, NAO prova JWT/RLS hosted.
- Teste hosted BEGIN/ROLLBACK preparado em `scripts/b2b-message-p1/hosted-test-begin-rollback.sql.review` com identidades reais Admin AR/FSF (variaveis psql obrigatorias), fixtures AR em transacao, triggers ativas, sem simulacao de emissor fiscal. Se fixture legitima for bloqueada, o script falha com o erro exato em vez de fabricar PASS.
- NADA aplicado pelo agente: candidata, preflight, rollback e teste hosted aguardam revisao e aplicacao pelo auditor via Supabase.
