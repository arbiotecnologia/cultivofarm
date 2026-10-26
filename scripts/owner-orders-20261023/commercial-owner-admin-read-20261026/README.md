# C2 — Leitura administrativa da carteira do commercial owner (2026-10-26)

**Status: INATIVO — somente revisão. Não aplicar sem autorização explícita do proprietário.**
**v2: incorpora a revisão independente 107e6e05 (NO-GO anterior resolvido ponto a ponto).**

## Causa raiz (evidência READ ONLY em produção, 2026-10-26)

Homologação PB-001029: administrador A (org dona da carteira) em `/comercial/pedidos-b2b`
via "Nenhum pedido encontrado" nos filtros "Em análise" e "Todos"; admin B (org estrangeira)
também via zero (negativo esperado). A/B **não** homologado: o positivo A falhou.

- `partner_orders` tem policy **restritiva** `b2b_phase1_tenant_guard` que exige
  `platform_private.b2b_phase1_partner_visible(partner_id, false)` em toda leitura.
- Para ator interno, `b2b_phase1_partner_visible` resolve `b2b_actor_scope` e exige
  `org_partner = partner_id`. A org do admin A é **dona comercial** da carteira
  (`commercial_owner_organization_id`), não parceira — `org_partner` é NULL → guard falso →
  zero linhas, mesmo com a policy permissiva `partner_orders_select` (administrador/gestor_comercial).
- O canal do parceiro (`get_my_commercial_orders_projection`) cobre só o usuário externo
  `parceiro_b2b`; não existe leitor canônico para o admin interno da empresa dona da carteira.

## Correção proposta (candidate.sql.review)

Leitura **somente leitura**, escopada e fail-closed:

- `platform_private.c2_commercial_owner_orders_core(text,uuid,timestamptz,timestamptz)`
  SECURITY DEFINER com **`search_path = ''` e nomes totalmente qualificados**; deriva a
  organização do ator **no servidor** (perfil ativo + org ativa; `profiles.user_id` tem
  índice único pinado no preflight, resolução determinística), exige papel `administrador`
  ou `gestor_comercial` via `platform_private.has_role` (corpo e ACL pinados no preflight),
  e retorna apenas pedidos cujo parceiro tem `commercial_owner_organization_id = org do ator`
  (parceiro ativo/não deletado). Sem escopo ou sem papel → `42501`.
- `public.c2_commercial_owner_orders_projection(...)` INVOKER wrapper, ACL canônico
  (`authenticated` + `service_role`, owner `postgres`; autorização dentro do core).
- **CREATE sem OR REPLACE** + assert transacional de ausência do alvo na mesma transação:
  função criada entre preflight e apply aborta o DDL em vez de ser sobrescrita.
- Filtros opcionais: status (texto), partner_id, janela de datas. Limite 200.

## Resolução da revisão 107e6e05

1. **Seção sempre montada**: `PedidosB2B` não condiciona mais a `orders.length === 0`;
   `CommercialOwnerOrdersSection` recebe `excludeIds` e deduplica por ID os pedidos já
   visíveis na lista administrativa (teste de lista mista). Somente acompanhamento — sem
   ações paralelas.
2. **Dependências pinadas**: preflight asserta corpo/ACL de `platform_private.has_role`
   (md5 `05f82a3d57ca71ca6d966fd6c7cf1a1b`) e a unicidade de `profiles.user_id`.
   Papéis cobertos na prova: misto (admin+externo) resolve pela org do perfil ativo;
   externo sem papel interno → `actor_not_allowed`; superadmin sem papel interno é negado
   aqui por construção (canal do fornecedor é a lista administrativa); perfil revogado
   (`ativo=false`) e org inativa → `actor_scope_unavailable`.
3. **Asserts transacionais**: preflight e postflight deixaram de ser SELECTs informativos —
   DO blocks abortam em qualquer divergência (ausência do alvo, dependências, policies com
   hashes qual/with_check pinados; postflight valida schema/assinatura/owner/prosecdef/
   `search_path`/ACL incluindo ausência de PUBLIC/anon e md5 dos corpos).
4. **Data de entrega**: a correção do rascunho (turno anterior) é **preventiva**, não
   comprovada como causa — a UI preenchida precedeu o resumo e nenhum remount foi capturado
   em produção. Permanece até novo teste real; não declarar como causa comprovada.
5. **Atualização MANUAL, sem realtime** (revisão 5db54f): a assinatura
   `postgres_changes` em `partner_orders` foi **removida** — Postgres Changes respeita
   RLS e a política restritiva nega SELECT da linha ao commercial owner, logo o canal
   jamais entregaria eventos deste ator (e duplicava a assinatura do canal
   administrativo). RLS **não** será ampliada por causa disso. A seção oferece botão
   explícito **Atualizar** (refetch do canal escopado), visível também com lista vazia
   ou erro de transporte, sem reload nem polling. **Atualização automática permanece
   NÃO homologada e pendente** — não prometer realtime funcional sem prova real.
   Erro de transporte rende aviso explícito de indisponibilidade — nunca confundido
   com carteira vazia.

## Garantias

- **Deny B preservado**: org estrangeira → lista vazia; sem papel interno → `42501`.
- **Vínculo revogado**: perfil/org inativos → `actor_scope_unavailable`; parceiro
  inativo/deletado → fora da lista.
- **Sem policy ampla, sem bypass de service**: nenhuma policy de `partner_orders` é
  alterada (hashes pinados em PRE/POST); o core é DEFINER com `search_path` vazio.
- **Sem escrita**: aprovação/cobrança/NF/entrega seguem nos endpoints canônicos existentes.

## Reconciliação com a tarefa anterior (mesmo dia)

O acompanhamento do parceiro (`CommercialOwnOrders` em `/portal-parceiro/pedidos`) e a
correção preventiva da data desejada permanecem intactos — este pacote cobre o lado
**administrativo da empresa dona da carteira**, canal separado e complementar.

## Limitações / NO-GO

- Não abre detalhe, itens, mensagens nem ações para o admin da carteira — somente listagem.
- Prova local em PostgreSQL 17.9 descartável com Auth sintética via GUC (17/17 checks);
  **não** é certificação JWT/RLS hosted nem browser.
- Gate contábil A (DRAFT) segue pendente; este pacote não promove nem valida contabilidade.
- Aplicar somente com preflight PASS, revisão independente e autorização do proprietário.

## Arquivos

- `candidate.sql.review` — DDL proposta (transação única, assert de ausência, CREATE sem OR REPLACE).
- `preflight.sql` — READ ONLY com asserts: alvo ausente, dependências pinadas, policies com hashes.
- `postflight.sql` — READ ONLY com asserts exatos: assinatura/owner/prosecdef/search_path/ACL/md5 + policies.
- `rollback.sql.review` — DROP guardado por md5 das duas funções; não toca policies nem dados.
- `expected.json` — contrato, hashes e ACL esperados.
- `proof-disposable-pg.sh` — prova sintética reproduzível (17 checks).
