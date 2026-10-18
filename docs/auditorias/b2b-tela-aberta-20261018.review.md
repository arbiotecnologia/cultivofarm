# Revogação B2B com tela aberta — liberada somente na prévia

## Resultado e escopo

O monitor EXISTENTE no AuthProvider agora admite rollout **somente B2B exclusivo**
(`parceiro_b2b` ou `parceiro_b2b_tecnico`). Usa a RPC EXISTENTE
`get_my_commercial_partner_context` pelo cliente canônico. Não instala fingerprint,
resolver, tabela, revision ledger, grants, RLS ou Edge. Nenhuma operação hosted ou
publicação pelo agente. `AUTHZ_CACHE_FOUNDATION_ENABLED=true` somente na prévia por liberação expressa 22:55;
Blob/principal/troca de vínculos não foram ativados.

### Liberação limitada 22:55 UTC — estado atual

- Auditor autorizou exclusivamente habilitar a prévia, após revisão `ffd299e9`:
  17/17 hashes, monitor 9/9 + 4/4 padrão + 4/4 refreshOnConfirmationtrue PASS
  informados externamente. Preflight integral READ ONLY executado pelo auditor
  no projeto canônico; assinatura de inventário corrigida para `get_user_partner_id()`.
- Confirmados externamente: helper `b334c3a454ebc4233d3b9e0d0a700d78`, contexto
  `a31d198c9a9fc9a5e7c397ab36fe0fa4`, wrapper INVOKER
  `a40e2efac2d503a1840896ac8b458ce9`, policies checksum
  `cc8cc0e7107010774a86906273d3fd09`, ACL/owner/config/helpers preservados.
  Login revogado negou após reload/restaurado; admin B negado portal. Não é
  conclusão do teste de revogação sem reload, que será feito pelo auditor.
- Receipt: `scripts/authz-cache/b2b-open-session/receipt-preview-20261018-2255.json`.
  Registra autorização no chat e aceita 10s poll/15s lease em navegador ativo,
  signedURLs já divulgadas excluídas, rollback com drenagem; não inventa execução
  live pelo agente ou homologação. Publicação e v6 amplo NÃO liberados.
- Manifest permanece baseline de staging **false**, com somente hash estático do
  preflight corrigido; receipt assina seu SHA256 canônico. Não atualizar baseline
  para true: preserva reprodução do staging com baseline original e rejeita
  reaplicação automática no runtime já habilitado (`source_drift`).
- Staging gerado fora do runtime em `/tmp/b2b-preview-release-20261018-2255`,
  cópias de revisão persistidas em
  `scripts/authz-cache/b2b-open-session/staged-preview-20261018-2255/`:
  `gate-candidate.ts.review`, `gate-rollback.ts.review`, `gate-guards.json`.
  Guard `applied:false` descreve a geração (script não aplica); runtime promovido
  separadamente por delta único false→true, sem alteração de comentários/corpos.
  PRE SHA256 `38d2bdf7b1302ed5dbac3f6cd86105991ac9813996183d27a81c5d3d7e159d5d`;
  POST SHA256 `8405d4354dfe2504b088a75fd048d1162f567b95365a6d6c1d9cf1ab9bd75e1b`.
- Demais seções de preparação abaixo são histórico anterior à liberação; as
  pendências de revisão live ali listadas foram satisfeitas para ESTE recorte
  conforme receipt, não para v6/global. Prova JWT sem reload aguarda auditor.

Backend dos três helpers: aplicado pelo auditor, migration `20261018222908`,
commit `80e8347`, hashes/ACL/RLS e SQL independentes aprovados externamente;
login revogado negou **após reload**, restaurado ativo versão 6. Não reexecutado
pelo agente nem confundido com prova de sessão aberta.

### Complemento independente 22:51 UTC

- Achado no HEAD `80e8347`: boundary após own.ready/hasPartnerContext provocava
  redirect prematuro, pois useMyPartner depende authzReady. A candidata anterior
  já antecipava pause antes da negação; este complemento prioriza pause também
  antes da espera dos readers, preservando a barreira inicial de Auth loading.
- Teste gestor/técnico agora mantém RPC inicial pendente e prova boundary visível,
  ausência de dados/queries de catálogo e MESMA URL; resolve→valid, poll→revogado,
  retry pendente novamente na mesma URL e restore→dados novos, sem reload.
  AuthProvider, useMyPartner, useAvailableContexts, QueryClient e Router reais;
  apenas transporte RPC/download fake. Não é prova JWT hosted.
- Auditor confirmou live `profiles.z99_cf_profile_stamp` enabled O, hash
  `ce295ff5799d306ad81578047cd9bff5`; `partner_users`/`user_roles.z90_cf_touch_profile`
  enabled O, hash `e5911c3801be399f9de57e038b390e79`; convite stamp enabled O,
  hash `ff13703e8174fa2fa3cd641ff5b36258` (nome não fornecido, não inventado).
  Preflight candidato adiciona guarda SELECT-only dos três pares conhecidos e
  inventário por hash do convite. Não executado pelo agente.
