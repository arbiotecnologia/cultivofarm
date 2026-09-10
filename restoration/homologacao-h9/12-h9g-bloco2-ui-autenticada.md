# H9-G Bloco 2 — Smoke autenticado da UI (em andamento) e bloco 2A de correções

Ambiente único: STAGING `ikaauvsflpmamgxmkhoq` (gate de binding OK antes e depois).
Produção `navfzbwgwzruipouyfnk` e sandbox/Lovable Cloud `yzszlzjpovmcteuxjznj`: não acessados.
Ledger remoto: **682** — nenhuma migration criada neste bloco (defeitos eram exclusivamente de frontend).

## Reprodução autenticada (perfil admin, desktop e mobile)

- Visita descartável `VT-2026-0006`, id `2572bce1-203c-4237-a61a-e3eb308cc023`.
- Desfecho utilizado: **Apenas monitorar**.
- Banco confirmado: `status=finalizado`, `finalized_at`/`finalized_by` preenchidos, 1 check-in,
  1 diagnóstico, 1 log canônico de check-in (H9-GR preservada) e 1 `status_log` de finalização.
- Check-in duplicado exibiu a mensagem amigável correta (sem código técnico cru).
- A sobreposição sobre o botão Salvar foi identificada como barra do editor Lovable — **não é defeito
  do aplicativo** e nenhuma alteração foi feita por causa disso.

## Defeito 1 — contador de evidências divergente

- Sintoma: nota rápida criada; aba mostrava "Notas 1", acordeão continuava "4 · Evidências (0)".
- Causa: o título contava apenas `arquivos`, enquanto o domínio trata evidências como
  fotos + áudios + anexos + notas (as abas internas já refletem esse conceito).
- Correção mínima (frontend): `src/lib/visita/evidenciasCount.ts` com `contarEvidencias(arquivos, notas)`,
  aplicado nos dois acordeões de `src/pages/VisitaTecnica.tsx`. Contadores individuais preservados.

## Defeito 2 — ação de aprovação incompatível com "Apenas monitorar"

- Sintoma: após finalizar com "Apenas monitorar", o banner exibia "Pronta para envio à aprovação
  técnica" e o botão ativo "Liberar para Produtor", cujo clique não produzia ação nem mensagem.
- Causa: `VisitaStatusBanner` decidia texto e botão apenas por `status`, ignorando o desfecho
  (`proxima_acao_recomendada`). Sem recomendação/OS não existe artefato aprovável, então a RPC
  `rpc_liberar_recomendacao_produtor` não tinha o que liberar.
- Correção mínima (frontend, sem fluxo paralelo): `src/lib/visita/desfechoVisita.ts` como fonte única.
  - `emitir_recomendacao` e `gerar_os`: fluxo atual **preservado**, botão mantido, agora com estado de
    carregamento e feedback garantido de sucesso/erro.
  - `monitorar_area` e `programar_nova_visita`: botão **oculto**, texto coerente com o desfecho e mini
    fluxo marcado como concluído em vez de "aprovação técnica".

## Arquivos alterados

- `src/lib/visita/desfechoVisita.ts` (novo)
- `src/lib/visita/evidenciasCount.ts` (novo)
- `src/components/visita/VisitaStatusBanner.tsx`
- `src/pages/VisitaTecnica.tsx`
- `src/test/visita/desfechoVisita.test.ts` (novo)
- `src/test/visita/visitaStatusBanner.static.test.ts` (novo)
- `restoration/homologacao-h9/12-h9g-bloco2-ui-autenticada.md` (novo)

## Verificações

- Gate de binding: OK antes e depois (houve drift de `.env`/`types.ts` para o sandbox; restaurado do
  commit `4cf3e2ae` sem qualquer acesso ao ambiente proibido).
- Testes direcionados: `src/test/visita/**` + `h9gr-visit-log-canonico.static.test.ts` — 24/24.
- Typecheck e build: OK. Suíte integral não rerodada neste bloco (escopo limitado, conforme instrução).
- Nenhuma migration, RLS, RPC ou rota alterada. Nenhum e-mail, WhatsApp, fiscal ou webhook disparado.

