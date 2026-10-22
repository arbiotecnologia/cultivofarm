# Perfis fiscais existentes — refinamento local revisável

## Alterações

- `FiscalProdutos.tsx`: orientações sem exemplos arbitrários NCM/CFOP; estado de rascunho incompleto/revisão contábil/validação da operação, submit com fence e trava, conflito consulta versão atual; troca de scope limpa campos do produto.
- `useProductFiscalProfiles.ts`: leitores pelo wrapper canônico com isolamento ator/tenant/epoch e cache oculto após negativa; saves validam schema e ID/CAS, rechecando antes/depois dos awaits e antes da invalidação. RLS permanece autoridade. Não promete cancelar write já enviado.
- `productFiscalValidation.ts`: estado informativo não confunde classificação mínima ou revisão contábil com NF-e pronta. Sem campos ou códigos novos; rascunho vazio permanece permitido e nenhuma tributação default é enviada.

## Fontes oficiais lidas

- Portal Notas Técnicas: https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY=
- NT 2025.002 v1.52, publicada no portal em 01/10/2026: https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=HXPO8VLbh4o=
  PDF HTTP200, SHA256 `54ed893327040a20a4a3c0562d342953542a1dc98e55d73dbe607d6c13d3d416`. Seção3 informa tabelas CST/cClassTrib dinâmicas e vínculo às regras; não permite deduzir classificação pela família comercial.
- NT 2026.002 v1.11, publicada no portal em 01/10/2026: https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=m8aACnFLK/Y=
  PDF HTTP200, SHA256 `72c033b2c7490710f61488a14d0bb3d7bb54e5345aa8d33d6ff2c270c228f046`. Trata DANFE simplificado/autorização com alerta; não foi usada para inventar classificação tributária.

## Validação e limites

- **59/59 Vitest**: preparação5, hook/fences10, contrato existente34 e página unificada10. Testes adicionais comprovam a chave efetiva ator/tenant/request, invalidação somente do ator correspondente, revogação durante pré-check sem INSERT e negativa RLS sem sucesso/invalidação. Matriz completa em `FRONTEND-MATRIX.md`.
- Build automático da prévia: OK após alterações; sem execução manual de build/typecheck permitida neste ambiente. Não há recibo separado de typecheck integral da candidata coordenada; requer auditor.
- Nenhuma NF-e emitida, dado/role/session hosted alterado, SQL executado, Edge implantada ou publicação realizada.
- Prontidão fiscal final depende dos resolvers existentes para estabelecimento/regime/operação/RTC e homologação real; este refinamento não os substitui. Escritas servidor/schema/RLS preservados.
- Evidência informada pelo proprietário02:26: Superadmin criou INS-4 TESTE AUDITORIA QUIMICO 20261021 — SEM USO COMERCIAL (inseticida/químicos/Inseticida) e SOLO-4 TESTE AUDITORIA FERTILIZANTE 20261021 — SEM USO COMERCIAL (solo/fertilizantes/sem rótulo). Ambos inativos/fora B2B, sem dose/composição/fiscal inventados. Não recriados, alterados ou consultados como fixtures pelo agente. Financeiro/documentos fechados.
- UI autenticada real e regressão completa do editor de microrganismos/IBS-CBS não homologadas nesta rodada; refinamento focal produto não certifica os leitores irmãos.

## Conferência 02:28 — cache frontend não substitui RLS

`PRODUCT_FISCAL_KEYS` são prefixos de recurso; todas as quatro leituras usam `useScopedPortalQuery`, que acrescenta `actor.scope` e `fence.scope` contendo ator/tenant/papéis/epoch. Teste verifica a chave efetivamente registrada no QueryClient. Não havia leitura raw usando só o prefixo. Correção focal: invalidação pós-save antes ampla agora filtra o sufixo do ator capturado; rechecagem dupla após awaits e antes/depois da invalidação. CAS continua `.eq(id).eq(product_id).eq(updated_at)`; zero rows é conflito, não sucesso.

