# Recuperação focal de aprovação OS — candidata, não implantada

## Resultado e recorte

Primeiro bloqueio efetivo tratado: `rpc_aprovar_os_v1(uuid,text)` já existe, mas EXECUTE está somente com postgres. Não foi feito apenas GRANT: candidata substitui **essa RPC** e **seu helper privado existente** para negar alias B2B, comprovar tenant da OS manual diretamente, ordenar locks de perfis (ator/responsáveis) e bloquear alteração das roles existentes durante aprovação. Mantém h15, readiness, SaaS `ordens_producao`, `has_role` administrador/gestor, reader scoped h7n, fabricação biológica, cardinalidade/tenant/pais da programação, responsável ativo e ausência de lote. Reautoriza antes de replay e após UPDATE. Sem endpoint/resolver novo, fabricação, data artificial ou OS avançada por INSERT.

Diálogo **existente** de detalhes OS recebe `Aprovar OS`, limitado a aberta não-B2B, admin/gestor. O servidor continua autoridade. Usa cliente canônico e assinatura live, lock local síncrono, timeout12s/abort e fence de ator/tenant/roles/epoch/recurso/abertura via `useStorageAccessScope`; resposta tardia não confirma sob outro contexto. Após sucesso mostra aprovada no próprio diálogo. Não chama programar/avançar/lote/CQ, não envia comunicações. A lista pode refletir o status via Realtime existente ou atualização manual; não foi introduzido segundo fetcher. A aprovação pode ter sido commitada antes de timeout/revogação: ausência de sucesso UI NÃO afirma rollback remoto; consultar OS antes de repetir. Replay server reautoriza.

`client.ts` usa `cultivofarm.types`, não `types.ts`; o snapshot canônico ainda não contém a RPC instalada. Adaptador local estreito só para nome/argumentos auditados, com retorno desconhecido validado via presença de campos. Nenhum cliente paralelo, regeneração de tipos ou `any` amplo.

## Arquivos e fingerprints

Pacote `scripts/os-approval-recovery/`:
- `preflight-readonly.sql`: 20 corpos/owner/ACL/search_path/volatilidade + schema/triggers/policies/indexes/table ACL/RLS; ref marcador exato. Sem dados pessoais nos resultados.
- `candidate.sql.review`: transaction/lock_timeout3s/statement_timeout15s; guard PRE; substitui helper/RPC; concede **somente RPC** a authenticated; POST integral; COMMIT. Não executar automaticamente.
- `rollback.sql.review`: exige POST integral atual; fecha RPC para authenticated, restaura corpos PRE byte-exatos, valida PRE; preserva dados/auditoria/status/histórico. NÃO apaga OS ou desfaz aprovação de negócio. Não instala se candidata ausente; drift recusa.
- `scope.sql.review`, `rpc.sql.review`, `rollback/*.sql.review`: corpos revisáveis existentes.
- `assemble.py`: monta arquivos offline a partir de contratos fixos; variável `v_executor_roles` sem colisão pg_policies.roles; nenhuma CASE ambígua.
- `post-hashes.json`: hashes extraídos via pg_get_functiondef em PostgreSQL17 local.
- `manifest.json`, `manifest.sha256`, `SHA256SUMS`, `stage.py`, `test_stage.py`: staging fora do checkout, byte-exato e com proteção de AuthProvider/Storage/PDF/cliente/NovaOS.

SHA256 candidata `2c3d28f33e0199ceadfd6706d1574e390ae5cd1f747e1afce9a7870c08fbedb8`.
SHA256 rollback `ccb3cb8ff9f6b1b7a6d2851c151d1a88fd74730666ce002035aee2114821c7c5`.

| Função | PRE MD5 | POST MD5 |
|---|---|---|
| rpc_aprovar_os_v1(uuid,text) | d65be82dbf38ec429b7377bd6873ba47 | 1023b9d5210534bee16147e2ce29ee12 |
| private.assert_os_approval_scope(uuid,text) | 8c3142a07b3f310082309ef50f8b32dd | f478fba6b5ecc18f4355bcfcfb0c3def |

