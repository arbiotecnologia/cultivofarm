# Cultivo Farm — Papel Superadmin de Plataforma (hardening)

Data: 2026-09-22
Banco canônico: `swzpzcwiasxmjutrmvkm`
Escopo: preparar backend e frontend para o papel de plataforma `superadmin`.
**Nenhum usuário foi criado; nenhuma senha manipulada; `mestre@arbio.com` não existe.**
S2 permanece bloqueada.

---

## A) Auditoria prévia (estado antes)

- `public.app_role` tinha exatamente os 13 papéis operacionais, sem `superadmin`.
- Caminhos que gravam papéis (inventário completo):
  1. RPC `admin_edit_user_profile_v1` (SECURITY INVOKER);
  2. RPC `admin_provision_user_profile_v1`;
  3. policy `"Admins can manage roles"` em `public.user_roles` (FOR ALL);
  4. Edge Function `create-user` (usa `service_role`, ignora RLS).
- Nenhum outro Edge/RPC grava `user_roles` a partir de role enviada pelo cliente.

## B) Migrations aplicadas

| Arquivo | Conteúdo |
|---|---|
| `20260922160033_90eac344-…` | `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin'` |
| `20260922160218_b19bd8e6-…` | Trigger de guarda, policy restrita, guards nas duas RPCs, validação `SUPERADMIN_M2_VALIDACAO_FALHOU` |
| `20260922160417_ea6c34e3-…` | Correção 3: guard de alvo passa a usar função que ignora visibilidade |
| `20260922160736_29af83f9-…` | Correção 4 (final): `is_platform_superadmin`, trigger em SECURITY INVOKER, policies separadas por operação, validação `SUPERADMIN_M4_VALIDACAO_FALHOU` |

Todas transacionais, idempotentes, com bloco de validação fail-closed ao final.
Os 13 papéis existentes foram preservados (adição sempre ao fim do enum; nenhuma
remoção ou reordenação).

## C) Defeitos encontrados PELAS PRÓPRIAS SONDAS (e corrigidos)

Três defeitos reais foram detectados depois da migration 2 e corrigidos na 4.
Registro explícito porque a versão intermediária **parecia** correta:

1. **Guard de alvo inoperante (sonda Q4).** `admin_edit_user_profile_v1` é
   SECURITY INVOKER; a policy nova escondia a linha `superadmin` do
   administrador, então `EXISTS(... user_roles ...)` retornava falso e o
   administrador **conseguia editar** um usuário de plataforma.
2. **`has_role` não serve como guard (diagnóstico D3/D5).** Ela exige
   `profiles.ativo = true`; um superadmin inativo passaria pelo guard. Criada
   `public.is_platform_superadmin(uuid)`, que checa apenas o vínculo.
3. **Trigger de guarda nunca bloqueava.** Estava como SECURITY DEFINER: dentro
   dela `current_user` virava `postgres`, satisfazendo a lista de exceção em
   qualquer chamada. Passou a SECURITY INVOKER.

## D) Estado final das travas

- `public.is_platform_superadmin(uuid)` — SECURITY DEFINER, `search_path` fixo,
  EXECUTE revogado de PUBLIC/anon, concedido a `authenticated` (necessário
  porque a RPC de edição é INVOKER) e `service_role`.
- Trigger `trg_guard_superadmin_role_assignment` (BEFORE INSERT/UPDATE/DELETE em
  `user_roles`, SECURITY INVOKER): qualquer linha com `role='superadmin'` só é
  tocada por `service_role`/`postgres`/`supabase_admin`; caso contrário
  `superadmin_role_reserved` (42501).
- Policies de `user_roles` separadas por operação: admin **lê** tudo; INSERT,
  UPDATE e DELETE exigem `role <> 'superadmin'`.
- `admin_edit_user_profile_v1`: `user_edit_superadmin_forbidden` (papel no
  payload), `user_edit_superadmin_target` (alvo é de plataforma) e o DELETE de
  sincronização nunca remove `superadmin`.
- `admin_provision_user_profile_v1`: `superadmin_role_reserved`.
- Edge `create-user`: bloqueio explícito 403 antes de qualquer escrita (a função
  usa `service_role` e, sem esse guard, passaria pelo trigger).

