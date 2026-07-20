# Fase 4 — Auditoria estática de `supabase/migrations/202607*.sql`

Somente-leitura. Nenhum arquivo será editado e nenhum SQL será executado. Números confirmados por `rg` sobre `supabase/migrations/`.

## Escopo

- **Total**: 121 migrations
- **Intervalo**: `20260701211421` → `20260717230331` (01–17 jul 2026)
- **Densidade**: 02/07 e 03/07 concentram a maior parte das mudanças estruturais; 07/07 concentra RPCs financeiras/B2B; 16–17/07 concentra hardening final

## 1. Auth / senhas / PII / credenciais → EXCLUIR do rollout

Nenhuma migration cria usuários, insere em `auth.users`/`auth.identities`, manipula `encrypted_password`, chama `crypt()`/`gen_salt()`, ou contém e-mails `@arbio.com`/credenciais literais. As duas ocorrências detectadas são referências FK legítimas de esquema, **não** seeds:

- `20260703004033_...sql:16` — `created_by uuid REFERENCES auth.users(id)` (coluna FK em tabela pública)
- `20260716000241_...sql:8,59` — `user_id uuid ... REFERENCES auth.users(id) ON DELETE CASCADE` (colunas FK)

Também não há INSERT literal em `public.profiles` no lote. Os únicos INSERTs em `public.user_roles` e `public.partner_users` estão **dentro de corpos de função** (RPCs administrativas — `rpc_*` de vínculo parceiro/usuário), portanto código, não dados:

- `20260701211421_...sql`, `20260702022922_...sql`, `20260702022038_...sql` — INSERTs em `user_roles`/`partner_users` são partes de funções PL/pgSQL. Nenhum insere valores fixos; todos operam sobre argumentos da RPC. **Podem entrar** no rollout — não são seeds.

**Nenhum arquivo a excluir por conteúdo de senha/PII.** Preservamos o critério da Fase 3 (bloquear apenas o que criar/alterar usuário fora do fluxo administrativo já existente); nenhum arquivo de julho se enquadra.

## 2. Operações destrutivas / mudança de tipo

- **DROP TABLE**: 0
- **DROP COLUMN**: 1 arquivo
  - `20260702230711_...sql` — `ALTER TABLE public.partner_orders DROP COLUMN IF EXISTS partner_notes;` (destrutivo de dado histórico se a coluna estiver populada; revisão de negócio)
- **TRUNCATE**: 0
- **DELETE FROM em nível top** (fora de função): 0. Todos os `DELETE FROM` do lote estão em corpos de função ou no job `pg_cron` de retenção — não apagam dados no momento da aplicação da migration.
- **ALTER TYPE ADD VALUE** (enums, requerem execução fora de bloco transacional em PG<12; idempotentes com `IF NOT EXISTS` quando aplicável):
  - `20260702021959_...sql:1` — `app_role ADD VALUE IF NOT EXISTS 'parceiro_b2b_tecnico'`
  - `20260716203846_...sql:10` — `status_registro_consultor ADD VALUE 'em_andamento' BEFORE 'finalizado'` (sem `IF NOT EXISTS`; falha se já existir)
  - `20260717031214_...sql:4` — `tipo_checkin ADD VALUE IF NOT EXISTS 'checkout'`
- **DROP FUNCTION / DROP POLICY / DROP VIEW / DROP INDEX**: presentes em 30 arquivos listados na auditoria (padrão típico de "drop-and-recreate" de RPCs, policies e views para versionamento). Não são destrutivos de dado, mas **exigem ordem estrita**: qualquer arquivo posterior que dependa da assinatura antiga deve rodar depois do respectivo recreate.

## 3. Classificação data-only

- **Sem seeds de catálogo/configuração top-level detectados** em julho. Não há `INSERT INTO public.*` com dados fixos fora de corpo de função. Os arquivos com maior volume de INSERTs (`20260707222533`, `20260707220218`, `20260703034639`, etc.) contêm INSERTs **de auditoria/log dentro de funções** — código, não dados.
- **Operacional/PII**: nenhum INSERT direto em tabelas com PII. Julho é essencialmente estrutural: DDL, RPCs, policies, views, ajustes de enum, GRANT/REVOKE.

## 4. Dependências externas

- **`pg_cron`** (3 arquivos):
  - `20260703143003_...sql` — agenda refresh de matviews (5 min) e poda diária de logs > 180 dias (13 tabelas de log).
  - `20260703145323_...sql` — reagenda refresh das matviews `esteira_laboratorio` e `fluxo_visita_tecnica`.
  - `20260703161414_...sql` — reagenda os mesmos jobs novamente.
  - Observação: a poda agenda **180 dias** enquanto o estado atual declara "histórico 365". A retenção pode ter sido sobrescrita em agosto+; **verificar em runtime** antes de aplicar 03/07 para não reduzir a janela de auditoria.
