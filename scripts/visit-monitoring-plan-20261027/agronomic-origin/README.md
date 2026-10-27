# Origem agronômica e reprogramação conciliada — pacote INATIVO

Base: `7c38bc48`. Nada foi aplicado em produção nem publicado. Nenhum dado A/B, fixture hosted, contabilidade ou SU-518022 foi tocado.

## Captura LIVE somente leitura (ref `swzpzcwiasxmjutrmvkm`, 2026-10-27 ~12:06 UTC)

| Objeto | MD5 | ACL |
|---|---|---|
| `rpc_reprogramar_monitoramento_v1(uuid,date,timestamptz)` | `b32bf163ed7ccb989f4f0b653827d825` | postgres, authenticated, service_role |
| `rpc_criar_alerta_climatico_v1(...)` | `b675f863360f50d58cd5358451284eff` | idem |
| `platform_private.guard_visit_plan_preservation()` | `618797b75f8c6b962dc70c0841c84de1` | postgres |
| `platform_private.save_visit_monitoring_plan_core(...)` | `a7817ac54fd40701d97ceb9a57976a57` (pós-preservação) | postgres, service_role, authenticated |
| `rpc_salvar_plano_monitoramento_visita_v1` | `758544bc361cc7dc5631e07e688fc207` | postgres, authenticated, service_role |
| `_visita_lock_and_check` | `e3bc4bd9d38f1fb4b659b9e1384c770a` | postgres, service_role |
| `can_manage_technical_visit` | `d95c2c2b34af117d467d7d4b2b775002` | + authenticated |
| `monitoring_refs_in_actor_tenant` | `914283d3f4dee931679ef140ae84b498` | + authenticated |
| `technical_actor_ready` | `b5d0994b6eb976b14122cd2a1ec798cf` | + authenticated |
| `enforce_visit_immutability` | `8a6a92bb748f745526ed163ec52464aa` | postgres, service_role |
| `rpc_atualizar_status_alerta_agronomico_v1` | `f2769829ce82c765326079a498eed0f7` | não alterada |

Triggers: `user_roles` e `profiles` têm `a00_cf_user_gate -> cf_user_guards_v1.acquire_gate` (revogação usa o MESMO gate); `registros_consultor.trg_visit_plan_preservation` ativo. Políticas de `alertas_agronomicos`: SELECT autenticado, insert/update escopados, `monitoring_tenant_boundary`. O executor deve repetir `preflight.sql` e abortar em qualquer divergência.

## Contrato de datas (revisão de 533d329)

- **Uma visita, no máximo um alerta aberto de origem.** A data desse alerta é a data do plano/visita/aviso. Segundo vínculo → `PT409 visit_already_has_origin_alert`. Dado legado com 2+ alertas na mesma visita → reprogramação `PT409 multiple_alerts_share_visit`, atômica; nenhum outro alerta é reclassificado ou alterado.
- **Vínculo não cria divergência:** visita com `data_proxima_visita` exige alerta com a mesma data (`22023 origin_date_mismatch`); plano sem data → `PT409`.
- **Reprogramação com plano exige exatamente 1 aviso `plano_monitoramento` coerente** (data = visita = linha do bloco). 0, 2 ou divergente → `PT409 plan_notice_incoherent`, sem fabricar aviso. Visita sem plano com aviso de plano → mesmo erro.
- **Editor do plano (`save_visit_monitoring_plan_core`, patch fail-closed por needle único, mantém OID/ACL):** com alerta aberto vinculado, mudar data → `PT409 linked_alert_date_requires_reschedule`; editar itens/gatilhos na mesma data segue permitido. Fluxo único de data = reprogramação do alerta.
- **Visita finalizada:** `modo:"somente_alerta"`, `visita_atualizada:false`; visita/plano/aviso NÃO são sincronizados, e a UI diz isso.
- Envelope v2: 10 chaves com `modo` ∈ `plano_visita_aviso_alerta | visita_alerta | somente_alerta`.
- Outros escritores auditados: `rpc_ativar_monitoramento_visita` não muda data; `rpc_atualizar_status_alerta_agronomico_v1` só status; v1 com origem → PT428; criação climática sem origem; autosave legado barrado pelo guard.
- Criação de alerta com origem continua não aberta (exige escolha explícita de tipo).
- Espera limitada: `SET lock_timeout='3s'` nas novas funções.

