# CADASTROS-PRODUTOR-PARCEIRO — checkpoint 2026-10-08

## Escopo e decisão
Cadastro comercial de clientes/produtores e parceiros, distinto de provisionamento de login B2B. Checkpoints STORAGE-2, MULTIPORTAL-1, CADASTRO-1 e inscrição estadual preservados. Nenhuma publicação, conta Auth, papel, convite ou envio; sem atribuir empresa a legado órfão.

**PASS focal:** contrato novo com cliente da empresa, isolamento SQL/RLS e testes locais. **NO-GO integral:** JWT/API/browser autenticado e concorrência remota não verificados. A prova SQL usa `ROLE authenticated` e claims simulados; não é sessão Auth nem prova de transporte JWT.

## Auditoria em 17 itens
| # | Superfície | Resultado/limite |
|---|---|---|
|1|Criar parceiro|`client_id` obrigatório antes do envio; instrução para cadastrar/selecionar cliente da própria empresa. Não apenas desabilitação da ação.|
|2|Ownership novo|Trigger exige cliente com `organization_id=h15_actor_organization()`, deriva autor do ator autenticado; legado sem empresa continua fechado.|
|3|RLS/grants|Restritiva `d51_5_partner_accounts_tenant_guard` mantida; sem regrant geral ou service role frontend.|
|4|Criar produtor/cliente|Empresa derivada pelo guard canônico existente; inserção própria positiva no rollback.|
|5|Editar cliente|Próprio positivo; cruzado/tenant forjado negados. Gestor existente altera cliente, não recebe escrita de parceiro.|
|6|Editar parceiro|Cliente/consultor coerentes com empresa; identidade/código/autor imutáveis no trigger.|
|7|Inativar/reativar|Parceiro usa soft-delete; cliente preserva status/histórico. Provas próprias positivas.|
|8|Excluir cliente|Próprio sem dependências positivo SQL; consulta de dependências falha fechada. Com documentos, exclusão não atômica fica indisponível; inativação permanece.|
|9|Dependências|`check_cliente_dependencies` exige alvo/empresa/ator autorizados e inclui parceiros/documentos.|
|10|Documento|Opcionalidade preservada; se preenchido CPF/CNPJ validado no formulário. Duplicidade normalizada de cliente isolada por empresa no índice. Não certifica unicidade de CNPJ em partner_accounts.|
|11|IE/campos|IE flexível e ISENTO preservados; erro mantém dados e seleciona aba pertinente no cliente. Validação fiscal não alterada.|
|12|Endereço/contatos|Consultas CEP/CNPJ cercadas por sessão e estado atual; teste de CEP atrasado não sobrescreve edição. Endereços/contatos opcionais preservados.|
|13|Lookups|Clientes/consultores limitados à empresa pronta; consultor cruzado negado pelo servidor.|
|14|Cache/sessão|Scope inclui identidade/perfil ativo/empresa/papéis; cancelamento e remoção focais das queries, respostas tardias ignoradas. Testes A→B, logout e readiness.|
|15|Reentrância/código|Lock síncrono no formulário; UUID de rascunho estável em retry, código `PARC-<UUID>` derivado servidor. Não é idempotência distribuída nem replay convergente; conflito de UUID exige reconciliação futura.|
|16|Documentos|Upload verifica cliente da empresa antes de bytes e cerca awaits; nenhuma operação real Storage nesta auditoria. Exclusão individual Storage→metadata continua não atômica, não certificada. Backup não habilita exclusão de cliente com documentos.|
|17|Mensagens/mobile|Erros de cadastro sanitizados; dados permanecem após falha. Layout existente preservado, sem certificação mobile/browser autenticado.|

## Matriz papel × superfície
|Papel/estado|Superfície|RLS/resultado|
|---|---|---|
|Administrador FSF/ARBio|`/clientes`, aba produtores/parceiros|Criar cliente/parceiro próprios permitido; leitura/update/delete/vínculo cruzados negados em SQL. Menu/URL não autoriza.|
|Gestor + consultor técnico existente|Cliente / parceiro|Update cliente próprio positivo; escrita parceiro negada. Contexto visual não altera papéis.|
|Gestor comercial|Contrato de parceiro|Permissiva existente e frontend compatíveis; sem identidade real executada, dinâmica UNVERIFIED.|
|Inativo/não pronto/sem empresa/sem UID|Cadastros|Negações SQL; não equivale renovação JWT real.|
|Demais papéis/planos|URLs e operações|Guards/entitlements preservados; matriz dinâmica completa UNVERIFIED.|

