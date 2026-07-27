# Subfase 1B — Relatório de execução

**Ambiente:** staging `ikaauvsflpmamgxmkhoq` (ar-bio-temp). Produção `navfzbwgwzruipouyfnk` **não tocada**.
**Data:** 2026-07-27. **Custo estimado:** ~14 créditos (dentro do teto 22).

## 1. Objetos aplicados

Migration **1B** (fail-fast, transacional):

1. **`_comunicacao_publish_system_event`** — allowlist estendida:
   - Novos `event_key`: `solicitacao_criada`, `solicitacao_atribuida`, `solicitacao_checkin_realizado`,
     `solicitacao_em_visita`, `solicitacao_aguardando_os`, `solicitacao_concluida`, `solicitacao_cancelada`,
     `solicitacao_urgencia_critica`.
   - `source_type` obrigatório para eventos `solicitacao_*`: `portal_solicitacoes`.
   - `source_id` NOT NULL.
   - Allowlist de chaves de payload (contrato §10): `solicitacao_id, numero, cliente_id, fazenda_id,
     tipo_demanda, urgencia, status_anterior, status_novo, consultor_atribuido, origem_solicitacao,
     ocorrido_em, transicao`.
   - `SECURITY DEFINER` mantido, `search_path=public`.

2. **`_comunicacao_resolve_recipients_v2`** — branch `solicitacao_*`:
   - `source_participants` → produtor (`portal_solicitacoes.cliente_id`) + `consultor_atribuido` quando existir.
     Isolamento por tenant garantido pela leitura direta da linha.
   - `by_role` → apenas usuários com role igual ao `perfil`, `profiles.ativo=true`.
   - Nunca retorna terceiros; deduplicação por `(recipient_user_id, recipient_cliente_id)`.

3. **`_comunicacao_trg_portal_solicitacao`** (trigger AFTER INSERT/UPDATE, `SECURITY DEFINER`,
   `search_path=public,extensions`):
   - Emite evento por transição real de `status` (uma emissão por INSERT/UPDATE), evitando duplicidade
     de "atribuída" quando `status` e `consultor_atribuido` mudam no mesmo comando.
   - Emite `solicitacao_urgencia_critica` em INSERT crítico ou UPDATE para crítica.
   - Idempotência determinística: `solicitacao:` + SHA-256(`event_key | id | transicao | updated_at`),
     calculado via `extensions.digest` (pgcrypto em schema `extensions`).
   - Payload sempre alinhado ao contrato §10; `jsonb_strip_nulls` remove opcionais ausentes.

4. **Substituição do legado**: `DROP TRIGGER trg_notify_solicitacao` (função
   `public.notify_solicitacao_atribuida` **preservada** para rollback rápido). Instalação do
   trigger novo `trg_comunicacao_solicitacao`. Tudo em uma única transação.

## 2. Defeitos capturados pelo harness (corrigidos antes do commit final)

O harness capturou **dois defeitos reais** que só apareceriam em produção:

| # | Defeito | Correção aplicada |
|---|---------|-------------------|
| D1 | Trigger chamava `digest()` sem qualificação; `pgcrypto` está em `extensions`, não em `public` — falhava em runtime. | Trigger recriado com `SET search_path = public, extensions` e chamada explícita `extensions.digest(...)`. |
| D2 | Payload do trigger emitia `status` (fora do contrato §10), causando `chave de payload não permitida`. Também usava `NEW.numero` (a coluna real é `numero_solicitacao`). | Payload realinhado ao contrato: `status_novo`, `status_anterior`, `numero := numero_solicitacao`, `origem_solicitacao`, `ocorrido_em`, `transicao`. |

Ambos foram corrigidos com `CREATE OR REPLACE FUNCTION` (idempotente, sem tocar
allowlist do publisher nem resolver v2).

## 3. Harness transacional (sentinel-rollback, zero resíduo)

Cobertura: 16 asserts (T01–T16 + T18).