Consultas hosted SOMENTE LEITURA, após validar `supabase/config.toml` ref `swzpzcwiasxmjutrmvkm`:
- `product_fiscal_profiles` RLS=true; SELECT permite administrador/gestor/financeiro por role, **sem predicado tenant**; INSERT/UPDATE exigem `is_platform_superadmin(auth.uid())`; DELETE=false.
- View readiness possui `security_invoker=true`. Tabela perfil não tem organization_id/tenant_id; tem FK product_id→produtos, sem unicidade product_id listada; trigger fiscal_audit AFTER INSERT/UPDATE/DELETE, nenhum trigger BEFORE updated_at listado.
- Portanto isolamento frontend foi testado, **isolamento server-side tenant não foi comprovado**. Superadmin-only sem papel interno também não está incluído explicitamente na política SELECT capturada; fluxo create `.select()`/pré-check depende disso. Não habilitar fiscal para parceiros/novos perfis nem inferir autoridade da família ou do cache.
- Timestamp CAS é preservado no cliente, mas avanço automático de updated_at no servidor não foi comprovado nesta captura; exige revisão/teste real concorrente antes de homologar edição. Não alterar RLS, schema ou triggers nesta rodada.
- SQL sintético e policies lidas não equivalem a negativos JWT/RLS reais. Gates fiscal e pacote conjunto permanecem NO-GO para ativação independente não revisada.

Aviso falso no formulário global corrigido: criação com classificação pendente seguida de classificação canônica; tipo de aplicação não determina família. Fluxo criação existente:25/25 testes passaram; sem teste de copy/markup adicionado.

## Candidata fiscal GLOBAL — revisão a70923ea

Os registros anteriores descrevem o runtime/achados daquela rodada; a correção abaixo permanece **fora do runtime**, em `global/`.

- `frontend.patch` e cópias reutilizam FiscalProdutos dentro da plataforma; não criam cadastro paralelo. Superadmin exige sessão com sujeito correspondente, perfil ativo, senha definitiva e monitor pronto. Internos ficam somente leitura; nenhum canal tenant/B2B é concedido.
- Perfis ativos são filtrados explicitamente antes de `maybeSingle`; histórico não é usado como alvo editável. Saves preservam CAS/ID e fences. IBS/CBS produto compartilha autoridade, nega escrita interna e oculta resposta de epoch anterior; serviço/empresa não são promovidos neste recorte.
- `candidate.sql.review`, montado por `assemble_sql.py`, agrega guard estrutural e guards de funções antes da mudança; tabela global existente, unique parcial e auditoria preservados. Autoridade de escrita combina `platform_actor_access_ready` e `is_platform_superadmin`; trigger usa gate existente e avança timestamp. Histórico inativo imutável; IBS/CBS active-only com CAS. `rollback.sql.review` fecha escritas sem restaurar política fraca.
- **26 verificações PostgreSQL locais**: negativos de perfil/senha/convite/papéis, leitura interna, duplicidade ativa, histórico, corrida CAS e rollback. Schema/Auth reduzidos: não provam guard de baseline hosted completo, JWT/RLS real ou integração hosted.
- **10/10 Vitest candidatos** para sessão/monitor/leitura interna e IBS/CBS negado/tardio; regressões runtime **59/59**. Build automático da prévia OK, mas não compila automaticamente as cópias inativas; typecheck integral destas cópias permanece gate independente, não foi executado manualmente.
- **Authenticated path: UNVERIFIED**. Supabase externo não oferece sessão gerenciada para esta checagem; candidata não instalada. Provas reais de RLS/CAS e UI Superadmin dependem de revisão/aplicação pelo auditor; não houve SQL hosted, emissão NF-e, publicação ou alteração INS-4/SOLO-4.

### Complemento 02:38 — CAS direto do editor