### Complemento humano — contratante e tenant próprio do parceiro
O parceiro pode ser outro tenant. `partner_accounts.client_id → clientes.organization_id` define ownership **comercial da contratante**; `organizations.partner_account_id` define o contexto próprio do parceiro. Não exigir igualdade dessas empresas. Cadastro/vínculo comercial não transfere clientes, usuários, financeiro, documentos ou notificações e não torna administrador do parceiro administrador da contratante.

Revisão do código atual: o trigger comercial160048 não consulta `organizations.partner_account_id`; sua igualdade cliente/ator diz respeito somente à escrita da contratante. Hooks comerciais cercam perfil/empresa do ator, não substituem contexto pelo parceiro. `usePartnerUsers` é leitura de usuários da **gestão comercial contratante**; não foi convertido em provisionamento/administração do tenant parceiro. A proposta de restauração em cadastro-1 foi esclarecida para não impor igualdade entre contextos distintos.

|Direção/superfície|Evidência|Gate|
|---|---|---|
|A→B e B→A, clientes/cadastros parceiros|SQL6 positivos próprios,10 negações de leitura/update/reparent|PASS focal entre empresas independentes|
|Administrador no tenant próprio do parceiro→contratante|Admin é local; nenhum organizations.partner_account_id preenchido no estado vivo|Relação parceiro-tenant real UNVERIFIED, não fabricada|
|Contratante→usuários/financeiro/documentos/notificações do parceiro|Policies vivas de profiles, accounts_receivable, financial_documents, cliente_documentos e notificações escopadas|Leitura estrutural; dinâmica vinculada UNVERIFIED|
|Leitura B2B explicitamente permitida|`partner_accounts_self_select` + `get_user_partner_id()` permitem próprio registro por vínculo/papel; não permitem clientes da contratante pela restritiva de clientes|Contrato/colunas compartilháveis requer revisão; não reabrir nem ampliar ACL|
|Tenant parceiro→administração comercial|Trigger exige cliente na empresa do ator para writes; vínculo B2B não satisfaz essa condição|Não substitui prova API real|

Risco registrado: SELECT da linha `partner_accounts` retorna todas as colunas alcançáveis; antes de restaurar provisionamento B2B, aprovar quais informações comerciais podem ser compartilhadas e verificar o guard de vínculo/prontidão. Não afirmar que cadastro comercial autoriza esse compartilhamento. Nenhuma migration nova, perfil/papel/vínculo/organização real alterado para fabricar cenário.

Prova mantida em `scripts/rbac-audit/commercial-context-isolation-proof.sql`. Run `TEMPORARY_AUDIT_228ee6ff-db64-4d60-99aa-8728ff4b46a1`: clientes `69ec6db2-ae16-41d3-84a9-95b462984d44`, `c93f4fd3-075d-4547-aa44-c434935a19e0`; parceiros `6016ebbe-3d18-4784-b1da-f2e176d87556`, `b48d583e-fa49-4663-9a0d-dfba40c5304b`. Exceção final deliberada com `positive=6 denied=10`; leitura posterior clients/partners/audits=0. Hashes antes/depois deste complemento: clientes2/65474d6e09f5030d2e96f1a619cc1efe, parceiros1/b5bad2bcc8982ec47233b346ef77994d e audit1/aa7523f762f2b171f10a80f9dfd5fc81 iguais. Divergência histórica anterior permanece sem explicação, não apagada.

Testes deste complemento:36/36 em5 arquivos, incluindo dois casos novos de contexto comercial/empresa do ator; lint teste/diff-check PASS, harness build OK16:15:25 UTC. Conjuntos anteriores não somados. SQL usa claims simulados, não JWT verificado. Prova com tenant próprio efetivamente vinculado permanece bloqueada por ausência de vínculo real e proibição de alterar organizações/vínculos reais; não criar Auth/papéis.

## Migration e rollback
Migration oficial única, ledger confirmado read-only:
`supabase/migrations/20261008160048_0379dfbf-559f-4d87-91bb-89e36ca35bbc.sql`.

Inclui trigger `guard_commercial_partner_registration`, validações de referências/financeiro finito, código/autor derivados, índice `clientes_tenant_document_unique` e core de dependências. Preflight de duplicados normalizados: zero grupos conflitantes. Não reaplicada neste fechamento.

Rollback recomendado é **forward-fix versionado** preservando RLS e guard de tenant. Antes de restaurar índice global antigo, verificar conflitos entre empresas; não remover proteção nem restaurar contrato `client_id` opcional. Frontend pode retornar ao checkpoint anterior por revisão controlada, mas voltaria a ter a contradição que originou o erro. Não executar rollback automático.

