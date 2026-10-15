# OS — aprovação separada, candidato fechado (19:04 UTC)

## Decisão, baseline e evidência
Somente **Administrador/Gestor** aprova. Produção somente programa OS previamente aprovada, nunca aprova automaticamente. Administrativo/consultor/financeiro não recebem aprovação. HEAD inicial real **557ee0e1** conferido antes de escrever. Supabase canônico `swzpzcwiasxmjutrmvkm` confirmado no config único antes de consultas **somente SELECT de metadados**. Nenhum dado real, DDL/grant remoto, UI, publicação ou fabricação nesta fase. Candidato programar anterior não aplicado e byte-preservado.

Leitura própria confirmou programar `a42d6b07f51e6dacf41096f6cefb8163`, ACL postgres/service-only e RLS tenant RESTRICTIVE nas três tabelas. Lote `d37a0e478e01277ba61f70397b1d44f9` é **evidência externa Renato**, não hash novamente aferido nesta rodada; lote fora de escopo. FSF/Fagner 0 OS/busca AR/limpar/URL direta permanece PASS restrito **externo pós-login**, não gravação da troca.

## Aprovação existente e menor extensão
Busca no HEAD e inventário de funções aprovação/`SET status...aprovada` não localizaram aprovação separada de OS. `OrdensServico.tsx` registra aberta e direciona ao Cockpit, sem ação aprovação. CQ/ficha/visita são outros contratos. Programar antigo aprova automaticamente; `_avancar_os_status` percorre etapas mas está fechado, não constitui aprovação humana separada.

Preparada menor extensão no fluxo OS existente: `public.rpc_aprovar_os_v1(uuid,text)` somente aberta→aprovada, sem nova rota/tabela/página ou volume/data/produção. RPC e dois helpers novos ficam sem EXECUTE PUBLIC/anon/authenticated/service_role; nenhum grant novo. Cockpit continua consulta somente.

## Enforcement direto e transições preservadas
`scripts/rbac-audit/proposed-cockpit-os-approval-closed.sql` adiciona guard BEFORE `aa_` nas duas tabelas OS, antes da validação existente, e AFTER `zz_` para revalidar/auditar após downstream de linha. RPC e UPDATE direto compartilham o helper. INSERT aprovado negado para não embutir aprovação na criação. UPDATE não pode alterar outras referências simultaneamente com aprovação. Autoria/tenant vêm do servidor; nenhum bypass por payload/GUC/service.

`check_os_status_transition()` **byte-preservado**, hash `496a214d87fc831a53b2f16d3524ddea`: ordem das etapas, CQ/envase, cancelamento e salto aguardando_reserva não reescritos. Guard retorna sem intervenção quando NEW.status não é aprovada. Replay RPC não escreve; UPDATE aprovada→aprovada revalida alçada, sem novo evento, mas statement refresh pode ocorrer — não alegar zero efeitos statement.

## Escopo e cadeia atual
Exige h15/readiness/feature `ordens_producao` + Admin/Gestor antes de lookup/status/replay. Usa helper fonte atual183119 `bad38b5200629cc887767e62b7a46e40` para cliente/fazenda/talhão/tenant/OS/XOR/IDs ambíguos/descendentes atuais. Locks OS antes de referências/programações, revalidação posterior; NULL/órfão nunca global.

Exatamente uma programação preexistente aguardando, same-tenant/item/XOR, responsável válido e sem lote. Divergência responsável `profiles.id`×`user_id` continua fail-closed, sem reinterpretar IDs. Biológico/micro via helper vigente; químico/adubo/família NULL/dual-ref negados. Aliases existentes normalizados; B2B armazenado/vínculos/production_order_link negados devido a efeitos não homologados, sem corrigir comercial.

Triggers INSERT já criam programação. Downstream UPDATE pode inserir programação/data CURRENT_DATE quando falta; candidato exige existente para **não executar esse ramo**. Ausência exige revisão do fluxo, sem duplicação/data inventada. Aprovação conserva volume/data NULL e programação aguardando; não autoriza fabricação. Programar candidato exige aprovada/programada, mas lacunas permanecem bloqueadoras.