## Veredito do bloco 2A

- Correções: **GO**.
- `smoke_autenticado`: **false** — falta o perfil autenticado **sem permissão** (desktop e mobile).
- **AUDITORIA H9 INTEGRAL: NO-GO.**
- **Promoção para produção: NÃO AUTORIZADA.**

---

# H9-G Bloco 2B — perda silenciosa de nota e timeline de edição justificada

Ambiente único: STAGING `ikaauvsflpmamgxmkhoq` (gate OK antes e depois). Produção e sandbox não acessados.
Ledger remoto: **682** — nenhuma migration criada (o motivo já é persistido em
`registros_consultor_status_log`; todos os defeitos eram de frontend).
Bloco 2A preservado integralmente.

## Defeito 3 — nota rápida descartada pela finalização

- Causa raiz: `buildPayload()` montava `observacoes_tecnicas` apenas com
  `serializeConduta(...)`. As notas rápidas, que vivem serializadas nesse mesmo campo,
  nunca entravam no payload — nem no autosave, nem no salvamento explícito, nem no
  salvamento que antecede a RPC de finalização. A nota existia somente no estado local.
- Correção: `observacoes_tecnicas` passa a ser `serializeNotes(serializeConduta(...), notes)`.
  Como o payload já é persistido ANTES de `rpc_finalizar_visita_v2` e qualquer erro de
  persistência interrompe o fluxo (`throw`), a finalização deixa de descartar dados e não
  finaliza parcialmente. Nenhum bloqueio adicional foi necessário.

## Defeito 4 — dois botões de salvar com comportamento divergente

- Causa: existiam duas implementações (`handleSaveDraft` e `handleSaveEdit`) com regras
  próprias de motivo, feedback e saída do modo edição.
- Correção: uma única função canônica `salvarCanonico()` decide o modo (rascunho, edição
  justificada, bloqueado), exige motivo, mostra sucesso/erro, sai do modo edição e revalida
  histórico/timeline. `handleSaveDraft` e `handleSaveEdit` passam a ser a mesma referência,
  usada pelo botão inferior, pelo Ctrl/Cmd+S e pelo botão "Salvar alterações" do banner.
  Clique duplo é ignorado enquanto `saveMutation.isPending`, tanto ao salvar quanto ao finalizar.

## Defeito 5 — timeline omitia o motivo da edição

- Causa: a timeline formatava apenas `status_anterior → status_novo`, descartando `motivo`.
- Correção: `src/lib/visita/statusLogTimeline.ts` como fonte única. `finalizado→finalizado`
  é rotulado "Edição justificada (Finalizado)" e exibe motivo, autor e data. O autor é
  resolvido por nome em `profiles`; UUIDs nunca são exibidos. Histórico preservado.

## Fotos / áudios / anexos

- Auditados: são inseridos em `registros_consultor_arquivos` no momento do upload, fora do
  payload da visita. O salvamento e a finalização não os tocam — não há perda nem duplicação
  de upload. Regressão estática garante que o salvamento não faz `insert` de arquivos.

## Arquivos alterados

- `src/lib/visita/statusLogTimeline.ts` (novo)
- `src/pages/VisitaTecnica.tsx`
- `src/components/visita/VisitaTimeline.tsx`
- `src/test/visita/statusLogTimeline.test.ts` (novo)
- `src/test/visita/visitaTecnicaSalvamento.static.test.ts` (novo)

## Verificações

- Gate de binding: OK antes e depois (houve drift de `.env`/`types.ts`; restaurado de `4cf3e2ae`
  sem qualquer acesso a ambiente proibido).
- Testes direcionados `src/test/visita/**`: 24/24.
- Typecheck: OK. Build: OK. Ledger permanece 682. Nenhum e-mail, WhatsApp, fiscal ou webhook.

## Veredito do bloco 2B

- Correções: **GO**.
- `smoke_autenticado`: **false** — falta o perfil autenticado **sem permissão** (desktop e mobile).
- **AUDITORIA H9 INTEGRAL: NO-GO.** **Promoção para produção: NÃO AUTORIZADA.**
