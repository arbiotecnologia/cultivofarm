# Usuários: regressão da lista e desvínculo B2B — 2026-10-18 (REVISÃO 2)

## 1. Regressão da lista (Configurações › Usuários)

Prova server-side (transação READ ONLY + ROLLBACK, identidade do Admin AR simulada por
claims, role `authenticated`, ref canônico swzpzcwiasxmjutrmvkm):
- `tenant_admin_list_users(todos)` = 6 (inclui teste4@ inativo); `ativos` = 5; `inativos` = 1.
- `tenant_admin_user_links` responde sem erro para os 6.
- Banco: 14 perfis (11 ativos, 3 inativos); nenhuma exclusão física.
- `tenant_admin_set_user_active` NÃO foi exercitada nesta rodada (sem escopo de escrita);
  o comportamento da mutation é coberto apenas por testes locais do contrato.
Conclusão: banco/RLS/RPC não são a causa da lista vazia. Causa na interface não reproduzida
em browser autenticado (projeto Supabase externo, `external_unmanaged` — sem sessão que o
agente possa mintar; prova browser autenticada segue PENDENTE e depende de ação humana).

### Correções aplicadas nesta rodada (código, sem SQL/publicação)

`src/lib/configuracoes/usuariosListQuery.ts` (novo, puro/testável):
- contratos tipados estreitos das RPCs `tenant_admin_list_users` e
  `tenant_admin_set_user_active` (elimina `as never`/`as any` soltos na tela);
- `montarArgsListagem` (filtros/paginação), `carregarUsuariosAdmin` (envelope validado,
  erro da RPC propagado sem mascarar), `definirStatusUsuario` (ativa e desativa pela
  MESMA RPC — reativação não contorna o fluxo existente; retorno ambíguo é rejeitado);
- `placeholderMesmaConsulta`: placeholderData só reutiliza dados quando a consulta é
  exatamente a mesma (mesmo tenant, mesma sessão, mesmos filtros e página). Trocar
  filtro/página/tenant/sessão nunca exibe registros desatualizados.

`src/pages/Configuracoes.tsx`:
- listagem e mutation de status passam a usar o módulo tipado (cast único do receiver,
  padrão já usado em `userLinksQuery.ts`);
- placeholderData restrito à mesma consulta (antes: qualquer consulta do mesmo
  tenant/sessão podia exibir a página anterior com status velho);
- sucesso da mutation invalida também `["admin-user-links"]`;
- demais ajustes da rodada anterior mantidos: lista não esvazia durante recarga,
  consulta só roda com organização+usuário resolvidos, página fora do intervalo volta
  à última válida, erro mostra o detalhe real, botão "Reativar" explícito em linhas
  inativas (mesma RPC tenant, mesmo fluxo da desativação).
- teste4@ NÃO foi reativado.

`src/test/config/edicaoUsuarioRpc.test.ts`: asserção estática atualizada para o novo
módulo (a chamada RPC saiu da tela).

### Testes executados (reais, esta rodada)

- `src/test/config/usuariosListQuery.test.ts` (novo): **18/18 PASS** — filtros
  ativo/inativo/todos, paginação/offset, erro de RPC propagado, envelope inválido,
  desativação e reativação pela mesma RPC com confirmação estrita, retorno ambíguo
  rejeitado, e cache: mesma consulta reutiliza, filtro/página/tenant/sessão novos não.
- Suíte `src/test/config`: **523 passed, 2 failed** — as 2 falhas são a dívida legada
  conhecida de `ClienteDocumentosTab` (importa tipos legados), fora deste recorte.
- Typecheck (`tsgo -p tsconfig.app.json`): **0 erros**.
- ESLint em `Configuracoes.tsx`: 14 erros, todos em linhas legadas pré-existentes
  (nenhum introduzido; a rodada removeu 4 legados). Módulo e teste novos: 0 erros.
- Build da prévia: **OK** (build-errors.log 16:37Z).

Não verificado: teste browser autenticado (Admin A/B e superadmin) — bloqueio externo:
`LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged`, sem sessão mintável. Necessário humano
com sessão real para reproduzir/validar a regressão original na UI.

## 2. Vínculos B2B zero/um/múltiplos — plano dedicado

Substitui a proposta anterior (que sugeria DELETE em `partner_users` como caminho de
desvínculo e referenciava coluna `ativo` inexistente — ambas descartadas).

Plano completo em `docs/auditorias/vinculos-b2b-multiplos-plano-20261018.review.md`:
- evolução controlada da própria `partner_users` (sem tabela paralela): vigência,
  revogação (`revoked_at`/`revoked_by`/motivo), `tenant_id` derivado, histórico
  append-only, `UNIQUE(user_id, partner_id)` + unicidade parcial de vínculo ativo;
- remoção do `UNIQUE(user_id)` somente na fase de cutover, após todos os consumidores
  resolverem "vínculo ativo" (inventário exato é Fase 0, read-only);
- transição entre parceiros nunca transfere carteira/pedidos/propostas/comissões/
  documentos; pedidos mantêm snapshot do parceiro original;
- revogação invalida autorização server-side na mesma transação; demais vínculos e
  papéis preservados;
- rollback por fase, com preflight de contagem antes de recriar `UNIQUE(user_id)`.

Nenhum DDL/DML executado. Constraint `partner_users_user_id_key` intacta.

## Pendências

- Prova browser autenticada da lista (Admin A/B, superadmin) — requer sessão humana.
- Fase 0 do plano de vínculos: inventário read-only exato dos consumidores de
  `partner_users` (policies, funções, triggers, FKs, Edge, hooks).
- Invalidação de sessão do titular em outro dispositivo depende do recorte de cache
  same-identity (gate false) — bloqueio para liberar UI de revogação.
- 2 testes legados falhando (`ClienteDocumentosTab` importa tipos legados) — fora deste recorte.
