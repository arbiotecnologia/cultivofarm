# Recuperação focal de aprovação OS — candidata, não implantada

## P0 revisão14:18 — alias de catálogo e rollback UI corrigidos

**A validade anteriormente alegada do rollback UI fica retirada.** Auditor encontrou42703 `record c has no field relowner` no PRE integral: o record PL/pgSQL `c` colidia com alias `pg_class c`. Corrigiu apenas `table_acl_rls` para `class_row` e informou **PRE PASS20 funções+schema/triggers/policies/indexes/ACL/RLS** em produção READ ONLY, sem alterar hashes/expectativas. Essa evidência é do auditor; nesta rodada não executamos nenhuma operação hosted. Candidata44be9a **não implantada**.

Propagado o alias no assembler e nos quatro SQL: PRE/candidate/rollback/POST. Corpos das RPC/helper, `post-hashes.json`, expectativas de ACL/RLS/schema e assinatura continuam idênticos. Novos SHA256: candidata `e90775f3f6f26194d7e3b3cf53eab1c92b9447cc54bbd122371c7233ff6b1d8e`; rollback SQL `d079910091f81e9cad72150df789d1cbeec76b16758481177c1d8797e7ec6b1d`; PRE `4395b9f5f6c34b66f29145bec56921131f9ec78e01528c57ed8aefac15ca1cf4`; POST `048d4c72b522b6f91a9cd3a956e1df83bbc0034ab1eca5b23fcea7cd8019ceb1`. Os hashes históricos abaixo identificam pacotes anteriores, não os SQL corrigidos.

Rollback `rollback/OSDetalhesDialog.tsx` recuperado via `git show ff80adabd0d70eebd7d7da641831f7d020647814:src/components/ordens-servico/OSDetalhesDialog.tsx`, **byte-exato SHA2569c20bd608f1cd8109df806ea4cc5db829ce3a9aaadd20e652e856d024cc0bc37** informado pelo auditor. Não usa HEAD móvel e não contém a ação Aprovar adicionada na candidata. Manifest pre corrigido para9c20bd..., post permanece d181e5...; commit baseline registrado. Stage fixa commit e digest independentemente do manifesto, exige pre≠post e escopo único, recusa manifesto rehashado para HEAD/pre=post e candidata reapresentada como rollback. Nunca altera checkout em uso.

Validações locais: **PG138/138**, com os quatro SQL completos byte-exatos recusando catálogo reduzido por BODY_DRIFT atomicamente. Como isso antes ocultava o erro tardio de catálogo, o harness adicional extrai e executa **cada uma das6 expressões IF table_acl_rls emitidas sem mudar expectativa**, mantendo record `c` vivo; todas alcançam DRIFT esperado em catálogo reduzido e reproduzem42703 quando somente alias é mutado para `c`. Isso demonstra a correção específica, **não PASS integral em catálogo equivalente**. Staging **8/8**, incluindo comparação com Git commit exato e negativos com destino intacto. Vitest aprovação+AuthProvider/opener **42/42**; build automático14:19:39Z OK, checker app/node novo não executado (runtime app intocado). Sem certificação JWT/HTTP/homologação real, sem DDL/DML hosted/publicação.

Rollback UI agora tem prova local byte-exata e negativos; rollback SQL continua condicionado a POST integral real sem drift, não testado com sucesso em catálogo integral equivalente. Antes de implantar auditor deve repetir PRE dos bytes novos e revisar candidata/POST/rollback. Manifest/SHA256SUMS atualizados sem afrouxar nenhum contrato. Snapshot typecheck anterior preservado, não corresponde aos scripts/tests atualizados.

OS real `18ea0531-ef73-4dbf-9b58-b064cfc50d0e`, produto sintético e monitor/runtime permanecem intocados. Continuação reutiliza essa OS; programação/avanço seguem fechados. Diagnóstico/lifecycle posterior segue proposta não implementada, sem restaurar bytes sob incerteza.

## Complemento real14:13 e regressão local14:17

