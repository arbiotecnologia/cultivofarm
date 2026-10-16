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
- Revisão independente a5a8725b: SQL hospedado com `SET ROLE authenticated` + claims (com `iat`), usando identidades existentes: 2 Admins (AR/FSF) isolados e 5 papéis negados — PASS. (A afirmação anterior de que isso não era possível estava errada.)

## Delta Fase 1 (pós-revisão a5a8725b)
- `parseVinculos` valida o contrato completo: objetos, UUIDs (usuário, cliente, parceiro), textos, booleanos estritos, contagens inteiras ≥ 0, usuário duplicado e coerência `parceiro`↔`parceiros_total`. Qualquer desvio gera erro (UI: "Vínculo indisponível"), nunca "sem vínculo".
- Edição de externo: perfis internos ocultos; nome/telefone/cargo/CPF-CNPJ/CREA desabilitados (`fieldset disabled`); salvar desabilitado; seção "Alterar Senha" separada permanece igual.
- Tipos: removidos os `any` novos (consulta de vínculos, `renderVinculo`, teste, `find` inline); `usersPage` memoizado.
- Testes: `userLinks.test.ts` 30/30 (15 negativos do parser). Typecheck 0; build OK; scanner F4b 43/43.
- Lint (sem desligar regras) nos 3 arquivos: `userLinks.ts` 0, `userLinks.test.ts` 0, `Configuracoes.tsx` 18 erros — todos legados, idênticos à versão anterior à Fase 1 (`efe98507`: 18 erros + 2 avisos; `any` antigos, `prefer-const`, `no-empty`). Nenhum novo; avisos de dependência zerados.
- Pré-existente, fora do escopo: 2 testes estáticos (`canonicalTypesGuard`, `cultivofarm-runtime.static`) falham por imports do `types.ts` legado em 4 arquivos não tocados.

## Rollback da Fase 1
`DROP FUNCTION public.tenant_admin_user_links(uuid[]); DROP FUNCTION platform_private.tenant_admin_user_links(uuid[]);` e reverter os arquivos de UI. Sem dados a preservar, pois a função só lê.

## Proposta da Fase 2 (candidata; implementação autorizada, sem escrita aplicada até revisão independente)
Estende o contrato existente em vez de criar `v2` paralelo: `admin_edit_user_profile_v1` ganha parâmetros opcionais (`p_expected_version`, `p_links`, `p_idempotency_key`, `p_reason`); chamadas atuais (sem `p_links`) mantêm comportamento e guards idênticos. Só existirá função separada se a revisão mostrar conflito de assinatura/ACL.
1. **Versão/CAS única (perfil + vínculos):** `version = sha256` canônico de: campos comuns do perfil, `updated_at`, papéis ordenados e status ativo, e todos os vínculos `user_clientes` (id, cliente, principal, is_active, revoked_at, datas, access_level) e `partner_users` (id, parceiro, papel, ativo). Exposta pela leitura da Fase 1; divergência → `version_conflict` sem escrita.
2. **Concorrência:** na ordem perfil → vínculos do alvo → clientes/parceiros elegíveis (ids ordenados), `FOR UPDATE`; versão recalculada após os locks.
3. **Idempotência:** tabela privada `(actor, tenant, key) → request_hash, version_after, resultado`. Replay só após revalidar ator Admin ativo, tenant atual e alvo na mesma empresa; mesmo `request_hash` → resultado gravado; hash diferente → `idempotency_conflict`.
4. **Elegíveis:** Produtor → `clientes` da empresa, `status_cliente='ativo'`, 1..100 e um principal. Gestor B2B → um `partner_accounts` ativo, não excluído, com `commercial_owner_organization_id` = empresa (cliente comercial, não tenant SaaS). Técnico B2B negado. Troca de tipo de acesso fora do recorte.
5. **Revogação não destrutiva:** `is_active=false, revoked_at, revoked_by` (sem DELETE); novos vínculos com `assigned_by`.
6. **Efeito imediato da revogação:** não depende de broadcast da aba do Admin. As leituras/RLS/guards canônicos já revalidam vínculo vigente no servidor a cada requisição; a mutação incrementa a versão e o portal do titular revalida contexto no próximo foco/requisição. O broadcast `roles_updated` é apenas aceleração de UI.
7. **Auditoria imutável:** antes/depois por id, ator, tenant, motivo, chave e hashes — sem dados sensíveis.
8. **Testes SQL adversariais:** CAS obsoleto (perfil e vínculo), replay igual/diferente, replay após perda de Admin, cliente/parceiro de outra empresa, inativo/excluído, owner errado, Financeiro, superadmin, técnico B2B, último principal, corrida de dois Admins.
9. Guards atuais permanecem até a revisão independente aprovar a candidata.