## Dependências e lacunas reais
Inventário atual completo de triggers diretos nas três tabelas conferido por `pg_trigger`, cadeia hash **7f00df0799ad242031f0279373091034**. Corpos preservados:
- Clássica: tenant guard/item ref/status/biológico/estrutural/feature/updated_at; numeração e criação programação INSERT; downstream UPDATE; comunicação pronto-retirada; sync partner; recalc planning; sync planning e refresh statement.
- Onfarm: status/biológico/feature e demais guards; programação INSERT; downstream status/histórico/solicitação vinculados; comunicação/refresh existentes.
- Programação: tenant/biológico/integridade/sync/avisos INSERT/refresh existentes. Novo RPC não escreve programação diretamente; downstream mantém aguardando.
- `fn_sync_os_classica_downstream` **06e64b76968f91e19f03b24363ac610a** e `sync_os_onfarm_downstream` **f5ba706828f4c157a55a8d594b5c1848**: aprovação só aguardando, lote apenas em_producao (não chamado).
- `trg_os_sync_partner_order_fn` **d219a4922c0c6d2a464175dc61bdf5a3**, `_sync_planning_from_os` **0e79d2c5c352a41f147a62bb1ae5afe4**, `tg_recalc_planning_from_os` **ac8746e2c142d33bfb9e4f3c6d5daf6d** → recalc parceiro/timeline/notificações: links negados, corpos preservados; workers transitivos **não certificados**.
- Refresh global interno continua dependência de locks/performance; nenhum refresh novo nem chamada pelo cliente.

Inventário não equivale a full-schema/full-dependências testados. Concorrência revogação papel/assinatura, inserts externos de filhos/links, ABBA e cascatas **UNVERIFIED**. Locks nas referências não serializam automaticamente user_roles/assinaturas. B2B, responsável, refresh e contrato programar3args sem CAS/key (retry antigo pode reverter data recente) impedem liberação. Não modificar lote ou demais operações para esconder essas lacunas.

## Preflight e rollback revisáveis
Captura corpos/owner/ACL existentes; exige ref marcador, hashes fonte/atores/biológico/status/programar/downstreams, schema **65c9714925862453043e64da5bf2cbdb**, triggers e RLS **7d292abeaf7cd90cb82e70b596de0acf**, ausência dos novos objetos e programação fechada. Pós-condições conservam contratos existentes e aprovação nova fechada. **Fullpreflight hospedado não executado**.

Rollback pré-COMMIT: **ROLLBACK integral**. Após eventual aplicação revisada, manter guards/RPC fechada até correção substitutiva; remover proteção isoladamente reexpõe UPDATE e não é rollback seguro. Não restaurar grants nem excluir dados/histórico.

## Arquivos e testes próprios
- `scripts/rbac-audit/proposed-cockpit-os-approval-closed.sql` — SHA256 `c174da6d95d6d8b4f5ff25d7989870a06b897d094ae876db186da5ef90a5c787`.
- `scripts/rbac-audit/cockpit-approval-baseline-20261015.json` — três corpos reconstruídos do texto versionado com MD5 **exatamente coincidente** com pg_get_functiondef canônico.
- `scripts/tests/cockpit-approval-local.py`, este relatório, roadmap e regra estrutural AGENTS.

**46 checks PASS** PostgreSQL descartável: candidato efetivo/helper183119 e três triggers exatos; Admin/Gestor/RPC/UPDATE, cinco papéis negados, readiness/feature false/NULL inclusive UPDATE, foreign/missing/logout/filho cruzado, referência alterada, família química/adubo/NULL, UUID ambíguo, programação ausente, B2B, aberta não programável, repetição sem evento duplicado, auditoria antes/depois/ator/data, micro-onfarm, NULL conservados e Produção programa aprovada somente no candidato fechado. ROLE authenticated/RLS local com policies **reduzidas**: foreign/missing0 e admin replay. Auth/readiness/feature/schema/fonte simulados; não JWT/RLS/browser/fullschema hospedados. Falha inicial local de inlining `cannot cope with variable-free clause` foi corrigida somente nos helpers simulados por search_path fixo; não alterou candidato nem helpers remotos.

Regressão programar **43 PASS** (duas conexões locais 1write/1replay); Vitest consultaOnly/liveSource **19/19 PASS**. Python compila, diff-check PASS. ESLint não configura Python: arquivo ignorado com aviso, **não lint PASS**. Nenhum TypeScript alterado; typecheck/build manuais não executados (harness automático), build OK observado19:13:59. Scanner focal textual sem credenciais literais; não scanner global/lint legado PASS.

**Gate:** candidato local revisável; aprovação/programação/fabricação **NO-GO**, revisão independente e lacunas acima bloqueiam liberação. Nenhuma prova hospedada inventada; consulta restrita AR/FSF externa preservada. Commit automático será informado sem operação git commit manual.