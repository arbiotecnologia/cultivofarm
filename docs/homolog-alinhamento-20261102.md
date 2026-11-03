# Alinhamento EXCLUSIVO da homologação (vrlcdwmlytukrjezrrnf) — pacote pronto para revisão, NÃO aplicado

Estado: **preparado e testado só em PostgreSQL descartável**. Nenhuma conexão hospedada, nenhuma escrita, nenhuma
publicação. Produção (`swzpzcwiasxmjutrmvkm`) intacta. Depois do catálogo aprovado/aplicado, o trabalho volta à produção.

## Entrada
- Comparativo READ ONLY homolog × produção: `docs/auditorias/evidencias/homolog-alinhamento-20261102/homolog-alinhamento-input-20261102.json`,
  SHA-256 `799da8a507f085fd947d5f8eca09f3df9462097cde3fb6b44289eab5c0f35761`.
- 459 assinaturas: 204 iguais, 63 divergentes, 192 ausentes. 59 tabelas/1339 colunas: 42 ausentes (3 tabelas inteiras:
  `catalog_tenant_visibility`, `produto_composicao_conjuntos`, `produto_composicao_declaracoes`), 3 nulabilidades.
- Temos o corpo de produção, com md5 conferido, de 434 das 459. As 25 sem corpo são exatamente os wrappers/cores globais
  de catálogo que o catálogo exclusivo fecha; na homologação já estão ausentes e **continuam ausentes** (fechados por ausência).

## Pacote `scripts/homolog-alignment-20261102/` (gerado por `build.py`; hashes em `SHA256SUMS.json`)
| Ordem | Arquivo | O que faz |
|---|---|---|
| 1 | `00-homolog-pre.sql.review` | READ ONLY. Impressão digital (empresas homolog presentes, nenhuma empresa de produção, trava `a00_homolog_validation_no_receivable` ligada, cron vazio, fiscal desligado); 459 assinaturas no estado exato; tipos de argumento; 42 colunas/3 tabelas ausentes; 3 nulabilidades; envase sem NULL; drift de constraint/índice; cabeçalho compatível das 63 divergentes. |
| 2 | `01-homolog-align.sql.review` | Uma transação: PRE embutido → tabelas/colunas/nulabilidade reais → 237 constraints + 151 FKs + 241 índices ausentes por nome → 230 corpos de produção (63 trocados, 167 criados, md5 conferido) → ACL nega-por-padrão → 232 policies/255 gatilhos/164 grants iguais à captura → POST → invariantes (empresas, auth.users, produtos, perfis, papéis inalterados). |
| 3 | `02-homolog-catalog-gate.sql.review` | READ ONLY. Só libera o catálogo após o 01; recusa se a manutenção 02 de produção tiver rodado aqui; pina os dois arquivos da variante limpa. |
| 4 | `scripts/tenant-exclusive-catalog-20261101/homolog-clean/00-…` e `01-…` | Variante de instalação limpa do catálogo. Gerada pelo mesmo `build.py` do catálogo; difere da de produção **só** por aceitar ausentes os 25 globais (se presentes, md5 obrigatório). Arquivos de produção 00/01/02 ficaram byte-idênticos. |
| — | `03-homolog-readiness-probe.sql.review` | READ ONLY. Contas, perfis, papéis, vínculo de parceiro do teste4 e catálogo por empresa, antes da etapa JWT. |
| — | `09-homolog-align-rollback-deny.sql.review` | Só restritivo: revoga EXECUTE das funções criadas. Esquema/dado não são revertidos (backup dispensado pelo proprietário); correções seguem por forward-fix com ledger. |

Regras de convergência (sem DROP genérico, sem reset de public/auth): policy com mesmo nome e predicado diferente é
substituída; policy **permissiva** fora da captura é removida; restritiva fora da captura e gatilhos fora da captura
(inclui a trava homolog) são mantidos. Tudo vai para `platform_private.homolog_alignment_ledger` com a definição antiga.

