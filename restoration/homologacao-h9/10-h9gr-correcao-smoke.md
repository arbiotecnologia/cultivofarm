# H9-GR — Correção mínima dos defeitos reais do smoke autenticado

Ambiente único: **STAGING `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` e
sandbox `yzszlzjpovmcteuxjznj` não foram acessados. Gate de binding executado antes e
depois de qualquer comando de banco.

## 0. Binding

Ao iniciar, o gate reprovou: `.env` estava com drift (não apontava para o staging).
`.env` e `src/integrations/supabase/types.ts` foram restaurados do commit `4cf3e2ae`
(types com 21.850 linhas) e o gate passou:
`H9F BINDING GATE: OK — staging ikaauvsflpmamgxmkhoq`.

Ledger antes: **679** (`20261023000000_h9e2_visit_rpcs_authz_and_concurrent_idempotency_v1`).

## A. Caminho real do frontend (provado por leitura de código)

| Ação na UI | Caminho efetivo |
| --- | --- |
| Check-in (desktop e wizard mobile) | `useFluxoVisitaTecnica.registrarCheckin` → `rpc_realizar_checkin_visita` |
| Encerrar presença | `useFluxoVisitaTecnica.registrarCheckout` → `rpc_realizar_checkout_visita` |
| Finalizar visita (wizard mobile) | `WizardRevisaoStep` → `rpc_finalizar_visita_v2` (já correto) |
| Finalizar visita (**desktop `VisitaTecnica.tsx`**) | **`UPDATE` direto em `registros_consultor` com `status='finalizado'`** ← defeito |

As funções auditadas `start_technical_visit_secure` / `finish_technical_visit_secure`
não são usadas pela interface; permanecem intocadas.

## B. Causa raiz dos defeitos

1. **Log duplicado de check-in.** Um único `INSERT` em `visitas_checkin` acionava o
   trigger `trg_log_checkin` → `log_visita_checkin()` (log com metadata lat/lng/precisão)
   e, além disso, a RPC inseria manualmente um segundo `visitas_logs` com
   `acao='checkin_realizado'` e `metadata = NULL`. Daí as duas linhas idênticas em
   timestamp/usuário observadas no smoke. O mesmo padrão existia no encerramento
   (trigger gravava `checkin_realizado` para linha de tipo `checkout`).
2. **`finalized_at`/`finalized_by` nulos.** A página desktop gravava o status por
   `UPDATE` direto, fora do RPC `rpc_finalizar_visita_v2` — que é justamente quem grava
   `status`, `finalized_at`, `finalized_by`, `version` e o log, atomicamente.
3. **Código técnico cru na UI.** `checkin_duplicado_para_tipo_no_ciclo` era propagado
   como mensagem ao usuário.

## C. Correções aplicadas

### Banco — forward único `20261024000000` (ledger 679 → **680**)

- Arquivo: `restoration/homologacao-h9/h9gr-forwards/20261024000000_h9gr_visit_checkin_log_canonico_v1.sql`
  - sha256 `0370f6b2d92e983e188f01c98da63298547b9ed50bba43a6e2c9a62723ea73fa`
- Rollback byte-fiel: `restoration/homologacao-h9/h9gr-rollbacks/20261024000000_h9gr_visit_checkin_log_canonico_v1_rollback.sql`
  - sha256 `98d03ff3e03f59b6e55c828c80ce676d6f5e5c3f9b99ad302a762161c336049c`

Conteúdo: `log_visita_checkin()` torna-se a **única fonte canônica** de log de presença
(ação derivada do tipo real da linha; metadata com lat/lng/precisão + `tipo_checkin`,
`checkin_id`, `client_uuid`, `status`); as duas RPCs deixam de inserir o log redundante.
Assinaturas, retornos, ACL (`authenticated`, `service_role`), `search_path`, gate de
escopo antes de qualquer leitura, lock por registro, idempotência pós-lock, ausência de
oráculo e efeitos em `portal_solicitacoes`/`solicitacoes_timeline` foram preservados.
Nenhuma RLS alterada. Nenhuma migration aplicada foi editada.

### Frontend

| Arquivo | Mudança |
| --- | --- |
| `src/pages/VisitaTecnica.tsx` | finalização agora persiste campos/diagnósticos e chama `rpc_finalizar_visita_v2` com `p_expected_version`; o `status` é removido do payload de gravação direta (insert sempre nasce como `rascunho`) |
| `src/lib/visita/visitaErrorMessages.ts` (novo) | mapa código técnico → mensagem em português; código técnico exposto apenas para log interno |
| `src/hooks/useFluxoVisitaTecnica.ts` | check-in e checkout retornam mensagem amigável; `console.error` mantém o código técnico |

## D. Provas antes/depois (staging)

**Antes** (smoke, registro `9fa57957-5fcb-4ff0-a9e6-dd0a4df53931`): 1 check-in → 2 linhas
`visitas_logs` `checkin_realizado` (uma sem metadata); `finalized_at`/`finalized_by` NULL.

**Depois** (transação de prova com `ROLLBACK`, resíduo zero):

```
CHECKIN logs=1 | acoes=checkin_realizado | metadata_ok=true
TOTAL   logs=2 | acoes=checkin_realizado,checkout_realizado   (1 por evento)
```

Resíduo verificado após a prova: `visitas_checkin=1 / visitas_logs=2` — exatamente o
estado histórico do smoke, que **não** foi manipulado.

## E. Testes

- `src/test/security/h9gr-visit-log-canonico.static.test.ts` (9) — forward/rollback,
  fonte única de log, ausência de log redundante, ordem gate→lock→idempotência, ACL,
  não alteração das funções auditadas, finalização via RPC no frontend.
- `src/test/visita/visitaErrorMessages.test.ts` (5) — nenhum código cru na UI.
- Segurança completa: **254/254**.
- Suíte integral após a última alteração: **3.574 aprovados / 4 pulados (230 arquivos)**.
- `npx tsgo --noEmit -p tsconfig.app.json`: exit 0. `bun run build`: exit 0.
- Gate de binding final: OK (staging).

## F. Estado

- Ledger final: **680** — última migration `20261024000000_h9gr_visit_checkin_log_canonico_v1`.
- `smoke_autenticado` continua **false**; **H9 INTEGRAL = NO-GO**; promoção **NÃO AUTORIZADA**.
- Próximo passo: reteste autenticado real (perfil autorizado e perfil sem permissão,
  desktop e mobile), incluindo confirmação de `finalized_at`/`finalized_by` preenchidos.