- Achado hosted read-only informado por Renato: somente trigger AFTER `fiscal_audit_trigger`, sem avanço de `updated_at`; `buildUpdatePayload` não envia timestamps. Logo o CAS atual pode aceitar duas escritas com token antigo. Admin B leu os fixtures e tentou salvar INS-4 vazio: nenhum perfil foi criado, mas o runtime ainda oferece edição indevida; não marcar esta UI como corrigida antes da promoção revisada.
- A candidata já introduz BEFORE row server-owned: `greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond')`, ignorando timestamp do chamador e abrangendo UPDATE direto e IBS/CBS. Auditoria AFTER existente não é removida nem substituída; token e auditoria participam da mesma transação.
- Teste reforçado **34/34 PostgreSQL local**: reproduz primeiro dois UPDATEs aceitos com AFTER-only; depois duas conexões reais usando o mesmo token no UPDATE do editor produzem exatamente um retorno de linha e um zero rows (conflito do hook), e repetição sequencial stale retorna zero. Timestamp avança; ROLLBACK transacional restaura token e auditoria; rollback deny-only continua fechado. Trigger de auditoria do teste é um double AFTER, não o corpo hosted: preservação integral hosted ainda depende do auditor.
- Vitest de acesso candidato **10/10** novamente PASS. Nenhum dado real ou perfil fiscal foi criado/alterado; SQL e frontend continuam candidatos inativos.
- Auditor informou financeiro **35/35**, layout/filtros **19/19** e **tsc candidato PASS**; evidência atribuída ao auditor, não execução do agente, nem homologação SQL multiperfil/produção ou typecheck fiscal global integral.
### Correção 02:47 — bloqueio do auditor sobre 0442dcdc (gate e leitor produtos)

- **Falha 1:** `cf_user_guards_v1.acquire_gate()` (hosted md5 `b0dd9a14d5fd799a40df0975baf4c5a6`, PG 17.6, corpo com CRLF) aceita só profiles/user_roles/user_clientes/partner_users/auth.users; o a00 anterior sempre falharia `invalid_user_guard_context`. Whitelist **não** ampliada. Novo `platform_private.global_product_fiscal_statement_gate()` exige BEFORE/STATEMENT/INSERT|UPDATE/`product_fiscal_profiles`, nega authenticated sem `auth.uid()` e trava `FOR UPDATE` a mesma linha `cf_user_guards_v1.state` antes dos triggers de linha, sem incrementar `revision` (contador de identidade usado pelo cache authz). EXECUTE revogado de todos os papéis da API.
- **Falha 2:** `produtos` SELECT cobre só internos e B2B ativo; o editor faz join a partir de `produtos`, logo Superadmin teria lista vazia. Nova policy apenas SELECT `produtos_select_platform_fiscal_superadmin` com `global_product_fiscal_write_ready()` (sessão real, perfil ativo, senha definitiva, sem convite em processamento, Superadmin). `produtos` é global (sem coluna tenant, assertivo); policies internas/B2B e writers d51_5 intactos. Rollback fecha só essa leitura (`USING(false)`).
- Preflight/guard assertivos: md5 de `acquire_gate`, whitelist sem `product_fiscal_profiles`, `produtos` fingerprint `203dcf0c094aca585a44153317fe03c9` (lido 02:4x; demais cinco fingerprints reconferidos iguais), ausência prévia de policy/função, sem coluna tenant. Postflight confere a00→gate fiscal e `acquire_gate` inalterado.
- Harness agora instala o **corpo real** (`live-acquire-gate.sql.review`, bytes exatos, md5 conferido localmente em PG 17.9) e reproduz as duas falhas antes da candidata. **50/50 checks PostgreSQL**: defeitos 1 e 2, gate fiscal rejeita uso em outra tabela, conflito de lock real com writer de `user_roles` (lock_timeout), revisão inalterada, visibilidade produtos Superadmin2/Admin2/B2B1/anon0/Superadmin inativo0, join do editor visível, mais todos os checks anteriores (CAS, histórico, IBS/CBS, rollback). Vitest candidato 10/10. Frontend não mudou; nada de C2 no pacote.
- SHA256: candidate `057060db…88b8`, migration `48f5465f…0116`, rollback `52339e25…ddcf`, preflight `bc8c528f…abe3c6`, postflight `5d6f47f4…374d`, guard `aa9902d7…43fa`, gate real `d93b4cbc…cb86b`, harness `00ad79cd…b4cc`.
- Somente leituras hosted (corpo/md5 do gate, policies/fingerprints, view readiness). Nenhum DDL/DML hosted, Edge ou publicação. Limites: readiness Superadmin ainda depende de `fn_fiscal_company_crt()` (não revisado aqui); prova JWT/RLS real e UI Superadmin31/adminB ficam para o auditor após promoção.