ACL de função: a ACL de produção não foi capturada. Funções criadas nascem fechadas; `authenticated` recebe EXECUTE só em
58 derivadas (RPCs usadas pelas telas, helpers citados em policies e o fecho de chamadas INVOKER). Nenhuma das 230 fica
executável por `anon`. A bateria JWT real mostrará se falta alguma; nesse caso, a correção é uma concessão pontual revisada.

## Catálogo na homologação
- Os 19 ids da cadeia de produção não existem aqui: a manutenção 02 **não** é aplicada; o PRE do catálogo confere contagem
  0 por id real (nenhum hash fingido). O algoritmo 02 foi reprovado em banco descartável com as fixtures pinadas: 81/0.
- Os 7 produtos homolog não têm pai de empresa (0 lotes/pedidos/OS/visitas). Pelo algoritmo canônico, saem do catálogo com
  snapshot integral no ledger; nenhum é reatribuído por nome nem por empresa padrão. Os dados de teste entram depois, por
  `tenant_product_save`, com o login real de cada empresa.

## Contas e empresas (etapa JWT — intervenção humana só quando o ambiente estiver pronto)
1. **AR Bio HOMOL** (`c809e74f…`, onboarding): o administrador `arbiotecnologia@gmail.com` conclui o próprio cadastro por
   `org_onboarding_save`/`org_onboarding_complete`. Sem isso, o servidor recusa a escrita do catálogo
   (`catalog_visibility_tenant_unavailable`), o que foi reproduzido no banco descartável.
2. **FSF HOMOL** (`dcf50a75…`, ativa): `rh@refilinformatica.com.br` JÁ existe no Auth da homologação (uid `86a2b787…`,
   email confirmado, perfil ativo sem empresa e sem papéis). Não há convite nem email. Ele vira administrador da FSF pelo
   roteiro revisável `identity-fixtures/10-homolog-identity-fixtures.sql.review` (estados exatos, gate canônico de
   usuários, ledger antes/depois, invariância de terceiros; 26/26 no PostgreSQL descartável). Nenhuma senha é definida.
3. **teste4@refilinformatica.com.br**: hoje está, por histórico, como administrador da FSF na homologação. O mesmo roteiro 10
   o converte em comprador B2B da AR Bio (parceiro_b2b + vínculo gestor à conta de parceiro FSF da AR Bio). Nunca é
   controle positivo da FSF. Se a conta de parceiro FSF não existir, o roteiro para e o admin AR Bio a cadastra antes.

## Aplicativo: via de teste restrita
`src/integrations/supabase/homologPreparation.ts` ganhou `HOMOLOG_REVIEWED_TEST_LANE`, **desligada**. Ligada pelo
proprietário após aplicar e conferir o pacote, ela abre só:
- leitura de 7 tabelas do catálogo;
- 10 RPCs: onboarding canônico e CRUD do catálogo por empresa.

Edge Functions, Storage, fiscal, cobrança, entrega, comunicação, cadastro de conta e demais escritas continuam bloqueados
mesmo com a via ligada. Testes: 90/90 (`src/test/config/homolog-preparation.test.ts`) + 1 (`homolog-sdk`).

## Bateria JWT real (não executada aqui)
`scripts/homolog-alignment-20261102/jwt/homolog_jwt_suite.py`: recusa qualquer URL que não seja a homologação. Senhas
digitadas pelo humano em variáveis de ambiente. Cenários:
- criação própria AR Bio/FSF;
- isolamento de leitura por RPC e por acesso direto;
- arquivamento cruzado negado;
- comprador sem escrita;
- INSERT direto negado;
- anon negado;
- logout e troca de sessão sem mistura.

## Evidência (PostgreSQL descartável) — `docs/auditorias/evidencias/homolog-alinhamento-20261102/`
- `run-20261102-PG/`: **50/50 PASS**.
  - PRE positivo e 15 negativos: produção presente, homolog ausente, trava desligada, fiscal, cron, drift igual/divergente,
    parcial, coluna/tabela já presentes, nulabilidade, ledger, tipo ausente, constraint drift, envase NULL.
  - Atomicidade com falha injetada.
  - Alinhamento + POST: 434 md5, 1339 colunas, 232 policies, 255 gatilhos, grants e anon fechados, empresas/auth intactos.
  - Reexecução abortada e rollback restritivo.
  - Gate e variante limpa: o PRE de produção recusa (25 ausentes), a variante aprova e migra, e os 7 produtos saem com
    snapshot.
  - Controles com autenticação sintética: onboarding bloqueia, admin AR Bio/FSF criam com dono do servidor, comprador
    negado, FSF não vê AR Bio, INSERT direto negado, trava preservada.
