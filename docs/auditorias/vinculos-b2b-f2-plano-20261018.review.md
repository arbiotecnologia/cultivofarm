# Fase F2 (Guards) — Desenho e checklist revisável — 2026-10-18 (SOMENTE DESENHO, NADA APLICADO)

Ref canônico: `swzpzcwiasxmjutrmvkm` (produção, intocada). Homolog: `vrlcdwmlytukrjezrrnf`.
**Este arquivo é apenas desenho/checklist. Nenhum SQL de F2 foi escrito para execução,
nenhuma alteração em produção ou homolog neste turno, nada publicado.**

## 0.1 ATUALIZAÇÃO 2026-10-18 — F1 APLICADA EM PRODUÇÃO (revisão read-only de F2)

**Fatos confirmados read-only por este agente em produção** (relatório completo: `vinculos-b2b-f1-pos-implantacao-prod-20261018.review.md`): migration `cultivofarm_f1_partner_users_additive_production_20261018` aplicada pelo auditor externo; 2 vínculos preservados, 1 com `tenant_id NULL` (parceiro sintético AUDIT-CF, owner NULL), 0 divergências, 0 revogados, version 1–2, 5 triggers, checks e `UNIQUE(user_id)` preservados. **B1 está RESOLVIDO.** Permanecem NO-GO: B2, B3, B4, B5.

### Revisão read-only de F2 sobre produção (nada aplicado)

**Foco 1 — Parceiro legado sem tenant (P1/B4).** O vínculo sem tenant pertence ao parceiro sintético AUDIT-CF (`commercial_owner_organization_id` NULL). **Não atribuir tenant sem prova e não cortar acesso real por suposição.** Fluxo de regularização proposto (decisão do proprietário, com trilha auditável):
1. Confirmar a natureza do parceiro AUDIT-CF (sintético de auditoria × operacional).
2. Se sintético/obsoleto: **arquivar** — revogar o vínculo via RPC de revogação da F2 (`revoked_at/revoked_by/revoke_reason`, bump `version`, auditoria), sem apagar histórico.
3. Se operacional: **regularizar** — definir `commercial_owner_organization_id` do parceiro + backfill do `tenant_id` do vínculo em transação única auditada.
4. Em ambos os caminhos, registrar ata (quem, quando, motivo, uuid mascarado).

**Foco 2 — Helpers escalares `LIMIT 1`.** `get_user_partner_id()` e `get_partner_papel()` retornam 1 parceiro sem ordenação nem filtro de tenant. Com `UNIQUE(user_id)` vigente isso é deterministicamente seguro hoje (no máximo 1 vínculo por usuário), mas: (a) não filtram `revoked_at`/`tenant_id` — vínculo revogado ou sem tenant pode continuar autorizando; (b) qualquer evolução futura torna o `LIMIT 1` ambíguo. F2 deve: exigir vínculo **ativo** (`revoked_at IS NULL`) e, após decisão do item 2 da seção 2, `tenant_id IS NOT NULL`; criar variantes contextuais (`p_partner_id` explícito) antes de qualquer cutover.

**Foco 3 — Política de isolamento.** As 29 policies dependentes dos helpers (inventário F0) herdam automaticamente a correção dos helpers — mas devem ser revalidadas par a par no teste A/B (tenant A × B, parceiro A × B, produtor, técnico, interno). Nenhuma policy será reescrita em F2 sem evidência do teste A/B.

**Foco 4 — Prevenção de novos vínculos sem owner.** Gate da seção 2 (INSERT fail-closed `partner_without_tenant`, UPDATE `tenant_removal_forbidden`) passa a ser o **primeiro item executável de F2**, pois fecha a única via de criação de novos vínculos "sem território" enquanto P1 não é regularizado.