Auditor informou versão publicada com bundle `index-CznUV5-v.js` e criação pela sessão real admin B da **OS-2026-000001**, id `18ea0531-ef73-4dbf-9b58-b064cfc50d0e`, aberta, volume100, produto sintético existente. **Não criar outra OS nem reaplicar seed**. Isso atualiza o relato anterior de nenhuma OS criada/pending, mas NÃO prova implantação da candidata de aprovação deste pacote, elegibilidade de aplicação ou homologação de anexo/revogação.

SELECT canônico desta rodada confirmou apenas a fixture identificada: status aberta, tenantB e produto esperados, **uma programação aguardando e zero lotes**. Marcador de ref validado antes das leituras: `swzpzcwiasxmjutrmvkm`. Sessões A/B não foram acessadas/recarregadas/modificadas; nenhuma escrita hosted ocorreu.

### Badge: origem demonstrada, não autoridade de avanço

`vw_os_integridade_esteira` MD5 `e8331dbe2bc538cf21fad123fb43f19b` determina `WHEN ed.programacao_id IS NOT NULL THEN 'programada'`, sem exigir `status_os=programada`. `_src_vw_esteira_laboratorio` MD5 `c71226f594d27d92833686212415ccec` preserva esse resultado, salvo override em_producao. O INSERT canônico cria filho aguardando mesmo quando OS aberta. A consulta efetivamente montada é `CockpitConsulta`, que exibe `status_esteira_oficial` da lista protegida; o workspace operacional não é montado. Logo o badge descreve a presença do filho, **não demonstra aprovação/programação da OS**. Não modificar view, mapeamento canônico ou liberar ações por esse badge. A aprovação candidata usa OS aberta/autoridade server-side, nunca badge como autorização. A revisão futura de programação precisa distinguir filho preparado de agendamento confirmado e os efeitos downstream; segue fechada.

### Lifecycle Auth: reprodução separada de expiry

Evidência fornecida: initial14:02:26.384Z; TOKEN_REFRESHED14:02:57.244Z; UI Verificando acesso/perda de modal e draft; SIGNED_IN14:03:05.332Z; sem cultivo-authz-expire. Nenhum papel revogado nesta rodada. **Não atribuir todas as pausas reais ao mesmo motivo**; logs completos/latência real/suspensão ainda não certificados.

`useAuth.tsx` atualmente trata TOKEN_REFRESHED e USER_UPDATED como authorizationChanged: limpa preferência/cache/perfil/roles, coloca loading e agenda carregamento fora do callback. Isso desmonta o monitor e a página mesmo quando a identidade/escopo confirmados posteriormente são iguais. Regressão com **AuthProvider/monitor/boundaries/opener reais e transporte fake** reproduz a perda imediata de draft/modal/cache/Blob sem warning expiry, e SIGNED_IN posterior não recupera estado antigo. Não houve mudança de runtime para preservar bytes sob incerteza.

`src/test/config/financialAdminEnvironment.integration.test.tsx` acrescenta12 casos (financeiro/admin): principal igual; confirmação com RTT3s e PDF antigo tardio; mudanças role/tenant e has_role revogado; h15 positivo antigo que retorna depois da renovação/negação atual. Controles existentes continuam cobrindo90s RTT3s/foco/visibility, lease15s e retorno de aba suspensa com timers parados. **101/101 Vitest em6 arquivos PASS** (inclui diálogo aprovação), staging SQL4/4 PASS. Não é JWT/RLS hospedado nem reprodução browser da sessão real. Build automático observado14:16:36Z OK; nenhum checker manual app/node nesta entrega, recibo anterior não transfere a teste alterado.

### Proposta limitada posterior ao pacote OS — não ativada