## E) Sondas transacionais (BEGIN … ROLLBACK, nada persistido)

| # | Cenário | Resultado |
|---|---|---|
| F1 | Admin concede `superadmin` a outro | bloqueado (`superadmin_role_reserved`) |
| F2 | Admin autoeleva | bloqueado |
| F3 | Admin gerencia papel normal (`financeiro` insert+delete) | OK — sem regressão |
| F4 | Usuário comum autoeleva | bloqueado |
| F5 | Mecanismo interno (`service_role`) concede | permitido |
| F6 | Admin **enxerga** a linha de plataforma | 1 linha (leitura permitida) |
| F7 | Admin tenta remover | nenhuma linha afetada |
| F8 | RPC de edição com alvo de plataforma | bloqueado (`user_edit_superadmin_target`) |
| F9 | Linha sobreviveu à tentativa do admin | sim |
| F10 | Mecanismo interno remove | OK; 0 linhas `superadmin` ao final |

Observação honesta sobre F7: a remoção pelo administrador **não gera erro**, ela
simplesmente não afeta linha alguma (a policy de DELETE filtra a linha antes).
O efeito de segurança é o pretendido; a ausência de erro é comportamento padrão
do PostgreSQL para DELETE filtrado por RLS.

## F) Frontend

- `src/lib/permissions.ts`: `AppRole` reconhece `superadmin`; rótulo
  "Superadmin de Plataforma"; **fora** de `ACCESS_MAP` e de `ACTIVE_ROLES`, logo
  não recebe nenhum módulo operacional; `getHomeForRole` → `/sem-permissao`
  (home segura provisória até o painel SaaS da Fase S4).
- `src/lib/portalContext.ts`: incluído em `ROLE_PRIORITY` apenas para não ser
  descartado no saneamento; não concede portal algum.
- `src/lib/configuracoes/edicaoUsuarioRpc.ts`: mensagens PT-BR seguras para
  `user_edit_superadmin_forbidden` e `user_edit_superadmin_target`.
- `supabase/functions/create-user/index.ts`: guard 403 antes de qualquer escrita.

## G) Validações (exits reais)

| Verificação | Resultado |
|---|---|
| `src/test/saas/superadmin-role.test.ts` | 20/20, exit 0 |
| Suíte completa | 5213 passaram, 4 skipped, 336 arquivos, exit 0 |
| Typecheck (`tsgo --noEmit`) | exit 0 |
| Build (`vite build`) | exit 0 |
| Linter Supabase | 484 alertas (era 483) |

O alerta adicional é `is_platform_superadmin` executável por usuário assinado —
condição necessária, já que a RPC de edição roda como `authenticated`. É uma
leitura booleana de vínculo, sem exposição de dados, mesmo padrão de `has_role`.

Manifestos de controle de migrations atualizados de 679 → 683 versões
(`restoration/homologacao-h7/h7p-repo-only-manifest.json` e
`restoration/homologacao-h9/h9c-applied-forwards.json`), com as exceções das
novas migrations registradas nas suítes de freeze 28A/28B/28C.

## H) Dados operacionais

Nenhum. `select count(*) from user_roles where role='superadmin'` = **0** (a
validação da migration 4 aborta se for diferente de zero).

## I) Pendências declaradas (não bloqueiam esta entrega)

1. Nenhum usuário de plataforma existe — criação é rodada futura e exige
   `service_role`/mecanismo interno.
2. `/sem-permissao` é home provisória; substituir pelo painel SaaS na Fase S4.
3. Bateria autenticada ponta a ponta (HTTP/PostgREST, por perfil) não executada;
   as provas são sondas transacionais no banco, que cobrem a decisão do
   PostgreSQL, não o caminho HTTP.
4. Herdadas do gate: proteção contra senhas vazadas desativada (ação do
   proprietário no painel) e seleção global de emitente fiscal.

---

## Conclusão: **PASS**

O papel de plataforma existe, é reconhecido pelo aplicativo, não recebe nenhum
módulo operacional e está fora do alcance do administrador de empresa por quatro
camadas independentes (trigger, policies, guards de RPC e guard no serviço de
criação), com todas as travas comprovadas por sonda. S2 permanece bloqueada.
