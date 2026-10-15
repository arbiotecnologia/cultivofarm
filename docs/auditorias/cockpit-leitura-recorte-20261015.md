# Cockpit existente — leitura e preparação, 2026-10-15

## Resultado
**NO-GO aplicação/publicação. Candidato local revisável; nenhuma mudança remota ou de UI.**
Não conceder EXECUTE isolado. Ownership OFF; diagnóstico e fabricação permanecem NO-GO. Não iniciado módulo/rota/fase nova.

## Proveniência externa pós-deploy eb33bc
Renato informou teste REAL em `app.cultivofarm.com.br`, não executado pelo agente:
- Admin AR gerou via UI `OS-2026-000003`, id `9d2e58ac-15f6-477b-bebd-55e440e71018`, da visita `f19c8343-6205-487a-a237-df4d8ee06471`.
- Programação `da5b7239-384c-48a5-8714-082967b90dd1` aguardando, volume NULL, log `commercial_completed=false`. Ordens e Fluxo Técnico PASS externo.
- Consultor AR login real: financeiro URL negado; Bombarbio visível; rascunho próprio `1995fdfa-2976-42a7-8a2b-0324497f76d2` editável. Cabeçalho da visita Admin visível, workspace/conversão negados, recomendações RLS zero.
- UI Admin Cockpit falhou na leitura. Não houve reprodução própria autenticada: Supabase externo sem sessão gerenciada.
Estes fatos não certificam todos os módulos, PDF baixado, concorrência ou produção. Não alterados registros/contas/sequências.

## Evidência própria: metadados canônicos read-only
**Baseline histórico anterior à contenção; ACL vigente está na atualização 17:45 abaixo. Não restaurar privilégios descritos neste histórico.**
Destino confirmado em configuração e marcador fiscal `swzpzcwiasxmjutrmvkm`. Consultadas definições/ACL/policies, não linhas operacionais.
- RPC `rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)`: SQL STABLE INVOKER, `search_path=public,pg_temp`, hash `53c9fdb94780b9666ca9b602ad95a813`. Authenticated/anon EXECUTE false conforme consulta anterior da rodada. Isso explica a falha relatada, sem prova browser própria.
- `vw_esteira_laboratorio`: invoker, hash `d72d5df7bacffdf8f4fc4282b804ab90`, SELECT anon/authenticated. **Invoker não assegura RLS da origem**: chama `private.h7n_esteira_laboratorio()` DEFINER.
- H7n hash `6a3e2b6e2d594af67cf6727c5b03c2b1`, `search_path=''`, authenticated EXECUTE true, anon false e sem USAGE private. Anon SELECT na view não prova vazamento: faltam esses privilégios. Higiene candidata remove anon na view, sem mudar outras views.
- H7n lê `mv_esteira_laboratorio`, sem RLS por linha. Admin/Gestor/Administrativo/Produção/Financeiro satisfazem predicado apenas por papel; técnicos por `get_cliente_ids_for_user`. **Não há filtro de empresa nem readiness ativo no corpo. P1 estrutural**, sem exploração/prova de leitura alheia com JWT próprio. Leitura direta da view também compartilha o risco.
- Cadeia: MV → `_src_vw_esteira_laboratorio` (invoker) → `vw_os_integridade_esteira` (invoker) → OS tradicional/onfarm e clientes/fazendas/talhões/produtos/microrganismos/parceiros/programação/lote/CQ/envase/estoque/entrega/aplicação. MV/src só service_role/postgres; view pública passa pela função privilegiada. **Policies das tabelas não se reaplicam à cópia materializada**.
- Hash MV `50e27806080f38e4adbd94f3bdf2db23`, src `c71226f594d27d92833686212415ccec`, integridade `865cd98310a4893ce0d930454300e0ab`. Tabelas operacionais auditadas têm RLS; restritivas de tenant por organização, clientes ou lote. Catálogo global mantém políticas próprias. Joins adicionais do RPC em programação/profiles continuam INVOKER e sujeitos às respectivas policies.
- Conversor confirmado `b112888e28d8a5727df713e0ae7bcd1b`. Migrations `20261015161648`, `20261015162631`, `20261015163930` preservadas, NÃO REAPLICAR.

## Candidato anterior — SUBSTITUÍDO, NÃO APLICAR
Descrição histórica abaixo: o arquivo agora contém SOMENTE contenção h7n; abertura de RPC foi removida.
1. Preflight destino + hashes h7n/RPC/view/conversor e dependências; fail-closed em drift.
2. H7n preserva papéis existentes e passa a exigir `technical_actor_ready(auth.uid())` e `clientes.organization_id` igual a organização server-side. Cliente NULL/órfão/alheio invisível; nenhum ownership legado inferido. Compartilhado com leitura direta da view.
3. RPC mantém INVOKER e contrato JSON/paginação/busca parametrizada. Antes de ler exige ator pronto, interseção papéis rota×fonte (Admin/Gestor/Produção/Administrativo) e resolver canônico `_saas_user_has_feature(...,'ordens_producao')`.
4. EXECUTE leitor somente no mesmo candidato que instala guard/fence. Revoga PUBLIC/anon; nenhuma abertura de programar/lote/publish. Pós-condição falha se ações operacionais estiverem abertas. Rollback seguro: remover EXECUTE do RPC; não restaurar h7n vulnerável.

