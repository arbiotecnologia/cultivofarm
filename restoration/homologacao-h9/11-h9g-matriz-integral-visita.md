# H9-G Bloco 1 — Matriz integral de contrato da funcionalidade de Visita

Ambiente único: STAGING `ikaauvsflpmamgxmkhoq` (gate de binding OK antes e depois).
Produção `navfzbwgwzruipouyfnk` e sandbox/Lovable Cloud `yzszlzjpovmcteuxjznj`: não acessados.

- Ledger remoto final: **682**
- Últimas migrations (ocorrência única): `20261024000000`, `20261025000000`, `20261026000000`
- Nenhuma nova migration criada neste bloco.
- Suíte integral **3.574 aprovados / 4 pulados** é da fase **H9-GR**; não foi rerodada aqui porque nenhum código de aplicação mudou neste bloco (só o harness de prova e o dossiê).

## Artefatos

- Harness: `restoration/homologacao-h9/h9g-provas/h9g-matriz-integral-visita.py`
- Log completo da execução: `restoration/homologacao-h9/h9g-provas/h9g-matriz-integral-execucao.log`
- Resultado estruturado: `restoration/homologacao-h9/h9g-provas/h9g-matriz-integral-resultado.json`

## Resultado — 68 casos, 68 PASS, 0 FAIL

| Grupo | Casos | PASS | FAIL |
| --- | --- | --- | --- |
| 1 Listagem | 6 | 6 | 0 |
| 2 Criação | 6 | 6 | 0 |
| 3 Edição | 5 | 5 | 0 |
| 4 Check-in | 8 | 8 | 0 |
| 4 Checkout | 4 | 4 | 0 |
| 5 Diagnóstico | 6 | 6 | 0 |
| 6 Evidências | 6 | 6 | 0 |
| 7 Desfechos | 6 | 6 | 0 |
| 8 Finalização | 7 | 7 | 0 |
| 9 Auditoria | 4 | 4 | 0 |
| 10 Autorização | 7 | 7 | 0 |
| 13 Integrações | 2 | 2 | 0 |
| 14 Limpeza | 1 | 1 | 0 |
| **Total** | **68** | **68** | **0** |

Grupos **11 (desktop/mobile)** e **12 (estados de UX)** não são cobertos por harness de banco: dependem de sessão autenticada real na interface. Ficam para o **H9-G bloco 2**.

## Validação específica das correções forward-only

- `20261025000000_h9g_retorno_tecnico_duracao_estimada_v1` e
  `20261026000000_h9g_retorno_tecnico_tipo_demanda_v1`:
  caso **V7.2** (agendar retorno) passa sem erro e caso **V7.2b** inspeciona o retorno gerado,
  comprovando `duracao_estimada=120` na solicitação e `tipo_demanda` herdado da visita de origem
  (fallback `outro`), com `tipo_visita=retorno`.
- H9-GR preservada: caso **V9.4** comprova log canônico único por operação/`checkin_id`.

## Integrações externas

- `comunicacao_outbox=0`, `comunicacao_inapp_dispatch=0`, `comunicacao_provider_receipts=0` na janela da execução.
- Eventos internos publicados por gatilho têm `outbox_enqueued=0` (`enfileirados=0`): nenhum e-mail, WhatsApp, webhook ou agenda externa emitido.
- `fiscal_xml_runs` sem execução na janela.

## Perfis e fixtures

- ADMIN `b5c2ebd4-7cdf-4647-a585-6ec49f1b583a`
- TÉCNICO autorizado `77905960-8e07-4214-b1c9-516a381fcd28`
- TÉCNICO sem escopo `2767fb15-7f00-41d5-8360-622d6dea8de6`
- PRODUTOR `85998744-78fd-41ae-b74e-2b763e7f8089`
- Cliente `9f00e001-…0001`, fazenda `9f00e002-…0001`, talhão `9f00e003-…0001`, vínculo `9f00e004-…0001`, tag `H9GM`

## Limpeza

`session_replication_role = replica` é usado **apenas** com `SET LOCAL`, dentro da transação curta de limpeza
(necessário porque visitas finalizadas têm gatilhos de imutabilidade), e volta a `origin` no COMMIT.

Prova final da execução:

```
apagados_filhos=18
residuo_registros=0 residuo_vinculo=0 residuo_solicitacoes=0 residuo_cliente=0
residuo_fazenda=0 residuo_talhao=0 residuo_logs=297 residuo_eventos=0 repl_role=origin
```

- `residuo_logs=297` é métrica auxiliar global de logs órfãos **pré-existentes**; nenhum deles é H9GM
  (`orfaos_h9gm=0` verificado em consulta independente).
- `eventos_recentes=0` após a limpeza.
- Nenhum histórico legítimo foi apagado ou alterado.

## Verificações do bloco

- Gate de binding: OK no início e no fim.
- Typecheck: OK.
- Testes direcionados: `h9gr-visit-log-canonico.static.test.ts` + `visitaErrorMessages.test.ts` — 14/14.

## Veredito

- Contrato de banco/RPC da funcionalidade de visita: **GO técnico**.
- `smoke_autenticado` permanece **false**.
- **AUDITORIA H9 INTEGRAL: NO-GO** — falta o smoke autenticado de interface (desktop e mobile) e o
  segundo perfil sem permissão exercido pela UI.
- **Promoção para produção: NÃO AUTORIZADA.**

## Próximo passo (H9-G bloco 2)

Requer login manual no preview: entrar primeiro com o perfil autorizado (`admin@arbio.com`) e avisar
quando o login estiver concluído, para executar o fluxo real de visita em desktop e mobile.
