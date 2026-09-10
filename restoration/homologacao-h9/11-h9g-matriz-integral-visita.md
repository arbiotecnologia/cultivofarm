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

---

## Bloco 2F — Ações read-only indevidas e consistência multiportal

Base: commit `8d02ba6b`; binding staging `ikaauvsflpmamgxmkhoq` restaurado (havia drift local para o
sandbox proibido; o sandbox não foi consultado). Sem migration — todas as falhas são de frontend/sessão.

### 1. "Salvar" ativo em visita finalizada / usuário somente leitura

Reprodução: VT-2026-0006 (`2572bce1-…`), finalizada.
`tecnico_agronomo@arbio.com` (read no cliente, não participante) via os campos travados, mas o botão
"Salvar" continuava ativo e o clique era no-op silencioso. `gestor@arbio.com` também via "Salvar"
ativo antes de entrar na edição justificada.

Causa: os três botões de salvar e o "Finalizar" da barra inferior dependiam apenas de
`saveMutation.isPending`; `isReadOnly` não era aplicado a eles.

Correção: nova fonte canônica `src/lib/visita/acoesPersistencia.ts`
(`resolveVisitaAcoes` → `readOnly | canPersist | showSave | showFinalize`), consumida por
`src/pages/VisitaTecnica.tsx`. Fora do modo de edição, ou sem permissão efetiva, as ações de
persistência deixam de ser renderizadas; status pós-aprovação permanecem travados mesmo em edição.
Rascunho/visita nova e o salvamento canônico do 2B seguem intactos (loading, sucesso/erro,
prevenção de clique duplo).

### 2. Cabeçalho técnico ignorava o contexto ativo

`fagner@arbio.com` (consultor_tecnico + parceiro_b2b) no Portal Técnico via "Gestor B2B" e apenas "Sair".
Causa: `UserMenu` derivava o rótulo de `role` (primaryRole fixo) e só mostrava "Trocar de portal"
quando o layout passava a prop — o cabeçalho de campo/visita não passava.

Correção: `src/components/UserMenu.tsx` passou a ler o contexto ativo canônico
(`readActiveContext` do 2E) e a compor o rótulo com `getPortalDisplayLabel`; oferece "Trocar de portal"
sempre que `get_my_available_portal_contexts` retornar ≥ 2 contextos, usando `useSwitchPortal`
(sem logout). Como todas as variantes de cabeçalho usam `PortalTopBar → UserMenu`, não há duplicação.
Portal B2B mantém rótulo e menu atuais. Permissões e RLS inalteradas.

### 3. Logout técnico "herdava" o portal no novo login

Causa real: `src/pages/app/MobileLogin.tsx` redirecionava para `/app` assim que houvesse sessão,
ignorando o seletor. O `signOut` canônico de `useAuth` já limpava o contexto efêmero.

Correção: o login de campo agora envia para `/selecionar-portal`, que decide sozinho — contexto único
ou preferência "Entrar diretamente neste portal" abrem direto; multipapel com remember=false volta a
ver o seletor. Troca de usuário continua limpando o contexto (2E).

### Provas

- `src/test/visita/acoesPersistencia.test.ts` (9) — leitor, gestor fora/dentro da edição, rascunho,
  status travados e uso da fonte canônica na página.
- `src/test/visita/cabecalhoContexto.static.test.ts` (7) — rótulo por contexto, trocar de portal,
  ausência de duplicação entre cabeçalhos, logout limpa contexto, login passa pelo seletor.
- Suíte de visita: 82/82. Regressões multiportal/mobile: 21/21. Typecheck e build verdes.
- Binding conferido antes e depois: `ikaauvsflpmamgxmkhoq`. Nenhuma migration criada; nenhum evento externo.
  A contagem remota do ledger (682) não foi reconsultada nesta rodada: a ferramenta gerenciada de SQL
  aponta para o sandbox proibido; fail-closed, nada foi executado contra o banco.

### Veredito do bloco

- Correções: **GO técnico**. `smoke_autenticado` permanece **false**.
- **H9 integral e promoção: NO-GO** até o reteste real por perfil (técnico read-only, gestor,
  multipapel técnico/B2B, logout/novo login) em desktop e mobile.

---

## H9-G BLOCO 2G — FECHAMENTO DO SMOKE AUTENTICADO

HEAD auditado: `da776d991457ee912733a7f6c384c69766ca52f4`.
Binding conferido antes e depois: `H9F BINDING GATE: OK — staging ikaauvsflpmamgxmkhoq`.
Desvio local do `.env`/`types.ts` para o sandbox foi detectado e restaurado a partir de `4cf3e2ae`
(21.850 linhas de contrato). Nenhum acesso a sandbox ou produção.

### 1. Auditoria do diff 2A–2F
`git diff --stat 1bf55b05..HEAD`: 29 arquivos, +1934/-111. Zero arquivos em
`supabase/migrations/`, zero `.sql`, zero `supabase/functions/`. Alterações exclusivamente de
frontend (guards, hooks, libs de visita/navegação), testes e dossiês. Nenhum segredo, DSN ou
binding proibido introduzido — comprovado pelo gate estático.

### 2. Suíte integral (execução única final)
```
Test Files  240 passed | 1 skipped (241)
     Tests  3651 passed | 4 skipped (3655)
  Duration  105.33s
```
Zero falhas. Nenhum snapshot atualizado, nenhum teste mascarado.