**Bloqueadores antes de autorizar aplicação:**
- MV pode estar desatualizada: não auditados refresh/freshness nem invariantes de referências descendentes contra OS atual. Fence em cliente resolve o P1 direto de empresa, mas não prova todos os nomes/IDs contidos na cópia; não chamar proteção integral. Revisar OS/pais/descendentes e refresh antes de grant de leitura.
- View de integridade projeta **NULL::uuid como microrganismo_id no ramo onfarm**, embora coluna real exista; leitura micro-only pode perder identificação. Não corrigido aqui nem recalculado volume.
- `operador_onfarm` permitido na rota, mas não na fonte atual; candidato não amplia, RPC nega. Definir escopo canônico em revisão posterior, não autorizar só pelo menu.
- `usePendenciasEsteira` consulta view diretamente com key global `pendencias-esteira`, sem fence de sessão visível no hook; Cockpit key e ações/history precisam revisão de identidade/dados tardios antes de certificar UI. Não alterado frontend neste recorte.
- Fonte preserva Financeiro/técnicos para consumidores existentes. A feature da rota Cockpit não foi imposta indiscriminadamente a toda view: mapear entitlements dos consumidores antes de apertar a fonte; backend Cockpit candidato exige feature.
- Não compilado/aplicado no schema hospedado; preflight completo/ACL pós-condição dependem revisão canônica. Não executar candidato via SQL tool de leitura.

## Cabeçalho de visita versus workspace
Policy SELECT `registros_consultor_select_hardened` permite visita por carteira ativa **OU** participante (com duas restritivas tenant/referências). `can_view_technical_visit` exige readiness, referências tenant e, para técnico/consultor, carteira **E** (responsável **OU** participante). Logo cabeçalho same-tenant pode ser legível sem workspace. Conversão exige manage pré/pós-lock, nunca esse SELECT.
Diferença estrutural confirmada, compatível com relato externo; intenção funcional de exposição do cabeçalho não comprovada: registrar **dívida de contrato/UX**, não declarar vulnerabilidade nem apertar RLS cegamente. Metadados do cabeçalho ainda são dados: revisar campos/propósito separadamente, sem ampliar workspace/recomendações.

## Testes e limites
Resultado histórico 14/14; nesta atualização são **19/19 verificações**, PostgreSQL isolado, executa somente corpo h7n candidato e contenção arquivada. Auth/RBAC/readiness/carteira **simulados**, schema reduzido; NÃO prova JWT hospedado, RLS real, preflight completo nem duas sessões.
Cobertura atual: before vulnerável, contenção 42501, troca do corpo preservando ACL/owner, Admin AR só próprio; FSF não vê AR; inativo/readiness simulado; sem tenant; consultor sem carteira/carteira alheia; vínculo ativo/revogado/SQL NULL; Onfarm e SA não ampliados, UID ausente, anon negado. Cliente NULL, cliente inexistente e cliente com organização NULL excluídos. Não há teste de paginação/feature do RPC no candidato atual: RPC não é modificado nem liberado.
Teste persistente Vitest: `src/test/cockpit-laboratorio/tenantFencePostgres.test.ts`; regressões existentes de auditoria/refinamentos executadas junto. Nenhum snapshot/cópia de texto usado como prova de autorização.
**GO somente preparação local. NO-GO abertura da leitura/fabricação/publicação; Auth/RLS/browser/freshness/descendentes UNVERIFIED.**
## P1 prioritário — revisão 17:41 UTC
**Evidência externa SQL, NÃO browser FSF:** Renato informou ROLE authenticated com sub/iat/exp de FSF Admin retornando 2 linhas da view; MV com 2 linhas em 1 tenant. Isso promove o achado anterior estrutural a leitura entre empresas relatada externamente; não foi reproduzido pelo agente.

**Metadados próprios subsequentes:** marcador canônico true, corpo h7n ainda hash `6a3e2b6e2d594af67cf6727c5b03c2b1`, porém ACL agora somente postgres/service_role; authenticated EXECUTE=false e SELECT view=false. Não atribuímos autoria ou horário dessa contenção. O candidato PRESERVA esse fechamento, sem restaurar ACL antiga. Conversor b112888 intacto.