| ID | O que valida | Resultado |
|----|--------------|-----------|
| T01 | INSERT normal → 1 `solicitacao_criada` | PASS |
| T02 | INSERT já crítica → `solicitacao_criada` **+** `solicitacao_urgencia_critica` (2 eventos) | PASS |
| T03 | UPDATE status→atribuída **e** consultor NULL→X no mesmo comando → **exatamente 1** `solicitacao_atribuida` (sem duplicidade) | PASS |
| T04 | UPDATE status→checkin_realizado → `solicitacao_checkin_realizado` | PASS |
| T05 | UPDATE status→em_visita → `solicitacao_em_visita` | PASS |
| T06 | UPDATE status→aguardando_os → `solicitacao_aguardando_os` | PASS |
| T07 | UPDATE status→concluida → `solicitacao_concluida` | PASS |
| T08 | UPDATE status→cancelada → `solicitacao_cancelada` | PASS |
| T09 | UPDATE irrelevante (`descricao`) → nenhum evento novo | PASS |
| T10 | Replay: 2× UPDATE `status='pendente'` com `updated_at` igual → nenhum evento novo (idempotência SHA-256) | PASS |
| T11 | UPDATE urgência não-crítica → crítica → `solicitacao_urgencia_critica` | PASS |
| T12 | Publisher rejeita `event_key` desconhecido (P0001) | PASS |
| T13 | Publisher rejeita `source_type` errado para `solicitacao_*` (P0001) | PASS |
| T14 | Publisher rejeita chave de payload fora da allowlist (P0001) | PASS |
| T15 | Resolver v2 `source_participants` → produtor exato (`cliente_id`) + consultor atribuído; total = 2 | PASS |
| T16 | Resolver v2 `by_role`='administrador' → conta igual a `user_roles ∩ profiles.ativo=true` | PASS |
| T18 | `portal_notificacoes` inalterada durante toda a bateria (legado desanexado) | PASS |

A sentinela `RAISE EXCEPTION 'HARNESS_1B_OK_ROLLBACK_SENTINEL'` foi disparada na
linha 101 (após o último assert), forçando **ROLLBACK** de toda a transação.

**Verificação pós-rollback (query independente):**

```
clientes_res | sol | eventos_res | outbox | portal_notif
      0      |  0  |      0      |   0    |      0
```

Zero resíduo confirmado — nenhum cliente, solicitação, evento, outbox ou
notificação legada persistiu.

## 4. Compatibilidade e rollback

- **Publisher e resolver v2** foram alterados com `CREATE OR REPLACE`. Rollback por
  redeploy da versão anterior (assinaturas preservadas).
- **Legado**: `public.notify_solicitacao_atribuida()` **não foi removida**; para
  reverter basta:

  ```sql
  DROP TRIGGER IF EXISTS trg_comunicacao_solicitacao ON public.portal_solicitacoes;
  CREATE TRIGGER trg_notify_solicitacao
    AFTER INSERT OR UPDATE ON public.portal_solicitacoes
    FOR EACH ROW EXECUTE FUNCTION public.notify_solicitacao_atribuida();
  ```

- Nenhuma tabela nova. Nenhuma coluna nova. Nenhum GRANT alterado (publisher e
  resolver v2 são `SECURITY DEFINER` e mantêm o REVOKE de PUBLIC já existente).

## 5. Estado no fim da 1B

- `trg_comunicacao_solicitacao` **ativo** em `public.portal_solicitacoes` (verificado:
  `pg_trigger.tgenabled = 'O'`).
- `trg_notify_solicitacao` **desanexado** (verificado: 0 rows com esse nome em
  `pg_trigger` para a mesma tabela).
- `notify_solicitacao_atribuida` **preservada** em `pg_proc` (verificado: 1 row).
- Nenhuma regra em `comunicacao_regras` para eventos `solicitacao_*` — a
  emissão está viva mas **não produz outbox ainda** (subfase 1C fica responsável
  por popular regras + templates).

## 6. Artefatos

- `restoration/comunicacao-etapa1-1b/harness.sql` — versão original com sentinel;
  reproduzível via `psql -f` em qualquer ambiente somente-leitura de banco. A
  execução real foi feita via `supabase--migration` (o dispatcher desta
  workspace não persiste inline DO blocks em `supabase/migrations/`; o SQL das
  DDLs 1B ficou registrado como migrations aplicadas do lado servidor).
- `restoration/comunicacao-etapa1-1b/report.md` — este relatório.

## 7. Próximo passo

**Aguardo autorização explícita para a subfase 1C** (regras + templates dos
eventos `solicitacao_*` no schema `comunicacao_regras` + `comunicacao_templates`,
seguido de smoke com `COMMUNICATION_DELIVERY_ENABLED=false`).