## Ordem gate × revogação (somente PostgreSQL descartável)

Duas conexões, esperas confirmadas em `pg_stat_activity`:
- **Ordem 1:** revogação segura o gate; operação aguarda o lock; revogação confirma → operação relê e falha `42501`, sem escrita.
- **Ordem 2:** operação segura o gate e aguarda a linha do alerta; revogação na fila do gate; a **operação confirma primeiro** — a revogação NÃO venceu. Pedidos posteriores → `42501`.
- Gate preso além do limite → `55P03` em ~3 s.

Provas sintéticas (Auth/schema reduzidos), não homologação.

## Arquivos

- `candidate.sql.review` — PRE (hashes, gate/guard, ausência) + DDL + POST ACL em uma transação.
- `rollback-containment.sql.review` — só revoga EXECUTE dos novos pontos; mantém guard, recibos, logs e o patch PT428 (restaurar v1 antigo reabriria escrita bloqueada).
- `preflight.sql` / `postflight.sql` — somente leitura.
- `test-local.py` — PostgreSQL descartável, Auth sintética, 73 checks (sintéticos, NÃO homologação) (`src/test/monitoramento/agronomicOriginPostgres.test.ts`).

## Cliente (local, não publicado)

- `useReprogramarMonitoramento`: alerta com origem → v2 com envelope integral de 9 campos; sem origem → v1 inalterado; PT428/v2 ausente → mensagem segura, sem fallback. `MonitoramentoAlertas` lê a versão da visita pelo `rpc_get_visita_workspace` ao abrir, mantém chave em resultado incerto e descarta em rejeição.
- `useOrigemAlertaAgronomico` + `OrigemAlertaAgronomico` no cartão existente do plano: lista do servidor, confirmação com Cancelar, oculto em visita bloqueada; RPC ausente → "indisponível", sem caminho alternativo.
- Testes: monitoramento+autosave+preservação 167/167 em 11 arquivos.
- `etapasVisita`, `pdfVisitaAuthenticated`, `visitaTecnicaSalvamento.static`: rodados também sobre `git archive 7c38bc48` — as mesmas 7 falhas (7 failed/28 passed) na base e no candidato; preexistentes.

## Ensaio real limitado (para o auditor, após instalação independente)

1. Janela curta, gate livre: rodar `preflight.sql`; abortar se divergir.
2. Aplicar `candidate.sql.review` (timeouts 5 s/20 s); rodar `postflight.sql`, registrar hashes novos.
3. Sessão JWT A (gestor) e B (gestor outra empresa), visita fictícia A em `rascunho` com plano e um alerta fictício A existente da mesma fazenda/talhão:
   - Alerta com data diferente → 22023; reprogramar o alerta para a data do plano; A vincula (200); segundo alerta na mesma visita → 409; mudar data pelo editor do plano → 409; B lista/vincula/reprograma A → 404; talhão diferente → 22023; CAS alterado em 1 µs → 409.
   - A reprograma via v2: conferir texto do plano igual exceto a linha de data, `version+1`, aviso e alerta na mesma data, 1 log, 1 recibo; repetir mesma chave → resposta idêntica.
   - Aba antiga (v1) com alerta de origem → mensagem segura, nada escrito.
   - Visita finalizada: visita intocada.
4. Revogação: não segurar o gate de produção. Revogar e depois tentar → 42501 só confirma negação pós-revogação; **NÃO comprova operação real aguardando lock**. As ordens de espera ficam provadas apenas no ensaio descartável.
5. Qualquer falha: `rollback-containment.sql.review`.

Fixtures atuais (relato do auditor; não recriar): visita A reparada v5; fixture B `126e3203-a381-4440-8e8b-a34d64241b38` v2, aviso `154f779f-5507-40d1-bd37-a760ea251749`. Antes do ensaio, conferir 1 aviso coerente em cada.

Pendências: instalação/ensaio JWT real, decisão sobre visitas finalizadas e criação com origem, contabilidade real, SU-518022, reparo do plano A autorizado pelo auditor.
