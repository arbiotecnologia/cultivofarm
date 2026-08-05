# Paridade do Módulo de Visita Técnica (staging ikaauvsflpmamgxmkhoq)

Objetivo: administrador, gestor, consultor e técnico atendendo a MESMA visita, com os mesmos dados e a mesma sequência de status. A diferença entre perfis fica apenas nas ações permitidas, nunca na completude da informação.

## Diagnóstico confirmado no código

Verificado nesta sessão:

- `src/pages/VisitaTecnica.tsx` (2.282 linhas) concentra o fluxo administrativo completo; o portal técnico usa `src/pages/app/MobileVisitaWizard.tsx` (996 linhas) + `src/pages/app/wizard/*` (Checkin, Campo, Diagnóstico, Recomendação, Anexos, Revisão).
- Bloqueio crítico: em `MobileVisitaWizard.tsx` linha 317 o cálculo de `locked` faz `if (!isNew) return true`. Toda visita já criada abre somente leitura no portal técnico — inclusive rascunho recém-criado, para o qual o próprio wizard redireciona (`/app/visita/:id?step=2`).
- Comentários e aviso de tela ainda declaram "somente a Etapa 1 é funcional" (linhas 45–52), o que já não corresponde ao código.
- `MobileRegistrosTecnico.tsx` (linhas 57–58) e `MobileCheckin.tsx` (linhas 167 e 254) navegam para `/visita-tecnica/:id`, saindo da rota móvel canônica.
- Dois fluxos de check-in coexistem: página `MobileCheckin.tsx` e `WizardCheckinStep.tsx`.
- `MobileRegistrosTecnico.tsx` usa `select("*")` com limite fixo 50, sem paginação, e uma tabela de status própria divergente de `src/lib/registroTransitions.ts` (inclui `em_andamento`, não inclui `reprovado`).
- No banco de staging já existem RPCs seguras: criação idempotente, check-in/checkout, campo, upsert de diagnóstico e recomendação, finalização, envio para aprovação, conversão em OS, atribuição/remoção de equipe, force checkout e helpers de permissão (`can_view/can_manage/can_checkin/can_checkout_technical_visit`, `is_active_visit_participant`, `is_visit_responsible`, `is_visit_org_manager`).
- Não existe no banco: RPC de leitura consolidada da visita, nem RPC transacional para reprovação, pedido de ajuste, arquivamento, reabertura, programação de retorno e plano de monitoramento — esses caminhos ainda são update/insert diretos em `useFluxoVisitaTecnica.ts`.

A canonicidade de `visitas_campo` × campos resumidos de `registros_consultor` e o inventário de RLS/grants/Storage serão confirmados na Fase 1 antes de qualquer alteração.

## Fase 1 — Baseline e provas (somente leitura)

- Inventário de rotas, componentes por portal, campos exibidos/editáveis, tabelas, RPCs, triggers, enums, constraints, RLS, grants e policies do bucket `consultor-arquivos`.
- Matriz `Campo/ação × Administrador · Gestor · Consultor · Técnico atribuído · Observador · Produtor × Fonte de dados × Mutation canônica`, gravada em `docs/visita-tecnica-paridade.md`.
- Prova runtime autenticada (harness com perfis reais em staging) abrindo um rascunho em `/app/visita/:id` e registrando o bloqueio atual.
- Snapshot de rollback dos objetos tocados.

## Fase 2 — Correção crítica do portal técnico

- `locked` passa a derivar de permissões efetivas vindas do backend (`can_manage_technical_visit` / participante ativo) + status editável, nunca de `isNew`.
- Navegação: `MobileRegistrosTecnico` e `MobileCheckin` passam a abrir `/app/visita/:id` (com `?step=`); `/visita-tecnica/:id` permanece como rota administrativa/desktop e todos os deep-links existentes continuam válidos.
- Remoção dos avisos e comentários desatualizados sobre "somente Etapa 1".
- Check-in consolidado em um componente de domínio compartilhado; `/app/checkin*` vira wrapper/redirect contextual preservando GPS, justificativa sem GPS, foto, checkout, fila offline e idempotência.

## Fase 3 — Workspace canônico

- Nova RPC `rpc_get_visita_workspace(p_registro_id)` retornando em lote e filtrada pelo usuário autenticado: identificação, solicitação de origem, produtor/fazenda/talhão/cultura, equipe e presença, check-in/checkout, avaliação de campo, diagnósticos, evidências, recomendações, conduta, encerramento, aprovação e comentários, timeline, monitoramento, retorno, OS vinculadas, `version`, `status` e o mapa de permissões efetivas por ação.
- Frontend (desktop e mobile) consome a RPC; `select("*")` eliminado nas telas de visita e a lista móvel ganha paginação server-side e status alinhados a `registroTransitions.ts`.
- Definição explícita da fonte canônica por campo: `visitas_campo` como fonte estruturada da avaliação (passa a ser lida também na tela administrativa) e os campos de `registros_consultor` tratados como snapshot derivado, atualizado transacionalmente.

## Fase 4 — Paridade funcional mobile-first

Componentes de domínio compartilhados (extraídos, não duplicados) com layouts próprios para desktop e mobile, cobrindo no portal técnico: identificação; equipe e presença; avaliação de campo; diagnósticos; evidências (fotos, áudios, laudos, documentos); recomendações completas; conduta e orientação; próximo passo; revisão e finalização; acompanhamento (aprovação, comentários, OS, retorno, monitoramento, timeline). O técnico visualiza resultado de aprovação e comentários, sem ação de aprovar.

## Fase 5 — Mutations server-side

- Reuso das RPCs seguras existentes; fim do delete/reinsert de diagnósticos na tela administrativa (passa a usar `rpc_upsert_diagnostico_visita` / `rpc_delete_diagnostico_visita`).
- Novas RPCs transacionais versionadas: atualização da identificação, alteração coordenada da avaliação de campo, pedido de ajuste, reprovação, arquivamento, reabertura, programação de retorno e plano de monitoramento — todas com checagem de permissão, `expected_version` e respeito à matriz de transições.

## Detalhes técnicos

- Migrations aplicadas apenas em `ikaauvsflpmamgxmkhoq`, com GRANT explícito e RLS/`SECURITY DEFINER` com `search_path` fixo; produção `navfzbwgwzruipouyfnk` intocada e projeto não publicado.
- Cada fase encerra com typecheck, build e vitest; certificação final por harness runtime com perfis reais (admin, gestor, consultor responsável, técnico atribuído, técnico não atribuído, produtor) provando isolamento e paridade.
- Entregáveis de documentação: `docs/visita-tecnica-paridade.md` (matriz + resultado dos gates) e artefato de rollback em `restoration/`.
