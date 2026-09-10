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

---

# H9-G Bloco 2C — Estado infinito em rota de visita para perfil sem permissão

Base: commit `773770a36c2708a7398af64b0a797775512ec9a6`; ledger 682; STAGING `ikaauvsflpmamgxmkhoq`.
Nenhuma migration criada; RLS, RPCs e contratos de servidor intocados. Blocos 2A e 2B preservados.

## Reprodução

- Usuário `produtor@arbio.com` (`cliente_produtor`, id `85998744-78fd-41ae-b74e-2b763e7f8089`).
- Acesso direto a `/visita-tecnica/2572bce1-203c-4237-a61a-e3eb308cc023` (desktop e mobile).
- RLS não expôs o registro, mas a UI ficava >10 s em "Carregando...", sem negar acesso nem voltar.

## Causa

As três rotas internas (`/visita-tecnica`, `/visita-tecnica/nova`, `/visita-tecnica/:id`) estavam
dentro do grupo `ProtectedRoutes` → `AppLayout`. A decisão de autorização só ocorria depois de
montar o layout interno e encadear redirecionamentos dependentes de carregamentos assíncronos
(`usePortalCliente`, dashboards do portal), o que permitia um estado de carregamento sem prazo
máximo. Não havia um estado distinto para "sem permissão", "não encontrado" e "erro".

## Correção (mínima, apenas frontend)

- `src/lib/visita/visitaRouteAccess.ts` (novo): decisão pura e fail-closed com cinco estados
  (`carregando`, `erro`, `nao_autenticado`, `negado`, `permitido`) e prazo máximo de 8 s.
  A decisão não depende do UUID solicitado — id existente e inexistente são indistinguíveis.
- `src/components/guards/VisitaRouteGuard.tsx` (novo): aplica a decisão ANTES de qualquer layout
  interno ou consulta. Anônimo → `/auth`; autenticado sem permissão → `/sem-permissao` (tela
  neutra com ação de voltar); falha ou prazo esgotado → tela neutra com "Tentar novamente" e
  "Voltar". Nunca renderiza conteúdo antes da decisão (sem flash) e não expõe nomes ou IDs.
- `src/App.tsx`: as três rotas passam a um grupo próprio `VisitaRouteGuard > ProtectedRoutes`,
  preservando `RoleGuard`, layout e comportamento de admin/técnico autorizado.

## Testes

- `src/test/visita/visitaRouteAccess.test.ts` (10): carregando, prazo esgotado, erro, anônimo,
  produtor, financeiro, sem papel, admin/consultor/técnico/gestor, multipapel.
- `src/test/visita/visitaRouteGuard.test.tsx` (9): produtor desktop e mobile, financeiro, anônimo,
  UUID existente vs. inexistente com marcação idêntica, erro de rede, ausência de flash e prazo
  esgotado, admin e consultor autorizados.
- Suíte `src/test/visita/**`: 43/43.

## Verificações

- Gate de binding: houve drift de `.env`/`types.ts` para o sandbox; restaurados de `4cf3e2ae`
  (`ikaauvsflpmamgxmkhoq`, 21.850 linhas) sem acessar produção ou sandbox.
- Typecheck OK; build OK; ledger permanece 682; nenhum evento externo disparado.

## Veredito do bloco 2C

- Correção: **GO técnico**.
- `smoke_autenticado`: **false** — exige reteste real com `produtor@arbio.com` em desktop e mobile.
- **AUDITORIA H9 INTEGRAL: NO-GO.** **Promoção para produção: NÃO AUTORIZADA.**

## Bloco 2D — Destino do botão "Voltar" após acesso negado

Reprodução (produtor@arbio.com, desktop): tela neutra "Acesso não autorizado" correta,
porém "Voltar" levava a `/acesso-pendente`, embora a sessão tenha portal ativo.

Causa: `SemPermissao.goHome` decidia apenas por `available_contexts` da RPC de portais.
Para `cliente_produtor` a lista vem vazia (não é contexto B2B/técnico), caindo no ramo
`/acesso-pendente`. O guard de visita usava `getHomeForRole(role)` sem considerar multipapel.

Correção (frontend-only, sem migration):
- novo resolvedor canônico `src/lib/navigation/safeHome.ts` (`resolveSafeHome`, `getEffectiveRole`):
  anônimo → `/auth`; papéis administrativos → home própria; ≥2 contextos → `/selecionar-portal`;
  contexto único B2B → `/portal-parceiro/dashboard`; `cliente_produtor` → `/app`;
  demais papéis → `getHomeForRole`; `/acesso-pendente` somente sem papel algum;
- `src/pages/SemPermissao.tsx` e `src/components/guards/VisitaRouteGuard.tsx` passam a usar o resolvedor;
- nenhum uso de histórico do navegador — impossível voltar à rota negada;
- bloqueio neutro e ausência de flash do Bloco 2C preservados; 2A/2B intactos.

Provas: `src/test/visita/safeHome.test.ts` (produtor, financeiro, admin, multipapel,
anônimo, contexto único B2B, sem papel, ausência de loop `/sem-permissao`↔`/acesso-pendente`).
Suíte de visita 53/53, typecheck e build verdes. Ledger permanece 682; binding staging
`ikaauvsflpmamgxmkhoq` restaurado após drift local. `smoke_autenticado=false` até reteste real.
H9 integral e promoção: NO-GO.