- `run-20261102-chain-purge/`: manutenção 02 em banco descartável, 81/0.
- Limites declarados:
  - A linha de base homolog foi **simulada** a partir do comparativo. Os corpos homolog das 63 divergentes não foram
    capturados; só aqui o md5 delas é substituído.
  - A trava homolog é sintética.
  - Entitlements e autenticação são sintéticos.
  - Nada disso é prova JWT/RLS hospedada.

## Dependências que só a homologação real confirma
- Objetos fora das 59 tabelas e das 459 assinaturas (por exemplo, relações extras e tabelas de recibos de entrega) não
  estão no comparativo. Se faltarem, o PRE/POST do catálogo ou a bateria JWT param e listam o que falta.
- O tipo `platform_private.tenant_smtp_dispatch_jobs` precisa existir; o PRE confere.
- Planos e assinaturas da AR Bio/FSF homolog precisam habilitar o catálogo. O probe 03 mostra o estado; a correção é pelo
  fluxo de assinatura da plataforma, nunca por SQL.

## Correção pós pré-voo real (02/11, 8e47f8b)
- Pré-voo real READ ONLY abortou só por `cron_jobs_present:7` e `dep_type_missing:platform_private.tenant_smtp_dispatch_jobs`.
- Cron: PRE/POST agora exigem exatamente 7 jobs, todos `active=false`; aborta se algum ativo, job extra ou excluído; POST compara hash dos 7 com o fixado no início da mesma transação. Nada reativa/exclui jobs. Conteúdo dos jobs não foi capturado: só contagem/estado são pinados.
- SMTP: as 5 funções `platform_private.tenant_smtp_lane_*` e o gatilho `tenant_smtp_lane_solicitacao_atribuida` ficam fechados por ausência (não necessários a catálogo/onboarding/identidades; comunicação OFF). Instalação 230→225 corpos, gatilhos 255→254; POST exige ausência. Nenhuma tabela SMTP é criada.
- Harness PG descartável: 54/54 (inclui reativação, extra, exclusão e SMTP presente como negativos).
- Identity fixtures: gate de statement real só em `partner_users`; PRE exige esse gate via `acquire_gate` e trava gate → partner_users/profiles/user_clientes/user_roles (SHARE ROW EXCLUSIVE, ordem fixa). Os 3 REDs independentes viraram negativos explícitos. Teste local 30/0, incluindo writers concorrentes com e sem gate bloqueados. A exigência de `z99_cf_require_admin` foi retirada (não confirmada na captura homolog); `guard_profile_sensitive_fields` e `h15_profile_organization_guard` continuam exigidos — se ausentes na homolog, o roteiro aborta.

## Corpos reais homolog e conta FSF (02/11, 20:37)
- Anexo `homolog-corpos-divergentes-20261102.json` (sha256 `20ac2733…56de10`) guardado nas evidências: 63/63 corpos com MD5 recalculado = MD5 homolog do comparativo, casados por MD5 e nome. O harness instala esses corpos reais (sem simulação nem hash artificial); PRE gerado é idêntico ao pinado. 54/54.
- Auditoria dos diffs (homolog → produção): comunicação `_comunicacao_publish_system_event` passa a retornar suprimido (sem gravar eventos), `_notify_role`/`fn_notify_lab_on_programacao` passam a filtrar destinatário por empresa — o alinhamento estreita, não abre envio. Financeiro/fiscal (`fn_generate_receivable_installments`, `generate_b2b_receivable_secure_impl`, `fn_b2b_credit_exposure`, `fn_fin_dashboard_kpis`, `rpc_fiscal_draft_save`, `rpc_fiscal_nfe_readiness_v1`, etc.) mudam escopo/vínculo; a trava `a00_homolog_validation_no_receivable` continua exigida no PRE/POST e fiscal OFF. Nenhum corpo homolog/produção chama HTTP externo nem cron.
- SMTP: a relação `platform_private.tenant_smtp_dispatch_jobs` está em `schema-helpers-extras-20261102.json` (18 colunas, 9 constraints, RLS ligada, 0 policies). Mesmo assim a faixa SMTP continua fechada por ausência: sem tabela, worker ou grant de dispatch.
- Identidades: conta FSF Agro (HOMOL) `e770d10e-…` exigida após resolução por vínculo/CNPJ (nome nunca usado). Teste 32/0.