- Prova externa SQL BEGIN/ROLLBACK: revoke e restore avançaram profiles.updated_at
  nas DUAS operações; vínculo permanece versão 6. Isso confirma stamp local do
  perfil, NÃO closure monotônica de todas dependências/concorrência v6 ou JWT.
- RPC get_my_authz_fingerprint e schemas v6 continuam ausentes segundo auditor;
  população informada: 1 gestor B2B ativo e 2 produtores ativos. Rollout continua
  restrito B2B, produtores sem monitor; não criar fixtures/roles nem ativar v6.
- Validação deste complemento: **58/58 testes em 2 arquivos PASS** (29 integração
  e 29 monitor), **6/6 staging guards Python PASS**; verificação automática
  build/typecheck `build OK` em `2026-10-18T22:52:35Z`. Sem suíte ampla nova,
  sem browser autenticado/JWT, sem execução SQL local/hosted ou publicação.

## Alterações concretas

- `src/hooks/useAuth.tsx`: mesmo monitor, scope de UID/org/readiness/roles;
  valida resposta desconhecida, falha fechado em null/erro/malformed. Não reduz
  cardinalidade nem duplica elegibilidade: resolver canônico mantém contagem de
  TODAS roles, TODOS links não revogados antes de elegibilidade, tenant=owner,
  papel, partner ativo/não deletado, readiness, entitlement e legacy.
- `src/lib/authz/b2bContextProbe.ts`: parser de resposta, NÃO autorizador; tuple
  de contexto não é revisão monotônica e não inventa `server_remaining_ms`.
- `src/lib/authz/authzEpochMonitor.ts`: opção de retirar visão/cache em toda
  confirmação B2B, mesmo tuple igual; guarda também após callback de época.
  Sem mudar o comportamento default da integração fingerprint existente.
- `B2BRouteGuard`: pause/retry na MESMA URL antes de interpretar readers disabled
  como negação; nenhum bypass da validação subsequente de vínculo/contexto.
- `useAvailableContexts`: inclui readiness/época e descarta resultado obsoleto.
- `usePartnerCatalog`, `usePartnerPrices`, `usePartnerSimulations` e items:
  reutilizam wrapper de fencing existente. Sem alteração de preço/queries/mutações.
- Pending/expired cancela e limpa todo QueryClient; confirmações retiram cache,
  seleção/rascunhos, remontam conteúdo e atualizam profile/roles existentes.
  Readers comuns ainda existentes sob o boundary também são desmontados e
  cancelados; não alegar migração de todos os hooks para o wrapper.
- Anexos: ownership hook real revoga objectURL/aborta transporte no unmount.
  Teste usa download simulado; gate Blob continua false e signed URLs/bytes já
  divulgados NÃO são revogados por esconder a tela.

## Matriz de liberação verificável pelo auditor

| Requisito | Prova/guard | Estado |
|---|---|---|
| Ref `swzpzcwiasxmjutrmvkm` | binding cliente + receipt obrigatório do staging; operador valida ref antes de SQL | local comprovado; conexão live não usada |
| Três helpers instalados | preflight SELECT-only rejeita hash/owner/ACL/config divergentes | externo informado; nova consulta aguarda auditor |
| get_user_partner_id/context E2 atuais | hashes b334c3a4…/a31d198c… listados no preflight; comparar antes da liberação | externo informado, sem sobrescrever |
| Wrapper público existente | captura corpo/hash/ACL/config/volatilidade e executa via JWT B2B real | aguardando revisão live, sem golden inventado |
| Readiness/entitlements/visibility | corpos existentes capturados pelo preflight, nenhum stub ou alteração | revisão live pendente |
| RLS/RPC nos dados do portal | inventário policies + negativos reais revogado/tenant errado/2 roles/2 links e positivos gestor/técnico/legacy | aprovação do auditor obrigatória |
| UI/cache sessão aberta | React real provider→guard→RPC fake→hooks reais→QueryClient; tests abaixo | local PASS, não JWT |
| Semântica temporal reduzida | poll 10s, lease ≤15s desde requestStart, deadline antigo não renova por poll em voo | bounded observation; aceitação explícita |
| Anexos legados | emissão/TTL/HTTP/URLs externas fora do recorte, Blob gate false | não certificado; aceitar exclusão ou manter NO-GO |
| Rollback | exige hash POST exato do gate e drenagem de clientes que servem bundle monitorado | staging guardado; operação somente auditor |

### Fluxo mínimo para liberação

1. Auditor confirma ambiente canônico e executa arquivo SELECT-only INTEGRAL
   `scripts/authz-cache/b2b-open-session/preflight-readonly.sql.review` com
   `ON_ERROR_STOP=1`; nenhum DDL/DML necessário para este recorte. Rever todos os
   resultados, inclusive wrapper cuja assinatura não garante seu corpo/ACL.
