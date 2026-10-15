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
Destino confirmado em configuração e marcador fiscal `swzpzcwiasxmjutrmvkm`. Consultadas definições/ACL/policies, não linhas operacionais.
- RPC `rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)`: SQL STABLE INVOKER, `search_path=public,pg_temp`, hash `53c9fdb94780b9666ca9b602ad95a813`. Authenticated/anon EXECUTE false conforme consulta anterior da rodada. Isso explica a falha relatada, sem prova browser própria.
- `vw_esteira_laboratorio`: invoker, hash `d72d5df7bacffdf8f4fc4282b804ab90`, SELECT anon/authenticated. **Invoker não assegura RLS da origem**: chama `private.h7n_esteira_laboratorio()` DEFINER.
- H7n hash `6a3e2b6e2d594af67cf6727c5b03c2b1`, `search_path=''`, authenticated EXECUTE true, anon false e sem USAGE private. Anon SELECT na view não prova vazamento: faltam esses privilégios. Higiene candidata remove anon na view, sem mudar outras views.
- H7n lê `mv_esteira_laboratorio`, sem RLS por linha. Admin/Gestor/Administrativo/Produção/Financeiro satisfazem predicado apenas por papel; técnicos por `get_cliente_ids_for_user`. **Não há filtro de empresa nem readiness ativo no corpo. P1 estrutural**, sem exploração/prova de leitura alheia com JWT próprio. Leitura direta da view também compartilha o risco.
- Cadeia: MV → `_src_vw_esteira_laboratorio` (invoker) → `vw_os_integridade_esteira` (invoker) → OS tradicional/onfarm e clientes/fazendas/talhões/produtos/microrganismos/parceiros/programação/lote/CQ/envase/estoque/entrega/aplicação. MV/src só service_role/postgres; view pública passa pela função privilegiada. **Policies das tabelas não se reaplicam à cópia materializada**.
- Hash MV `50e27806080f38e4adbd94f3bdf2db23`, src `c71226f594d27d92833686212415ccec`, integridade `865cd98310a4893ce0d930454300e0ab`. Tabelas operacionais auditadas têm RLS; restritivas de tenant por organização, clientes ou lote. Catálogo global mantém políticas próprias. Joins adicionais do RPC em programação/profiles continuam INVOKER e sujeitos às respectivas policies.
- Conversor confirmado `b112888e28d8a5727df713e0ae7bcd1b`. Migrations `20261015161648`, `20261015162631`, `20261015163930` preservadas, NÃO REAPLICAR.

## Candidato local e seu limite
Arquivo: `scripts/rbac-audit/proposed-cockpit-esteira-read-tenant-fence.sql`.
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
`python3 scripts/tests/cockpit-esteira-fence-local.py`: **14/14 asserts PASS**, PostgreSQL isolado, executa corpos candidatos h7n/RPC extraídos do arquivo. Auth/RBAC/readiness/entitlement/carteira **simulados**, schema reduzido; NÃO prova JWT hospedado, RLS real, ACL completa/preflight nem duas sessões.
Cobertura: Admin AR só próprio; FSF não vê AR; inativo/no-iat simulado; sem tenant; consultor sem carteira/carteira alheia; Onfarm não ampliado; produção própria+clamp200/offset0; busca literal de injeção; RPC nega Financeiro/Consultor/Onfarm, feature ausente e UID ausente. Não cria dados externos nem depende de credenciais.
Teste persistente Vitest: `src/test/cockpit-laboratorio/tenantFencePostgres.test.ts`; regressões existentes de auditoria/refinamentos executadas junto. Nenhum snapshot/cópia de texto usado como prova de autorização.
**GO somente preparação local. NO-GO abertura da leitura/fabricação/publicação; Auth/RLS/browser/freshness/descendentes UNVERIFIED.**