## Rodada 02/11 (noite) — pré-voo real aprovado e testes refeitos
- Pré-voo real `00-homolog-pre` (commit ddb443f5) passou READ ONLY na homologação; nada aplicado. O `build.py` regenera
  o `00` byte-idêntico (SHA-256 começa por `8ba28009`).
- Corrigido o `01`: a verificação final de permissões comparava texto como booleano (falha de sintaxe no POST).
- Faixa SMTP por empresa volta a ficar fechada **por ausência**: os 5 corpos capturados não são instalados (225 corpos:
  63 trocados, 162 criados); a tabela `tenant_smtp_dispatch_jobs` entra fechada, sem policy, sem worker e sem gatilho.
- Banco descartável: alinhamento **54/54**, identidades **32/0**. Login/JWT real continua não executado.
- Backup não é mais condição (decisão do proprietário).

## Rodada ACL destrutiva de cliente (02/11, 21:48 UTC)
- Achado: o alinhamento copiava TRUNCATE/TRIGGER/REFERENCES para anon/authenticated (54/60/60 itens). Produção confirmou TRUNCATE aberto em partner_orders, partner_order_items, microorganism_fiscal_profiles, product_fiscal_profiles, produto_conformidade_perfis. RLS não protege TRUNCATE.
- Correção: o alinhamento retira esses privilégios dos perfis de cliente nas 59 tabelas, preserva CRUD capturado (511 permissões) e service_role, registra no ledger e o POST aborta se algo restar.
- `04-client-destructive-acl-hardening.sql.review`: só REVOKE, idempotente, homolog ou produção, fecha o intervalo antes do alinhamento/migração; aborta se o privilégio vier herdado. `05-client-destructive-acl-probe.sql.review`: sonda READ ONLY (sem TRUNCATE real).
- Migração do catálogo também fecha as 5 tabelas e todas as tabelas tocadas, com prova no POST.
- Provas locais descartáveis: alinhamento 62/62 (RED/GREEN, idempotência, herança abortada, sonda); catálogo 338/1 (falha conhecida: `fiscal_certificates` não capturada). Nenhuma execução hosted. NO_GO até revisão e prova JWT real.

## Delta de linha de base ACL — 04 aplicado pelo auditor (02/11, 23:59 UTC) — registrar ANTES do pré-voo hospedado

- Fato informado pelo auditor: `04-client-destructive-acl-hardening.sql.review` (SHA-256 `eb200070…d461da6`, inalterado) foi
  revisado/testado de forma independente (PGlite: 59 tabelas, 354 negativas, 177 service_role e 708 CRUD preservados,
  idempotência e rollback em privilégio herdado PASS) e aplicado como `restrict_catalog_client_destructive_privileges`
  na homolog `vrlcdwmlytukrjezrrnf` e depois na produção `swzpzcwiasxmjutrmvkm`. POST real: homolog 0 destrutivas;
  produção 1652 checks, 174 permissões removidas, 0 destrutivas restantes, 0 mudanças CRUD/service_role.
- Consequência: a ACL capturada antes (com TRUNCATE/TRIGGER/REFERENCES de cliente) deixou de ser a linha de base. Os PREs
  `00-homolog-pre`, `00-pre-global` (produção) e `00-pre-global.homolog-clean` agora EXIGEM o estado endurecido exato
  nas 59 tabelas do 04: qualquer TRUNCATE/TRIGGER/REFERENCES de PUBLIC/anon/authenticated aborta com
  `client_destructive_acl_not_hardened:<tabela>:<role>:<privilégio>`. Nada foi relaxado e nenhum pacote reconcede.