**Policies/RPCs afetadas em F2 (mapa revisável):**
- Funções: `get_user_partner_id()`, `get_partner_papel()` (correção fail-closed), `partner_users_derive_tenant()` (gate de tenant), novas RPCs de criar/revogar/regularizar vínculo.
- Policies: as 29 que chamam os helpers (sem reescrita individual — herdam a correção; validação via A/B).
- Áreas a revalidar pós-F2: pedidos B2B (`partner_orders*`), financeiro (`partner_financial_settings`, recebíveis), storage (F0: sem referência direta a `partner_users` — revalidar), fiscal (mock, sem ações externas).

**Gates para abrir execução de F2 (todos obrigatórios):** B2 (paridade de guards em homolog — depende do bootstrap C0–C2), B3 (RLS A/B com sessões reais), B4 (P1 regularizado ou arquivado com ata), B5 (gate de tenant aprovado), autorização expressa do proprietário.

**Prompt SQL revisável por fases (a gerar somente após gates):**
- **F2-a:** gate de tenant no trigger de derivação (INSERT/UPDATE fail-closed) + testes transacionais.
- **F2-b:** helpers fail-closed (ativo + tenant) + variantes contextuais + testes.
- **F2-c:** RPCs de gestão de vínculo (criar/revogar/regularizar) + histórico append-only com RLS fechada.
- **F2-d:** invalidação imediata pós-revogação + alinhamento de cache (lease 15s).
Cada fase com rollback próprio, revisão independente e aplicação primeiro em homolog.

## 0. Estado de entrada (fatos hospedados em homolog, reportados pelo auditor externo)

- PRÉ-F1, PRÉ-F1.2 e F1 aplicadas em homolog com `success: true`; T1–T6 transacionais
  sem exception + ROLLBACK; `partner_users` com 0 linhas; 5 triggers, 3 checks,
  `UNIQUE(user_id)` preservada, 2 índices novos, 0 órfãos.
- **F1 NÃO aplicada em produção** — produção segue com schema pré-F1.

## 1. Bloqueios que impedem abrir F2 (NO-GO atual)

| # | Bloqueio | Evidência | Ação exigida |
|---|---|---|---|
| B1 | F1 não aplicada em produção | Produção intocada por decisão | Aprovação + aplicação controlada + T7 read-only antes/depois |
| B2 | Paridade de segurança homolog×produção incompleta | Homolog sem guards em `profiles`, `user_roles`, `user_clientes`; 279 vs 286 tabelas | PRÉ-F1.3: replicar guards das demais tabelas em homolog (mesmo método da PRÉ-F1.2) ou homologação fiel por método aprovado |
| B3 | Teste A/B de RLS não realizado | T1–T6 foram SQL privilegiado, não sessões reais | Sessões reais Admin tenant A/B, parceiro, produtor, técnico, interno contra homolog pós-F2 |
| B4 | PENDÊNCIA P1: 1 vínculo em produção com parceiro sem tenant | Verificado read-only na F0/F1 | Regularizar `commercial_owner_organization_id` do parceiro ou tratar vínculo, com dono e prazo |
| B5 | Bypass potencial do CHECK de tenant (ver seção 2) | Análise estática desta rodada | Gate fail-closed desenhado abaixo antes de F2 |

## 2. Análise: CHECK de tenant nullable e bypass em UPDATE (NOVO nesta rodada)

**Desenho F1 atual:** `tenant_id` é nullable; o trigger `partner_users_derive_tenant()`
deriva o tenant do parceiro e aceita NULL quando o parceiro não tem
`commercial_owner_organization_id`.

**Risco identificado (hipótese de desenho, não exploit comprovado):**
- Um parceiro **sem owner** aceita vínculos com `tenant_id NULL` indefinidamente —
  vínculos "sem território" que nenhuma policy por tenant enxerga corretamente.
- Em UPDATE, se o `partner_id` for trocado para um parceiro sem owner, o trigger
  deriva NULL e o check não bloqueia — um vínculo antes tenantado pode "perder" o tenant.
- Como helpers escalares (`get_user_partner_id()`) não filtram por tenant, um vínculo
  com tenant NULL continua autorizando — ou seja, o NULL não é fail-closed hoje.

