# Usuários: regressão da lista e desvínculo B2B — 2026-10-18 (REVISÃO, nada aplicado)

## 1. Regressão da lista (Configurações › Usuários)
Prova server-side (transação READ ONLY + ROLLBACK, identidade do Admin AR simulada por claims, role `authenticated`):
- `tenant_admin_list_users(todos)` = 6 (inclui teste4@ inativo); `ativos` = 5; `inativos` = 1.
- `tenant_admin_user_links` responde sem erro para os 6.
- `tenant_admin_set_user_active` altera só `profiles.ativo` do alvo (ROW_COUNT=1); nenhuma outra linha mudou (updated_at conferido).
- Banco: 14 perfis (11 ativos, 3 inativos); nenhuma exclusão.
Conclusão: banco/RLS/RPC NÃO são a causa. Causa na interface não reproduzida (sem sessão autenticada disponível para o agente; projeto Supabase externo).

Ajustes de baixo risco aplicados na UI (`src/pages/Configuracoes.tsx`):
- lista mantém a página anterior durante recarga (mesmo escopo identidade+tenant);
- consulta só roda com organização e usuário resolvidos;
- página fora do intervalo volta para a última válida;
- erro mostra o detalhe real retornado;
- botão explícito "Reativar" em linhas inativas (mesma RPC tenant).
teste4@ NÃO foi reativado.

## 2. Desvínculo/novo vínculo B2B — proposta (não aplicada)
Schema hospedado: `partner_users(id, partner_id, user_id, created_at, papel)`, `UNIQUE(user_id)`, sem colunas de vigência/revogação.
Proposta para revisão:
1. Tabela imutável `partner_user_link_history` (append-only, trigger que nega UPDATE/DELETE) com ator, tenant, parceiro antigo/novo, motivo, correlação.
2. RPC `tenant_admin_change_partner_link(p_user, p_from_partner, p_to_partner|null, p_reason, p_expected_version, p_idempotency_key)`, SECURITY INVOKER público + core DEFINER privado: tenant derivado de `auth.uid()`, ambos parceiros com `commercial_owner_organization_id` = tenant, CAS por `user_edit_f2_version`, locks ordenados, gate de identidade existente (sem bypass).
3. Desvincular = mover linha para o histórico e remover de `partner_users`, retirando apenas `parceiro_b2b`; demais papéis/vínculos preservados; pedidos mantêm snapshot (partner_id do pedido não muda).
4. Invalidação da sessão do titular depende do cache same-identity (gate false) — bloqueio para liberar.
Rollback: DROP da RPC/core; histórico preservado.

## Pendências
- Reproduzir a falha na UI com sessão real do Admin AR (console/rede) — necessária ação humana.
- Matriz A/B e superadmin autenticada real.
- 2 testes legados falhando (ClienteDocumentosTab importa tipos legados) — fora deste recorte.
