# Rollout mínimo separado — EXECUTADO PELO AUDITOR / NÃO REAPLICAR

**Atualização 08/11 21:45 UTC:** o auditor instalou somente este pacote `cc1f6cc…` em `swzpzcwiasxmjutrmvkm` pela migration `commercial_plans_tenant_isolation_reviewed_20261108`, com PRE_OK e POST_OK relatados. FSF real passou de seis planos para zero após reload; controle positivo ARBio aguarda login. Seis planos, quatro assignments, nove orders, dez receivables e cinco fiscal invoices preservados.

Este roteiro é agora histórico. Não executar novamente PRE/install/rollback. A baseline dos demais candidatos é POSPLANOS; instaladores combinados que incluem planos estão proibidos na produção atual. Advisors pós: RLS sem policy 60→59, DEFINER inalterados, auth_rls_initplan 47→48 e unused 327→328; revisar `cpp_tenant_read` somente com evidência de impacto real, sem ampliar grants. Detalhes em `../b2b-downstream-audit-20261107/production-postplans-baseline-20261108.md`.

## Artefato exato e independência

Usar exclusivamente os quatro arquivos deste pacote: `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review`. Install SHA256 `cc1f6cc837e29377b6b6fa4deaa334257cdab5484025a519dfd5833b8a12cd40`.

Não usar o instalador composto de B4/ponte. Não instalar logística, fiscal, recebíveis, ativação de piloto nem alterar parâmetros comerciais. Os 25 corpos e cercas aqui pertencem ao isolamento do mesmo contrato comercial existente. A pendência fiscal não exige postergar a contenção de leitura/escrita entre empresas, mas também não autoriza instalar este SQL sem revisão.

## PRE atual de produção — obrigatório, PRE_OK relatado pelo auditor na revisão 40186

Em 08/11/2026 20:58 UTC, o auditor informou comprovação do projeto/ref via `list_projects` e execução de `01-pre.sql.readonly` em `BEGIN READ ONLY`/`ROLLBACK`, com `PRE_OK`. Informou também coleta dos advisors atuais de segurança/desempenho; a revisão do impacto continua pendente. Esses são fatos relatados, não operações ou captura executadas pelo Lovable nesta rodada. Não há autorização de instalação. Evidências detalhadas dos advisors não foram disponibilizadas aqui; comparar antes/depois continua obrigatório.

1. Comprovar conexão ao ref `swzpzcwiasxmjutrmvkm` fora da mera declaração GUC; declarar esse ref para o PRE somente depois da comprovação. Divergência aborta.
2. Capturar data/hora, versão PostgreSQL, corpos completos/MD5/owners/ACLs, policies/grants/triggers/índices/constraints das relações afetadas. Comparar integralmente com `capture/live-pins.json`, manifesto e PRE; drift não permite trocar pinos por conveniência.
3. Executar PRE em transação READ ONLY e registrar resultado/exit code. Exige ausência de `organization_id`, índice global de padrão e `UNIQUE(code)` exatos, e pins de todas as funções. Estado já instalado exige outro procedimento revisado, não reaplicar.
4. Revisar proveniência atual por `profiles.user_id=created_by`, atribuições e versões B3 por família; nenhum nome/código prova tenant. Cinco planos historicamente ARBio e exceção `d89ce2b4…` de `8eae2bc1…` não substituem medição atual. Sem origem/ambiguidade = NULL/deny. Preservar seis planos, versões, snapshots, pedidos, títulos e configurações.
5. Medir colisões futuras `(organization_id,code)`, padrões por tenant, atribuições/matrizes cruzadas e ACLs efetivas. Qualquer conflito não explicado bloqueia instalação; não limpar dados automaticamente.
6. Revisar **advisors atuais de segurança e desempenho** coletados pelo auditor e capturar novamente depois. A coleta foi relatada; conteúdo e impacto ainda NÃO REVISADOS aqui: exigir relatório datado, separar achados prévios dos novos e revisar alertas relacionados a DEFINER/search_path/EXECUTE/RLS/índices. Não resolver alertas por grants amplos ou enfraquecimento de guards.

## Testes exatos antes de autorização

Reproduzir no PostgreSQL descartável a bateria isolada `test-local-pg.py` (79/79 histórico f32c4f3) sobre as capturas e hash exatos; guardar nova execução sem substituir evidência antiga. Exigir códigos iguais entre empresas permitidos, repetição interna negada, padrões por tenant, sete writers admin e revogação de papel/perfil/tenant durante rowlocks sem auditoria/mutação parcial. Leitura direta/RPC, B3, versões, atribuições/meios/matrizes cruzadas devem permanecer fechadas. Rebuild fresh a1f275 40/40 é complementar, não homologação de produção.

Reexecução 40186 concluída: **79/79, exit 0**, capturas/pins e quatro artefatos byte-idênticos; **62/62 testes frontend, seis arquivos, exit 0**. Evidências novas em `evidence/review-40186/README.md`, incluindo comparação de permissões antes/depois/reversão. Não houve nova execução logística: foram verificados os arquivos exatos 13/13 e 40/40 já existentes. JWT/RLS/Storage/browser autenticado seguem pendentes.

## Instalação e POST pelo auditor

Após autorização específica, executar somente install exato, depois POST integral e nova captura de metadados/advisors. Não há autorização de instalação neste documento. Falha/drift = interromper; não instalar B4 para resolver.

Reteste autenticado real: ARBio lista apenas próprios; FSF não lista ARBio; Atribuições FSF permanece sem dados estrangeiros. Não escrever como FSF em produção para provar negação. Escritas negativas/revogação durante lock pertencem ao ambiente descartável. Comprador vê somente condição publicada/vigente atribuída ao seu vínculo; revogado não acessa. Sem enviar pedido, NF, cobrança ou mensagens.

## Impacto frontend e rollback

As RPCs conservam assinaturas/retornos usados por `useCommercialPaymentPlansAdmin`, `useCommercialPaymentPlans` e `useB2BPaymentMethodAdmin`; nenhum frontend novo/publicação é pré-requisito desta contenção. Listas globais passam a recorte próprio, planos ambíguos ficam indisponíveis; formulário não deve interpretar indisponibilidade como autorização. Recarregar sessões e invalidar listas após instalação para não confundir cache prévio com resposta fresca; testar Novo plano, versões, padrão e reordenação apenas por fixtures autorizadas do auditor. Mudança de targeting B3 e defaults financeiros é separada.

Rollback usa somente deny-only deste pacote: fecha leituras/RPCs, preserva coluna, índices por tenant, guards, dados e snapshots. Não restaura leak nem unicidade global; interfaces podem ficar indisponíveis, e isso deve ser comunicado. Encerramento exige POST, advisors e provas reais revisadas, não contagem isolada de PASS.