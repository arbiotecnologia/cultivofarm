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