- **`pg_net`**: 0 ocorrências.
- **Storage** (`storage.buckets`/`storage.objects`): 0 ocorrências. Nenhum bucket criado/alterado em julho.
- **Vault**: 0 ocorrências.
- **Edge Functions**: 1 referência apenas conceitual — `20260717115040_...sql` faz `REVOKE INSERT/UPDATE/DELETE ON public.visitas_checkin FROM authenticated` e mantém `GRANT ALL ... TO service_role` para uso pelas edges `rpc_realizar_checkin_visita`/`rpc_realizar_checkout_visita`. Requer que essas funções/edges já existam no ambiente.

## 5. Riscos de ordem / transação / idempotência

- **Sem `BEGIN;/COMMIT;` explícito** nos arquivos — cada migration é aplicada em transação implícita pelo runner (Supabase CLI). Isso é incompatível com `ALTER TYPE ADD VALUE` em algumas versões PG. O runner do Supabase costuma tolerar; ainda assim os 3 arquivos de enum devem ser aplicados **individualmente** e validados um a um.
- **`ALTER TYPE` sem `IF NOT EXISTS`** (`20260716203846`) falha se o valor `em_andamento` já existir → isolar em sublote próprio para permitir skip manual se idempotente.
- **DROP-and-recreate massivo** entre 02–03/07 (29 arquivos) exige aplicação **estritamente cronológica**; qualquer inversão quebra dependências entre policies e funções.
- **`pg_cron`**: aplicar 03/07 três vezes reagenda jobs — última execução vence. Se a produção já tem jobs equivalentes, o efeito líquido é substituição, não duplicação (todos usam `unschedule` protegido antes do `schedule`). Baixo risco.
- **`DROP COLUMN partner_notes`** (`20260702230711`) é irreversível — confirmar com negócio que a coluna está vazia/deprecada no ambiente atual antes da aplicação.
- **REVOKE em `visitas_checkin`** (`20260717115040`): quebra qualquer cliente que ainda faça INSERT/UPDATE/DELETE direto na tabela; aplicar **após** validar que o frontend só chama as RPCs `rpc_realizar_checkin_visita`/`rpc_realizar_checkout_visita`.

## 6. Sublotes cronológicos propostos (rollout)

Sequência estritamente cronológica; cada sublote validado (typecheck + build + smoke) antes do próximo.

```text
Sublote 4A · 01/07                (1 arquivo)   RPCs iniciais de vínculo parceiro/usuário
Sublote 4B · 02/07 estrutural     (~13 arqs)    Fundação B2B/produção + ALTER TYPE app_role
                                                Isolar: 20260702021959 (ALTER TYPE) e
                                                        20260702230711 (DROP COLUMN partner_notes — GO/NO-GO negócio)
Sublote 4C · 03/07 core           (~15 arqs)    RPCs, policies, views. Inclui:
                                                 - 20260703004033 (colunas FK auth.users)
                                                 - 20260703034639 (RPC de reversão OS com DELETE em cadeia)
                                                 - 20260703143003 / 145323 / 161414 (pg_cron; validar retenção 180 vs 365)
Sublote 4D · 07/07 financeiro/B2B (~10 arqs)    Logs de auditoria financeira e partner_orders
Sublote 4E · 16/07                (~5 arqs)     Inclui 20260716000241 (nova tabela user_id-cascade)
                                                Isolar: 20260716203846 (ALTER TYPE sem IF NOT EXISTS)
Sublote 4F · 17/07 hardening      (~7 arqs)     Isolar: 20260717031214 (ALTER TYPE tipo_checkin);
                                                       20260717115040 (REVOKE visitas_checkin — GO/NO-GO)
```

## 7. Recomendações de gate

1. Confirmar em runtime a retenção atual de logs (180 vs 365) antes de 03/07/143003 — se produção já roda 365, **skip** ou substituir manualmente pelo intervalo vigente.
2. Confirmar que `partner_orders.partner_notes` está deprecado antes de 02/07/230711.
3. Confirmar que nenhum cliente escreve direto em `public.visitas_checkin` antes de 17/07/115040.
4. Aplicar os 3 `ALTER TYPE` cada um em sublote isolado, com verificação `SELECT unnest(enum_range(NULL::<enum>))` antes/depois.
5. Não usar `service_role` no frontend; nenhuma migration do lote exige isso.

## O que a auditoria confirma vs. o que resta verificar

- **Confirmado por leitura estática**: contagens, listas de arquivos, presença/ausência de `pg_net`/Vault/Storage/DROP TABLE/TRUNCATE, todos os `ALTER TYPE`, todos os `DROP COLUMN`, todos os `DELETE FROM` top-level, todas as referências `auth.*`, todas as chamadas `cron.*`.
- **Não verificado (requer runtime, fora do escopo somente-leitura)**: valores atuais do enum `status_registro_consultor`, retenção real de logs, uso vivo da coluna `partner_notes`, existência dos jobs `pg_cron` já agendados, uso direto de `visitas_checkin` por qualquer cliente.

Aguardando autorização humana explícita para executar sublotes 4A–4F, um por vez, sem aplicar seeds de usuários/senhas (nenhum foi identificado neste lote).