### 3. Direcionados / typecheck / build
- `src/test/visita` + multiportal + mobile: **18 arquivos / 158 testes aprovados**.
- `npx tsgo --noEmit -p tsconfig.app.json`: `TS_OK`.
- `npx vite build`: `built in 32.26s`, PWA v1.2.0, 20 entradas de precache.

### 4. Banco
Prova independente fornecida pelo operador: `ledger_count=682`, `latest_version=20261026000000`.
Nenhuma migration no 2F nem no 2G. Nenhuma ferramenta SQL gerenciada foi usada — a disponível
aponta para o sandbox proibido (fail-closed).

### 5. Resíduo de fixtures H9-G
Harness canônico `h9g-provas/h9g-matriz-integral-visita.py`, último resultado registrado:
`total=68, pass=68, fail=0`, com cleanup H9GM concluído e resíduo zero. Os blocos 2B–2G não
criaram novas fixtures (nenhuma escrita em banco), portanto o resíduo permanece zero. O histórico
legítimo da visita descartável VT-2026-0006 foi preservado integralmente.

### 6. Matriz autenticada por perfil (smoke real do operador)

| Perfil | Resultado |
|---|---|
| Administrador | CRUD integral da visita desktop/mobile: criação, identificação, check-in, duplicidade amigável, diagnóstico, severidade/percentuais, evidências/nota, quatro desfechos, aviso sem foto, finalização, reabertura justificada e timeline — OK |
| Produtor (`cliente_produtor`) | Rota interna negada desktop/mobile; Voltar → `/app` — OK |
| Consultor Técnico | Leitura permitida; sem Editar — OK |
| Administrativo | Leitura permitida; sem Editar — OK |
| Aplicador | Rota interna negada; Voltar → `/app` — OK |
| Operador OnFarm | Rota negada; cockpit preservado — OK |
| Produção | Rota interna negada — OK |
| Parceiro B2B | Rota interna negada — OK |
| Parceiro B2B Técnico | Rota interna negada — OK |
| Financeiro | Login OK; visita → tela neutra "Acesso não autorizado" sem dados; Voltar → Dashboard Financeiro; logout OK |
| Técnico Agrônomo | Login OK; leitura permitida (`has_active_user_cliente_access=true`, `is_active_visit_participant=false`); após 2F **nenhum** botão Editar/Salvar/Finalizar; conteúdo read-only |
| Gestor | Fora de edição: "Editar visita" visível, Salvar/Finalizar ausentes; Editar exigiu motivo mínimo; após reabrir, Salvar apareceu e funcionou, saiu da edição e voltou a ocultar Salvar; banco confirmou `registros_consultor_status_log` finalizado→finalizado com motivo exato, `changed_by` e `changed_at` |
| Gestor Comercial | Acesso negado neutro sem dados; Voltar → "Comercial B2B Consolidado"; logout OK |
| Multipapel `fagner` | Login sem preferência abriu o seletor; Portal Técnico → `/app` AR Bio Campo e visita direta OK; reload preservou contexto; menu exibiu "Consultor Técnico" e "Trocar de portal"; troca sem logout; com Portal B2B ativo a visita foi negada sem vazamento; Sair encerrou sessão; novo login com `remember=false` voltou ao seletor sem herdar contexto |

Quatro perfis de teste (financeiro, tecnico_agronomo, gestor, comercial) tiveram senha de teste
redefinida em staging antes do smoke; as credenciais não são registradas neste dossiê.

### 7. Arquivos e blocos 2A–2F
- 2A: `src/lib/visita/evidenciasCount.ts`, `src/lib/visita/desfechoVisita.ts`,
  `VisitaStatusBanner.tsx`, `VisitaTecnica.tsx`.
- 2B: `src/lib/visita/statusLogTimeline.ts`, `VisitaTimeline.tsx`, `VisitaTecnica.tsx`
  (salvamento canônico + persistência antes da finalização).
- 2C: `src/lib/visita/visitaRouteAccess.ts`, `src/components/guards/VisitaRouteGuard.tsx`, `src/App.tsx`.
- 2D: `src/lib/navigation/safeHome.ts`, `src/pages/SemPermissao.tsx`.
- 2E: `src/lib/navigation/portalRoleContext.ts`, `RoleGuard`/`App.tsx`, `useAuth.tsx`.
- 2F: `src/lib/visita/acoesPersistencia.ts`, `UserMenu.tsx`, `MobileLogin.tsx`.
- Testes: `src/test/visita/*` (10 arquivos novos no período).

### 8. Riscos residuais
- 59 migrations repo-only continuam em quarentena (`BLOQUEADA_PERMANENTE`), fora do pacote de promoção.
- Ferramenta SQL gerenciada do ambiente aponta para o sandbox; toda verificação de banco depende
  de prova externa/DSN de staging. Risco operacional recorrente de drift de `.env`/`types.ts`,
  mitigado pelo gate de binding integrado à suíte.
- Produção nunca foi acessada nem comparada; a paridade prod↔staging permanece não verificada e
  é escopo do preflight.

### 9. Veredito
- `smoke_autenticado` = **true**.
- H9-G: **GO**.
- AUDITORIA H9 INTEGRAL: **GO PARA PREFLIGHT DE PROMOÇÃO** (não é promoção executada).
- Produção `navfzbwgwzruipouyfnk`: **NÃO AUTORIZADA** neste bloco.