**Candidato atual:** `proposed-cockpit-esteira-read-tenant-fence.sql` substitui apenas h7n atomicamente. Exige readiness IS TRUE, tenant derivado por h15, cliente same-tenant não NULL, papéis antigos e `technical_client_link(...,['read','execute','manage']) IS TRUE` para técnicos. Helper ativo verifica ativo/revogado/janelas e nível; sem fallback por profile/carteira. SA exclusivo não ganha acesso. Não modifica RPC, view, MV, ACL, owner, dados ou operações. Preflight inclui hashes de corpo/dependências/MV/view/RPC/conversor; pós-condição confere corpo e ACL/owner preservados.

**Pós-aplicação preparada:** `postapply-h7n-containment-readonly.sql`, claims atuais/exp+3600 e ROLE authenticated/anon, rollback, sem gravações. Revisor fornece contas existentes validadas para AR/FSF/SA/inativo/vínculo revogado. Com ACL hoje fechada, probes produzem negação de permissão e NÃO certificam filtro tenant/controle positivo AR; nenhuma abertura ou bypass service_role permitido. Filtro só testado localmente enquanto essa ACL estiver fechada.

**Riscos mantidos:** a fence de cliente não certifica freshness nem referências/nome descendentes da MV. Não reabrir leitura até auditoria posterior. Candidato com hash-before não deve ser reaplicado após implantação; não restaurar corpo vulnerável em rollback. GO preparação para revisão independente; NO-GO aplicação autônoma, abertura Cockpit e fabricação. Três migrations aplicadas preservadas; ownership OFF.

## Atualização canônica 17:45 UTC — contenção aplicada externamente
Migration **20261015173622_h_cockpit_contain_cross_tenant_read JÁ APLICADA / NÃO REAPLICAR**. Arquivo literal: `scripts/rbac-audit/applied-20261015173622_h_cockpit_contain_cross_tenant_read.sql`, sem cabeçalho acrescentado ao SQL. Extraído de `supabase_migrations.schema_migrations`; hash da serialização `array_to_string(statements,E'\n;\n')`: **23baa516fcc2f9b7e7f1a985be25eeb3**. Esse hash não é o hash de bytes do arquivo com newline final.

- **Prova própria somente metadados/ledger:** marcador canônico confirmado; helper ainda `6a3e2b6e2d594af67cf6727c5b03c2b1`; EXECUTE authenticated=false, SELECT view/MV=false, RPC=false. Conversor **b112888e28d8a5727df713e0ae7bcd1b**, intacto. Nenhuma consulta a linhas operacionais nesta rodada.
- **Proveniência externa Renato:** aplicação da contenção e FSF view agora **42501**. Antes FSF retornou duas linhas; composição corrigida do relato: MV com **duas linhas, uma de tenant AR e uma sem cliente resolvido**, não duas linhas com tenant comprovado. NÃO browser FSF e NÃO reprodução hospedada pelo agente.
- Migration só revoga EXECUTE do helper e ALL da view de PUBLIC/anon/authenticated; não muda corpo, dados, MV ou ações. A negação fecha o caminho exposto, mas o corpo vulnerável permanece. Não reabrir grants antigos.

### Candidato rebaseado e validação
O candidato h7n exige a versão/nome/hash exatos do ledger de contenção, ausência de ACL explícita PUBLIC/anon/authenticated no helper/view e ausência de privilégios efetivos no helper/view/MV. Preserva ACL/owner no replacement e pós-condição impede reabertura. Os hashes-before de corpo/dependências e o conversor continuam obrigatórios; mudança concorrente aborta o candidato.

**17/17 Vitest PASS**, três arquivos, em 17:49 UTC; o harness contém **19/19 verificações PostgreSQL PASS**. Antes: predicado vulnerável simulado permite FSF ler AR e linhas sem escopo; contenção: SQLSTATE 42501 na view/helper; depois do replacement: ACL/owner iguais e view ainda 42501. Só no PostgreSQL descartável os testes permitem executar a função candidata para medir o filtro (AR/FSF/SA/anon/inativo/link revogado/SQL NULL). Nenhum grant remoto, nenhuma conta real. O hash-before da contenção é substituído apenas pelo hash da definição local reduzida: não representa compilação/preflight integral no schema hospedado.

Pós-aplicação `postapply-h7n-containment-readonly.sql` agora exige ledger/hash, corpo candidato e ACL fechada, e falha se leitura retornar até mesmo zero linhas sem 42501. Não executado remotamente: depende da aplicação/revisão pelo revisor e contas validadas; não vale PASS do filtro tenant. Freshness/descendentes e cache seguem não certificados. **GO preparação revisável; NO-GO aplicação pelo agente, abertura RPC/view, fabricação/publicação.** Quatro migrations arquivadas/aplicadas preservadas, ownership OFF, diagnóstico separado. Não há escolha humana necessária para excluir NULL; escopo não provado é sempre invisível.