1. Diagnóstico local de lifecycle no AuthProvider existente, separado de cultivo-authz-expire: ring bounded e allowlist de evento Auth, fase reset/scheduled/confirmed/stale/failure, booleanos sameIdentity/sameConfirmedScope, visibility/online, deltas monotônicos de carga/lease. Sem UID/tenant/roles/fingerprint/PII/token/URL/erro bruto, sem envio ou persistência. Não reutilizar ausência de warning expiry como prova de ausência de invalidação Auth; cleanup atual limpa o ring de monitor.
2. Manter bloqueio imediato de ações, invalidação de requisições e descarte de cache/Blob durante renovação. Mesmo UID NÃO autoriza preservar dados. Propor somente buffer temporário de campos não sensíveis da OS/modal enquanto UI protegida está desmontada; só restaurar após perfil/roles próprios+h15 final e lease fresh válidos, escopo canônico exatamente igual e mesma geração. Nunca restaurar respostas/downloads/bytes/consulta ou usar token claims como autoridade. Revogação/erro/timeout/scope change/retry explícito/logout descartam o buffer. Sem estender lease ou criar monitor/novo gate.
3. Implementar somente depois de concluir/revisar pacote OS e matriz de campos seguros; sem generalização automática B2B/outros papéis. Nesta entrega a regressão caracteriza o comportamento atual e sua segurança, **não afirma correção de disponibilidade**. Diagnóstico novo e buffer ainda não implementados.

Financeiro A permanece no preview antigo segundo auditor. Seu seletor OS vazio enquanto OS B está aberta/inelegível **não prova isolamento**. Aprovação A/B, aplicação/anexo/revogação reais continuam pendentes. Contratos/v6 não avançados.

### Integridade preservada

Nenhum arquivo do pacote SQL/staging/manifest/snapshot foi alterado. Hashes rechecados: candidata `2c3d28f33e0199ceadfd6706d1574e390ae5cd1f747e1afce9a7870c08fbedb8`; rollback `ccb3cb8ff9f6b1b7a6d2851c151d1a88fd74730666ce002035aee2114821c7c5`; PRE `ab026d8d859101e83c7b4197ab94e0b060a38a8230cb1f0a558a28d55d83521f`; POST `6ae5413fe435be05a78812fa99007dec472ab3bcbcc104eee6f67f09e8121728`; manifest `b05b79f860426faaff85a3b6b1310e09d7f1abb9b2aef177b9dfdd62f26429c6`. Rollback desta rodada complementar: remover apenas12 novos casos do teste e este complemento documental; runtime/DDL permanecem intocados. Uma consulta SELECT de catálogo teve42601 por parentização e foi substituída por leitura right(...) simples; nenhuma mutação aconteceu. Não confundir isso com execução dos SQL de migração/preflight.

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
4. Na sessão admin B mantida, reutilizar **OS-2026-000001/id18ea0531-ef73-4dbf-9b58-b064cfc50d0e**, já criada pelo auditor. Confirmar aberta/filho aguardando e produto sintético existente; não criar outra OS/filho nem inserir status avançado.
5. Abrir detalhes→Aprovar OS. Confirmar aprovada, uma auditoria, filho aguardando, nenhum lote/produção/entrega. Testar replay e SQL claims com iat fresco/ROLLBACK separado; não chamá-lo login real. Sessão A não pode aprovar/ver OS B; perfis não alterados pelo agente. Revogação A/B é teste real futuro conduzido pelo auditor, não realizado aqui.
6. **Parar em aprovada.** Programada→produção→CQ→envase→pronto_entrega/aplicação permanece dependente das revisões acima. Não concluir homologação positiva PDF/anexos/aplicação/revogação. Contratos B2B não avançados.

## Recibos externos preservados

Auditor confirmou1671 hashes zero divergência, tsc app/node EXIT0 e93/93 da candidata ff80ad. Relato inicial deployment pending/nenhuma OS é histórico, atualizado pelo complemento14:13 com bundle publicado e OS criada. Isso não certifica implantação da candidata aprovação. Seed sintético já ensaiado ROLLBACK PASS e COMMIT PASS/pós-consulta; não reaplicado. Findings anteriores continuam; não afirmar projeto sem risco/findings. Sessões reais A/B não acessadas/recarregadas ou modificadas nesta entrega.