Helper aplicação implantado `04067ba43cea3eed845a1fd3735061e0` permanece obrigatório no PRE/POST e intocado. Storage correto termina **4823**;4827 era transcrição. Pacotes aplicação/PDF congelados não editados.

## Auditoria READ ONLY e dependências concretas

Marcador `public.fiscal_environment_marker` retornou `swzpzcwiasxmjutrmvkm`. Leituras de catálogo somente, sem fixtures hosted. Houve chamada acidental da ferramenta de dados com `SELECT 1`: nenhuma DDL/DML e nenhum dado alterado; não contar como probe authenticated ou evidência de homologação.

`fn_create_programacao_on_os_classica_insert()` MD5 `27b31332cebda532e2d99d9547f9b67c` cria uma programação aguardando ao INSERT aberta, com data default atual e volume da própria OS. `guard_tenant_organization_id()` MD5 `d01a740c1e3e02407131d2b9228bf658` atribui organização h15 quando auth.uid presente. Portanto o caminho autenticado normal pode produzir o filho coerente; não criar segundo filho nem inventar tenant de legado/service uidNULL. O positivo real deverá confirmar esse filho após INSERT. FK responsável aponta `profiles(id)`; h7n usa `profiles.user_id`, helper usa id conforme FK. Se esses identificadores divergem, reader falha fechado: **não reparar dados automaticamente**.

Bloqueios ainda fechados:
1. `rpc_programar_os_v1(uuid,text,date)` PRE `a42d6b07f51e6dacf41096f6cefb8163`, ACL postgres/service_role, contém autoaprovação aberta→aprovada→programada e não apresenta fence canônico h15/readiness/role/SaaS completo antes de replay; dispara refresh MV global. Não conceder ACL nem usar para fixture avançada. Candidato histórico fechado local de programação NÃO foi implantado nesta entrega.
2. `_avancar_os_status(text,uuid,text)` `3da8242d67462c916a2d971f5ea7bb97`, service-only: percorre vários estados por updates, sem autoridade do chamador/lock explícito. Não abrir.
3. `fn_avancar_etapa_esteira(text,uuid,uuid,text,uuid)` `7ed490f667efcd6e50eb7a2a061899b6`, service-only: aceita responsável indicado, trava OS/programação mas carece fence tenant/pais/ator completo; altera CQ. Não abrir.
4. `fn_sync_os_classica_downstream()` `06e64b76968f91e19f03b24363ac610a` pode criar lote ao em_producao. Esse efeito, geração de lote, CQ aprovado, envase/reserva/entrega e locks relacionados exigem revisão própria antes de qualquer avanço elegível para aplicação. Não há plano que salte essas dependências com status fake.
5. Ordem locks candidata OS→perfis ordenados→organização→roles→pais→programação recheck reduz races locais, mas **não certifica toda família de writers** nem ausência global de deadlock/ABA. Timeout recusa atomicamente; inserção de nova role concorrente não muda autoridade de admin/gestor já comprovada, remoção das roles existentes é bloqueada/revalidada. Locks de perfis não provam writers v6; v6 OFF.

## Testes efetivos e limites