- O 04 NÃO deve ser reaplicado. Alinhamento e migração mantêm seus REVOKE idempotentes (sem efeito no estado endurecido;
  ledger do alinhamento passa a registrar 0 itens retirados).
- Catálogo/ownership e a manutenção 02 (purge) continuam NÃO aplicados.
- Testes: harnesses aplicam o 04 pinado na linha de base local (espelho do estado hospedado) e provam RED (ACL pré-04 →
  PRE aborta) e GREEN (pós-04 → PRE aprova).

## Avanço hospedado homolog (03/11, 00:11 UTC) — estado ATUAL incorporado

- Informado pelo auditor: `00` PRE PASS real; `01` aplicado (`align_reviewed_catalog_validation_schema`), ledger `done`,
  cron ativos 0, fiscal 0, trava `a00_homolog_validation_no_receivable` = 1, faixa SMTP ausente.
- Dependência real descoberta: o 1º `10` abortou atomicamente porque `platform_actor_access_ready` lê
  `platform_org_admin_invites.access_operation_status`, ausente na homolog. Captura real prod/homolog: 6 colunas nullable sem
  default (`access_operation_id uuid`, `access_operation_kind text`, `access_operation_status text`, `access_requested_at`,
  `access_expires_at`, `access_valid_after timestamptz`), constraints iguais. O auditor aplicou as 6 exatas
  (`align_homolog_invite_access_columns`) e reaplicou o `10` com sucesso (rh admin FSF; teste4 parceiro_b2b AR Bio com 1
  vínculo de parceiro; admin AR Bio intacto). Nada em Auth/senha/email.
- Pacote: `06-homolog-invite-access-columns.sql.review` registra esse delta (idempotente, fingerprint homolog, POST de tipo/
  nulabilidade/default; NÃO reaplicar onde já existe). `00`, `01`, `04` e `10` não mudaram e não devem ser reaplicados.
- `02-homolog-catalog-gate` agora exige o estado ATUAL: fingerprint (cron 7 inativos, fiscal 0, trava), ledger `done`,
  as 6 colunas exatas, estado final exato do `10` (ledger + rh/teste4/admin AR Bio), faixa SMTP ausente e catálogo não aplicado.
- Testes locais: alinhamento 67/67 (RED sem colunas, 06 idempotente, RED sem identidades, GREEN estado atual);
  identidades 34/0 (fragmento do gate recusa estado inicial e aprova o final). Catálogo inalterado (343/0 anterior).
- Pendências: instalação do catálogo (homolog-clean) após revisão; bateria JWT exige sessão real. A via de teste do app
  homolog não muda até o catálogo estar instalado.

## Delta 03/11 — produto_anexos (só homolog) e contexto interno

- Pré-voo real `00-pre-global.homolog-clean` abortou só `fk_unmapped:produto_anexos.produto_id->produtos`. A tabela existe apenas na homologação (produção: `to_regclass` NULL).
- Gerador da variante homolog-clean passa a tratá-la como descendente de produto: estrutura exata capturada pinada no PRE (5 colunas, PK+FK, zero policies/triggers; drift aborta), snapshot integral no ledger (`homolog_only_snapshot`), cópia para o produto do tenant, RLS + policies por tenant, ACL destrutiva fechada. Anexo sem produto preservado intacto.
- Variante de produção inalterada byte a byte e continua abortando `fk_unmapped` se a tabela aparecer.
- `02-homolog-catalog-gate` regerado apenas para repinar os novos hashes da variante; 00/01/04/06/10 idênticos e não devem ser reaplicados.
- Testes locais: catálogo homolog-clean 357/0 (14 novos HAX), produção 343/0, alinhamento 68/68.
- `internal_actor_context_v1` instalado pelo auditor na homolog (md5 de produção 67634de6…). Frontend desta cópia o libera só para leitura (com `h15_actor_organization`, `get_cliente_ids_for_user`, GET `clientes`); escrita, fiscal, envio e Storage continuam bloqueados; `HOMOLOG_REVIEWED_TEST_LANE=false`. Não exportado ao original.
