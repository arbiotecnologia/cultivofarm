# Vínculos externos — Fase 1 (leitura/descoberta) e proposta da Fase 2

## Auditoria dos contratos existentes
- `externalUserDraft.ts`: cadastro externo exclusivo (`parceiro_b2b` gestor com 1 parceiro; `cliente_produtor` com 1..100 clientes + principal); técnico B2B negado; sem senha/tenant no payload.
- `usuariosValidation.ts`: validação de edição exige cliente p/ Produtor e parceiro p/ B2B, mas `saveEditUser` envia `cliente_ids=[]`, `clienteIds=[]`, `partnerId=null`.
- `admin_edit_user_profile_v1` (INVOKER): recusa qualquer vínculo (`user_edit_unscoped_links_forbidden`) e qualquer papel externo atual ou desejado (`user_edit_linked_role_unavailable`). Ela não toca em `user_clientes`/`partner_users`. Que ela apague vínculo **não foi comprovado** e, pelo código, não ocorre: os guards recusam a chamada antes de qualquer escrita.
- Busca de elegíveis do cadastro: `partner_accounts` (`commercial_owner_organization_id` = empresa, ativo, não excluído) e `clientes` (`organization_id` = empresa, `status_cliente='ativo'`), paginada 20/pg, sob RLS. B2B = cliente comercial da empresa, não tenant SaaS.
- Guards mantidos: nenhum foi removido.

## Entregue na Fase 1
- Migrations `20261016190539_*` e `20261016190606_*`: `platform_private.tenant_admin_user_links(uuid[])` (DEFINER, `search_path=''`, EXECUTE só `authenticated`) + wrapper `public.tenant_admin_user_links` (INVOKER, sem `anon`). Exige Administrador ativo, não superadmin; empresa derivada de `profiles`; filtra alvos por empresa; clientes/parceiros só da mesma empresa; outros vínculos aparecem apenas como contagem `fora_do_alcance`. Somente leitura.
- `src/lib/configuracoes/userLinks.ts` (puro) + `Configuracoes.tsx`: coluna/cartão "Vínculo", "Tipo de acesso", seção "Vínculo atual" na edição; externos com salvar desabilitado e explicação; ajuda sem elegíveis; carregando/erro/sem vínculo distintos.
- Teste: `src/test/config/userLinks.test.ts`.

## Evidências
- Readback: público INVOKER, privado DEFINER; `anon` sem EXECUTE nos dois.
- Chamada sem sessão via REST → `42501 permission denied`.
- Vitest config focal 73/73; typecheck app 0; lint focal 0.
- **Não verificado**: negativas com sessão real (Admin AR vs FSF, Financeiro, externos). O editor SQL hospedado não permite `SET ROLE authenticated` e não há fixtures autorizadas. Pelo código: Financeiro/externos → `tenant_users_forbidden`; ids de outra empresa → omitidos (a UI mostra "Vínculo indisponível", nunca "sem vínculo").
- Pré-existente, fora do escopo: 2 testes estáticos (`canonicalTypesGuard`, `cultivofarm-runtime.static`) falham por imports do `types.ts` legado em 4 arquivos não tocados.

## Rollback da Fase 1
`DROP FUNCTION public.tenant_admin_user_links(uuid[]); DROP FUNCTION platform_private.tenant_admin_user_links(uuid[]);` e reverter os arquivos de UI. Sem dados a preservar, pois a função só lê.

## Proposta da Fase 2 (NÃO aplicada; requer aprovação)
1. `admin_edit_user_profile_v2` — dados comuns de externos, preservando vínculos: aceita somente `nome/telefone/cargo/cpf_cnpj`, papéis **iguais** aos atuais (sem trocar o tipo), CAS por `updated_at`. Não lê nem escreve `user_clientes`/`partner_users`.
2. `tenant_admin_set_user_links_v1(p_user_id, p_expected_links_version, p_cliente_ids, p_principal, p_partner_id, p_idempotency_key, p_reason)`:
   - DEFINER privado + wrapper INVOKER; Admin da mesma empresa; alvo com papel externo exclusivo; técnico B2B negado.
   - CAS: `links_version` = hash determinístico dos vínculos vigentes, lido pela Fase 1 e conferido com `FOR UPDATE` no perfil.
   - Idempotência: tabela privada `(actor, key) → request_hash, resultado`. Mesma chave com payload diferente = conflito.
   - Revogação não destrutiva: `is_active=false, revoked_at=now(), revoked_by` (sem DELETE); inserção nova com `assigned_by`. Parceiro: troca 1→1 na mesma empresa, com o vínculo anterior auditado.
   - Auditoria imutável: antes/depois por id, ator, motivo e chave.
   - Cache: invalidar `admin-users`, `admin-user-links` e `partner-users-links`; `broadcastPortalEvent roles_updated` para o titular.
   - Testes SQL: CAS obsoleto, replay, cliente/parceiro de outra empresa, inativo, Financeiro, superadmin, último principal e técnico B2B.
3. Os guards da v1 permanecem até a v2 ser revisada.