- PostgreSQL local: **126/126** verificações. Corpos candidatos reais + três triggers históricos hash-matched; schema/fonte de lista/Auth h15/readiness reduzidos/emulados. Positivos A/B, papel gestor/onfarm preservado, NULL/inexistente/origem inválida/B2B, tenantNULL/cross-tenant, responsável inativo, produto não biológico, filho errado/ausente, lote existente, papéis negados, readiness/feature, INSERT avançado negado, replay sem segundo audit, duas conexões authenticated concorrentes uma aprovação+um replay, DELETE role commit durante lock wait negado sem avanço. `has_role` da prova concorrente lê tabela local; claims/helpers emulados **não são JWT real**.
- Arquivos **completos e byte-exatos** PRE/candidate/rollback/POST executados via `psql -f`, guardas intactas. Catálogo reduzido recusa BODY_DRIFT, sem42601/42702 e sem alteração persistida; isso **não é execução bem-sucedida integral em catálogo equivalente**. Corpo rollback restaura MD5/ACL e retém histórico; candidata/rollback guardados bem-sucedidos dependem do preflight real do auditor. Esse limite não é ocultado por remoção/substituição de guardas.
- Vitest **48/48**: formulário Radix progressivo/produto/validação + diálogo aprovação com transporte fake, doubleclick, assinatura exata, papéis/B2B, negativa/resposta inválida e resposta tardia após revogação. Não browser hosted.
- Staging **4/4**: candidate/rollback bytes, destino interno/não vazio recusados.
- Build automático mais recente observado `2026-10-19T14:11:27Z build OK`; SWC/Vite sozinho não comprova tipagem. Erros da assinatura/retorno encontrados pela prévia foram corrigidos. Não executado checker manual por restrição do harness; **sem PASS app novo**.
- Snapshot novo `scripts/os-approval-recovery/typecheck-snapshot/`:1672 arquivos/26 partes gzip-base64 UTF8, exclui segredos/env/deps/Git; manifesto SHA `a858a2ed461bf3a8b517c9dcbccdf79743d0d5db1b94e0809dedd8c8bcaba524`. Recuperar JSON path→conteúdo, binários conforme manifesto, validar hashes e instalar dependências com scripts desabilitados; executar `tsc -p tsconfig.app.json --noEmit` e `tsc -p tsconfig.node.json --noEmit`. `tsconfig.json files:[]` e `package typecheck=tsc --noEmit` não são recibo de app. Auditor informou EXIT0/93 testes para snapshot anterior ff80ad; não certificar esta alteração com esse resultado.

## Passos executáveis condicionados à revisão do proprietário

1. Auditor valida ref e executa `preflight-readonly.sql` integral. Qualquer drift: parar, não ajustar expectativa para passar.
2. Revisar candidata/rollback e limites locks, então aplicar apenas candidata aprovação. Reexecutar POST integral. Não seed novamente, não abrir RPCs de programação/avanço nem alterar roles/sessões.
3. Publicar diálogo somente após aceite/POST pelo proprietário; staging não publica.
4. Na sessão admin B mantida, Nova OS existente: cliente `cc586e4a-8953-4f3c-9a38-57e3665d1667`, fazenda `46bea8e9-79fc-440b-bdb5-76f40ba4550f`, talhão `806d9789-a87e-4e25-8d59-aa9eea24dabe`, org `8f57c7dd-0557-4041-b401-7a00f7244626`, produto sintético já criado `1986af48-709f-4bf4-85b4-3c9ed8a61019` biológico/dose100. Área e data reais do formulário; nome/observação de teste. Submit deve criar **aberta** e filho automático aguardando tenant B; não fabricar/inserir OS avançada.
5. Abrir detalhes→Aprovar OS. Confirmar aprovada, uma auditoria, filho aguardando, nenhum lote/produção/entrega. Testar replay e SQL claims com iat fresco/ROLLBACK separado; não chamá-lo login real. Sessão A não pode aprovar/ver OS B; perfis não alterados pelo agente. Revogação A/B é teste real futuro conduzido pelo auditor, não realizado aqui.
6. **Parar em aprovada.** Programada→produção→CQ→envase→pronto_entrega/aplicação permanece dependente das revisões acima. Não concluir homologação positiva PDF/anexos/aplicação/revogação. Contratos B2B não avançados.

## Recibos externos preservados

Auditor confirmou1671 hashes zero divergência, tsc app/node EXIT0 e93/93 da candidata ff80ad. Deployment solicitado `a25497c3-d44c-4765-aed9-887875a127be` informado **pending**, sem nova confirmação pelo agente. Seed sintético já ensaiado ROLLBACK PASS e COMMIT PASS/pós-consulta; não reaplicado. Nenhuma OS ainda no relato. Findings anteriores continuam; não afirmar projeto sem risco/findings. Sessões reais A/B não acessadas/recarregadas ou modificadas nesta entrega.
