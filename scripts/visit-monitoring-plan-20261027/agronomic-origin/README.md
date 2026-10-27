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

## Decisões

1. **Aviso ≠ alerta.** `monitoramento_avisos.registro_consultor_id` continua sendo o aviso genérico do plano. `alertas_agronomicos.registro_origem_id` só é preenchido por `rpc_vincular_origem_alerta_v1`, que vincula um alerta EXISTENTE (tipo real preservado) a uma visita em `rascunho/em_andamento` da mesma fazenda e talhão compatível (alerta sem talhão casa só pela fazenda). Nenhum tipo é inventado.
2. **Criação com origem não foi aberta.** `rpc_criar_alerta_climatico_v1` (previsão climática) não tem contexto legítimo de visita; continua sem origem e inalterada. Criar alerta a partir da visita exigiria escolha explícita de tipo pelo técnico — fica como decisão de produto pendente, não implementada.
3. **Reprogramação v2** (`rpc_reprogramar_monitoramento_v2`): gate → alerta → visita → aviso; CAS obrigatório do `updated_at` do alerta (microssegundos) e da `version` da visita de origem; recibo privado idempotente; data passada (São Paulo) validada só após replay. Visita aberta: troca APENAS a linha `Próxima Avaliação:` do bloco (demais bytes preservados), `data_proxima_visita`, `version+1`, data do aviso, via ticket existente `visit_plan_write_tickets` — o guard não foi retirado nem afrouxado. Visita sem plano: só a data. **Visita finalizada/somente leitura: visita intocada, apenas o alerta muda (`visita_atualizada:false`).** Revisor deve confirmar essa escolha.
4. **Callers antigos:** v1 recebe um único `RAISE PT428` antes de qualquer escrita quando há origem (CREATE OR REPLACE mantém OID/owner/ACL); sem origem, comportamento idêntico. Cliente novo nunca recorre a v1 ou escrita direta para alerta com origem.
5. **Espera limitada:** `SET lock_timeout='3s'` nas funções; sem espera global longa.

## Ordem gate × revogação (prova determinística, duas conexões)

- **Ordem 1** — revogação pega o gate primeiro (trigger sintético idêntico a `acquire_gate`), operação espera no gate; revogação faz commit → operação relê e falha `42501`, sem escrita.
- **Ordem 2** — operação pega o gate e espera na linha do alerta (terceira sessão); revogação fica na fila do gate; liberada a linha, a **operação confirma primeiro** e só depois a revogação conclui. Aqui a revogação NÃO venceu: a operação foi serializada antes dela, com autoridade válida naquele ponto. Pedidos posteriores falham `42501`.
- Espera no gate acima do limite → `55P03` em ~3 s.

## Arquivos

- `candidate.sql.review` — PRE (hashes, gate/guard, ausência) + DDL + POST ACL em uma transação.
- `rollback-containment.sql.review` — só revoga EXECUTE dos novos pontos; mantém guard, recibos, logs e o patch PT428 (restaurar v1 antigo reabriria escrita bloqueada).
- `preflight.sql` / `postflight.sql` — somente leitura.
- `test-local.py` — PostgreSQL descartável, Auth sintética, 55 checks (`src/test/monitoramento/agronomicOriginPostgres.test.ts`).

## Cliente (local, não publicado)

- `useReprogramarMonitoramento`: alerta com origem → v2 com envelope integral de 9 campos; sem origem → v1 inalterado; PT428/v2 ausente → mensagem segura, sem fallback. `MonitoramentoAlertas` lê a versão da visita pelo `rpc_get_visita_workspace` ao abrir, mantém chave em resultado incerto e descarta em rejeição.
- `useOrigemAlertaAgronomico` + `OrigemAlertaAgronomico` no cartão existente do plano: lista do servidor, confirmação com Cancelar, oculto em visita bloqueada; RPC ausente → "indisponível", sem caminho alternativo.
- Testes: `origemAlertaAgronomico.test.tsx`; suíte monitoramento+autosave 156/156. Falhas preexistentes em `etapasVisita`, `pdfVisitaAuthenticated`, `visitaTecnicaSalvamento.static` não referenciam arquivos alterados.

## Ensaio real limitado (para o auditor, após instalação independente)

1. Janela curta, gate livre: rodar `preflight.sql`; abortar se divergir.
2. Aplicar `candidate.sql.review` (timeouts 5 s/20 s); rodar `postflight.sql`, registrar hashes novos.
3. Sessão JWT A (gestor) e B (gestor outra empresa), visita fictícia A em `rascunho` com plano e um alerta fictício A existente da mesma fazenda/talhão:
   - A vincula (200); B lista/vincula/reprograma A → 404; talhão diferente → 22023; CAS alterado em 1 µs → 409.
   - A reprograma via v2: conferir texto do plano igual exceto a linha de data, `version+1`, aviso e alerta na mesma data, 1 log, 1 recibo; repetir mesma chave → resposta idêntica.
   - Aba antiga (v1) com alerta de origem → mensagem segura, nada escrito.
   - Visita finalizada: visita intocada.
4. Revogação: NÃO segurar o gate de produção artificialmente. Validar só ordem 1 natural (revogar papel de A fictício e então tentar → 42501). A ordem 2 fica provada apenas no ensaio descartável.
5. Qualquer falha: `rollback-containment.sql.review`.

Pendências: instalação/ensaio JWT real, decisão sobre visitas finalizadas e criação com origem, contabilidade real, SU-518022, reparo do plano A autorizado pelo auditor.