**Gate proposto para F2 (fail-closed, preservando legados):**
1. **Novos vínculos exigem tenant:** trigger rejeita INSERT cujo parceiro não tenha
   `commercial_owner_organization_id` (`partner_without_tenant`, fail-closed).
   Vínculos legados com tenant NULL **permanecem** (não apagar histórico), mas:
2. **Legado sem tenant não autoriza:** helpers/RPCs de autorização passam a exigir
   `tenant_id IS NOT NULL` no vínculo ativo — vínculo legado sem tenant vira
   read-none até regularização (decisão de produto a confirmar com o proprietário;
   alternativa: manter autorização legada com alerta, documentando exceção).
3. **UPDATE não pode destenantar:** trigger rejeita UPDATE que resulte em
   `tenant_id NULL` a partir de valor não-NULL (`tenant_removal_forbidden`).
4. **Regularização:** RPC/fluxo para definir owner do parceiro + backfill do
   `tenant_id` do vínculo em transação única, com auditoria.

## 3. Escopo de F2 (quando desbloqueada)

1. **Helpers fail-closed/contextuais:** `get_user_partner_id()` e `get_partner_papel()`
   ganham variantes com `p_partner_id` explícito ou estratégia fail-closed quando
   houver ambiguidade; as 29 policies dependentes migradas por par, sem janela de
   autorização dupla.
2. **RPCs de gestão de vínculo** (SECURITY DEFINER, `search_path` fixo, EXECUTE
   revogado de PUBLIC/anon): criar vínculo (exige tenant), revogar (transação:
   `revoked_at/revoked_by/revoke_reason` + bump `version` + auditoria; **não** remove
   `user_roles.parceiro_b2b` se houver outro vínculo ativo), regularizar tenant.
3. **Histórico append-only** de revogações com RLS fechada (somente admin do tenant
   do vínculo + service_role).
4. **Invalidação imediata pós-revogação:** autorização server-side deixa de valer na
   mesma transação; frontend troca contexto/recarrega (alinhado ao cache de autorização
   com lease de 15s já existente).
5. **Gate de tenant da seção 2** incorporado ao trigger de derivação.
6. **Sem cutover:** `UNIQUE(user_id)` permanece; multi-vínculo só na fase de Cutover.

## 4. Checklist de aceite de F2 (todos obrigatórios)

- [ ] B1–B5 resolvidos e evidenciados.
- [ ] Migration F2 revisada pelo proprietário; rollback documentado (F2 é aditiva em
      funções novas; alteração de helpers exige plano de compensação).
- [ ] Aplicação em homolog + testes transacionais novos (criar/revogar/regularizar,
      tenant ausente rejeitado, UPDATE destenantante rejeitado, CAS de `version`).
- [ ] **Teste A/B de RLS com sessões reais** em homolog: Admin tenant A não vê/edita
      vínculos de B; parceiro A não acessa dados de parceiro B; produtor/técnico/
      interno conforme matriz da F0; revogação bloqueia acesso na mesma sessão após
      refresh de token/cache.
- [ ] Matriz de contextos múltiplos: usuário com vínculo em 2 parceiros do mesmo
      tenant (simulado em fixture transacional) — helpers fail-closed ou contextuais,
      nunca `LIMIT 1` ambíguo.
- [ ] Pedidos/financeiro/storage/fiscal: confirmar que nenhuma policy dessas áreas
      depende de vínculo sem tenant (inventário F0: storage não referencia
      `partner_users` diretamente — revalidar após F2).
- [ ] Typecheck, build e suíte de testes do repositório sem regressões.
- [ ] Só então propor aplicação em produção (janela, backup, T7 antes/depois).

## 5. Fora de escopo de F2

- Remoção de `UNIQUE(user_id)` / multi-vínculo efetivo (Cutover, fase posterior).
- Transferência de carteira, pedidos, propostas, comissões ou documentos entre
  parceiros (sempre exigirá vínculo expresso, nunca automático).
- Qualquer alteração em dados reais de usuários.