2. Rever negativos/positivos reais dos resolvers/RLS; assinar receipt com campos
   obrigatórios do `stage-review.py`, scope b2b-context e hash do manifest.
   Captura/snapshot não equivale a aprovação. Receipt limitado 22:55 registrado acima.
3. `stage-review.py --receipt <arquivo-revisado> --output /tmp/<staging>` apenas
   gera candidato e rollback de gate **fora do runtime** + hashes PRE/POST.
   Não pode escrever no projeto, publicar ou executar banco.
4. Auditor revisa delta exclusivamente false→true sob scope fixo e autoriza
   implantação separadamente. Testar login B2B real com sessão aberta, leitura
   efetiva e revogação persistente: tela some sem reload, cache vazio, retry/foco
   após restauração refaz dados atuais; testar tenant cruzado e rede/aba oculta.
5. Rollback não é simples desligamento silencioso: closing gate faz o legado
   deixar de observar. Exigir baseline POST exato, parar/drenar clientes
   monitorados, comprovar negações server-side e revisão operacional explícita.
   Nenhum código backend E1/E2/helpers é revertido.

## Por que v6 amplo não é dependência deste recorte

Este rollout **não promete revisão monotônica**, observação de A→B→A transitório
entre polls, revogação instantânea ou orçamento temporal server-side. Retira
dados/cache em toda confirmação e conserva limite local; RLS/RPC continuam
obrigatórias em cada leitura/escrita. Uma mudança e restauração entre polls pode
não ser observada; transações STABLE longas, suspensão do browser e links
assinados divulgados permanecem riscos. No navegador suspenso, 15s NÃO é SLA de
retirada visual em wall clock; foco verifica antes de restaurar.

v6 **continua NO-GO**: closure/revisões dos writers, ordem transacional/tickets,
compatibilidade audit/trigger/cascades, fronteiras temporais e provas reais
concorrência/ABA/old-snapshot não fechadas. A captura externa de 52 writers
`auditoria-20261018/writers-live-20261018.json` não é aprovação de concorrência.
Não listar novamente os 13 corpos/55 triggers/287 colunas/144 constraints/33
índices já fornecidos como ausentes. Bucket/Storage operation ACL/HTTP e emissores
service-role continuam pendentes; não instalar os candidatos v6 existentes.
SQL integral concorrente v6 **não usado nem aprovado** nesta etapa. Preflight
novo é SELECT-only/inventário+guard, não um harness de concorrência sintético.

## Evidência e limites

- Testes novos: 29 casos React/parser (RPC fake, Blob transporte fake). Cobrem
  gestor/técnico, revoke→restore sem reload, timeout/offline/erro/aba oculta/foco,
  cache/DOM, consultas antigas, objectURL real, tuple igual, ABA OBSERVADO e
  perfis excluídos/gate false. Não JWT/RLS/Storage HTTP real.
- Regressões direcionadas: **175/175 testes, 11 arquivos PASS**; **6/6 guardas
  Python PASS**; build/typecheck automáticos mais recentes `build OK`
  (`2026-10-18T22:50:45Z`), sem execução manual. Sem
  novo ciclo de milhares de testes. Correção complementar de resolução TS do
  import do guard real em d51-5: caminho relativo de TESTE, Edge intacta.
- d51-4 continua `Configuracoes.tsx`→`usuariosListQuery.ts`, não `useAuth`.
  Prova parent ampla anterior é histórica; nesta rodada não reexecutada.
  Cinco falhas antigas fora deste recorte não resolvidas; não declarar auditoria global.
- Browser autenticado: integração Supabase externa não gerenciada, sem sessão
  restaurável pelo agente; prévia agora habilitada para teste JWT em tela aberta
  pelo auditor. Nenhum login/revogação hosted pelo agente; publicação não autorizada.
- Commit é gerenciado automaticamente pelo ambiente; não criar commit por Git
  nem inventar hash antes de disponível.

### Artefatos exatos

- `scripts/authz-cache/b2b-open-session/preflight-readonly.sql.review`
- `scripts/authz-cache/b2b-open-session/stage-review.py`
- `scripts/authz-cache/b2b-open-session/manifest.json` (hashes fixos de fontes;
  testes nunca regeneram goldens)
- `scripts/tests/b2b-open-session-stage.test.py`
- `src/test/config/b2bOpenSession.integration.test.tsx`
- `docs/auditorias/b2b-tela-aberta-20261018.review.md`

Rollback de gate apenas **staged**, não aplicado; preflight SQL não executado
em PostgreSQL local/hosted nesta etapa. O staging tem testes sintéticos de receipt
e nunca fabrica aprovação do auditor. `git log` observado durante a rodada não
é prova de commit final desta entrega.