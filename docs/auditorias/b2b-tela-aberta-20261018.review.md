# Revogação B2B com tela aberta — candidata mínima, gate false

## Resultado e escopo

O monitor EXISTENTE no AuthProvider agora admite rollout **somente B2B exclusivo**
(`parceiro_b2b` ou `parceiro_b2b_tecnico`). Usa a RPC EXISTENTE
`get_my_commercial_partner_context` pelo cliente canônico. Não instala fingerprint,
resolver, tabela, revision ledger, grants, RLS ou Edge. Nenhuma operação hosted ou
publicação pelo agente. `AUTHZ_CACHE_FOUNDATION_ENABLED=false` permanece no runtime;
Blob/principal/troca de vínculos não foram ativados.

Backend dos três helpers: aplicado pelo auditor, migration `20261018222908`,
commit `80e8347`, hashes/ACL/RLS e SQL independentes aprovados externamente;
login revogado negou **após reload**, restaurado ativo versão 6. Não reexecutado
pelo agente nem confundido com prova de sessão aberta.

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
   Captura/snapshot não equivale a aprovação. Não há receipt aprovado no repo.
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
- Regressões direcionadas: resultados finais registrados após execução; sem
  novo ciclo de milhares de testes. Correção complementar de resolução TS do
  import do guard real em d51-5: caminho relativo de TESTE, Edge intacta.
- d51-4 continua `Configuracoes.tsx`→`usuariosListQuery.ts`, não `useAuth`.
  Prova parent ampla anterior é histórica; nesta rodada não reexecutada.
  Cinco falhas antigas fora deste recorte não resolvidas; não declarar auditoria global.
- Browser autenticado: integração Supabase externa não gerenciada, sem sessão
  restaurável; gate false impede exercitar o rollout real. Prova JWT tela
  aberta/implantação dependem do auditor. Nenhum login/revogação hosted pelo agente.
- Commit é gerenciado automaticamente pelo ambiente; não criar commit por Git
  nem inventar hash antes de disponível.