## Provas SQL e manifesto
Ambiente canônico `swzpzcwiasxmjutrmvkm`; JWT iat requerido pelo guard. Primeira tentativa sem iat falhou `tenant_context_required` e não persistiu. Provas bem-sucedidas encerram por exceção final deliberada, revertendo a transação.

- `TEMPORARY_AUDIT_cf4bd02c-2d6a-42a5-a37e-133f75d1aada`: `positives=9 denied=13`. Clientes `0f0891d1-220e-49eb-9bb5-7cf29897411f`, `0e8c6520-521a-45d5-a50b-e4cd51fe5ab7`; parceiros `053374f3-c84c-4987-8733-40e858d225ce`, `b4592818-7cd0-4744-b96c-19dbe35d60e3`. Criar/arquivar/reativar, autor/código, dependências, spoof, duplicidade normalizada, negativo/NaN e referências cruzadas.
- `TEMPORARY_AUDIT_f52cac4d-c869-476e-8fb6-fbceff68e096`: `own_delete=1 denied=7`; cliente `7df9312a-dbef-4247-bb61-d2d208468a96`. Excluir próprio sem dependências, consultor cruzado e seis contextos não prontos negados. Tentativa anterior de consultor com identificação inadequada descartada, não contabilizada como PASS.
- Manifestos exatos ausentes após rollback em clientes/parceiros/audits; última leitura dos três IDs de cliente: resíduos zero. Nenhuma identidade criada.

Hashes com `md5(string_agg(to_jsonb(row)::text,'|' ORDER BY id))`:
|Tabela|Contagem|Antes = depois|
|---|---:|---|
|clientes|2|`65474d6e09f5030d2e96f1a619cc1efe`|
|partner_accounts|1|`b5bad2bcc8982ec47233b346ef77994d`|
|partner_users|1|`04ad7c8857fa749784d7787fef559c12`|

**Divergência não explicada:** partner_audit_logs permanece 1, mas hash inicial `6afeb97f4085cfc124dd98108459e212` e final `aa7523f762f2b171f10a80f9dfd5fc81` diferem. Registro final é histórico (`create`, 2026-09-11), não fixture. Sem snapshot anterior completo não é possível atribuir a causa nem certificar integridade dessa tabela; nenhuma tentativa de corrigir seus dados. Cliente audit atual 38/hash `bd347cdc119804ff183ae24223710108`, sem baseline certificável. Não declarar todos os históricos intactos.

ACL `link_partner_user` authenticated continua false; `set_partner_user_papel` não foi liberado. Cadastro comercial não restaura login/portal B2B.

## Arquivos e verificações
- Hooks: `useCommercialRegistrationScope.ts`, `useParceiroB2BMutations.ts`, `useParceirosB2B.ts`.
- Formulários: `ParceiroB2BFormDialog.tsx`, `ProdutoresTab.tsx`, `ClienteFormTabs.tsx`, `ClienteDocumentosTab.tsx`, `ExcluirInativarDialog.tsx`.
- Contratos: `commercialRegistrationErrors.ts`, `schemas/cliente.ts`; regra estrutural registrada no bloco editável de AGENTS.
- Testes mantidos: `commercialRegistration.session.test.tsx`, `.validation.test.ts`, `.form.test.tsx`, `.delete.test.tsx`.
- Execução final: **72/72 em 8 arquivos** (cadastro, parceiro sessão, IE, telefone, scope Storage); sem somar execuções intermediárias sobrepostas.
- Lint dos novos hooks/helpers/testes PASS; lint ampliado registrou **30 erros/2 avisos** principalmente `any` existente, não PASS global. Não foi feito refactor geral fora do recorte.
- Scanners fiscal secrets/integration e diff-check PASS. Harness automático **build OK 16:11:24 UTC**, após corrigir declaração duplicada de `errors`; typecheck separado NOT RUN por instrução do ambiente, sem alegar execução manual.

## Pendências e gate
Authenticated path: **UNVERIFIED** (external_unmanaged). Sem signed-in server action/API real, não chamar erro publicado de resolvido end-to-end. Necessários browser real FSF/ARBio, mobile, troca de empresa, backend JWT e concorrência de cadastros/retries. Não criar Auth para fabricar PASS. Investigar divergência do hash de partner_audit_logs por baseline independente; não alterar o histórico. Cadastro B2B de login e legados órfãos continuam bloqueados conforme CADASTRO-1. **NO-GO integral**, sem próxima fase iniciada.