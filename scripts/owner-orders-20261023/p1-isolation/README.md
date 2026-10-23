# P1 — atribuições privadas e configuração financeira (INATIVO)

Prioridade antes de liberar writer. Produção NÃO corrigida por este pacote: nenhum SQL/DML/Edge/publicação/sessão executado. Prova REAL B é relato independente do auditor: Fagner/admin tenant `8f57c7dd-0557-4041-b401-7a00f7244626` viu assignmentA `48dcac7d-d4a0-4058-bdf4-5461fee89f45` publicado; NÃO acionou Arquivar. Leitura de catálogo hosted confirmou a família sem tenant e policy única role-only.

## Arquivos / ordem futura (somente auditor após autorização)
- `baseline.json`, `baseline.sql`, `sibling-baseline.sql`: captura canônica READ ONLY; nunca instalar baseline vulnerável.
- `preflight.sql`: assertivo função/corpo/owner/ACL, políticas, constraints, colunas, triggers, ACL/RLS, tickets privados e sibling. Nenhum grant implícito. Ref deve ser comprovado externamente como `swzpzcwiasxmjutrmvkm`; `c2p1.review_project_ref` é apenas confirmação operacional, NÃO autoriza escrita.
- `candidate.sql.review`: transação autocontida PRE + core. `core.sql.review` serve apenas ao teste descartável; nunca instalar sem PRE.
- `postflight.sql`: verificar depois de instalação independente. Acrescentar captura/comparação exata de hashes pós e catálogo completo pelo auditor antes do GO; o postflight atual verifica propriedades críticas, não certifica igualdade completa do schema.
- `rollback.sql.review`: fecha leitura/ações de atribuição e settings, mantém fences, timestamp monotônico, método canônico e histórico; não restaura policy/ACL vulneráveis. Sem DROP de tabela/dado/histórico ou restauração do CHECK fixo.
- `frontend.patch`, `frontend-baseline.ts`, `useB2BFinanceiro.ts`: patch inativo no hook existente. O formulário/diálogo/fences de rascunho e seleção não mudam. Promover SOMENTE coordenado com API; runtime atual continua baseline.

## Regras
Atribuição partner usa `partner_accounts.commercial_owner_organization_id` ativo; producer usa `clientes.organization_id` e cliente ativo. Ator exige h15/readiness, perfil e organização ativos, papéis internos canônicos; externos mesmo cumulativos negados. Leitura direta e RPC list usam a mesma autorização. Create/update validam novo destino e destino anterior; submit/publish/archive autorizam antes de expor estado, bloqueiam linha e trigger revalida targets antigos/novos. DML direto fecha. Planos globais permanecem globais; nenhuma alteração no catálogo de planos.

**default sem destino fica fechado nesta candidata**: não existe tenant provado nessa linha. Não inventar tenant pelo criador nem backfill. É contenção intencional a revisar para consumers de atribuição default; nenhum default histórico modificado. Parceiro/cliente órfão/inativo também invisível sem reparo.

Publicação irmã `rpc_cc_publish_item_prices` valida destino antes de consultar a atribuição ou modificar regra. Não altera preço/motor. Call graph dos leitores `fn_resolve_commercial_price` e `rpc_b2b_list_selectable_payment_plans` foi capturado; seus contratos de preço/lista global não foram abertos por este pacote. Avaliação completa de suas autorizações legadas continua gate C2-ORD, não é certificação desses leitores.

Settings: owner interno ativo OU ownorg legado interno com permissive original preservada; h15/perfil/roles e organização ativa são obrigatórios. Administrativo ownorg/owner mantém somente leitura via permissive existente; externo não ganha gestão financeira. Superadmin sem tenant/roles internos não recebe bypass global: revisar necessidade operacional explicitamente, sem inventá-la.

Tabela/settings existente e audit AFTER preservados. RPC pública INVOKER / core privado autorizado independentemente, sem bypass pelo papel postgres, claims ou GUC. DML direto fecha; trigger exige autorização corrente e ticket privado txid/parceiro, consumido pelo core. Baseline JSON completo deve ser **exatamente a linha persistida** (`select('*')` atual); ausência exige SQL NULL, nunca upsert. Lock parceiro serializa primeira inserção e CAS; timestamp monotônico servidor garante stale conflict. Método deve ter nome canônico exato, ativo e único; lock da linha impede desativação concorrente do método escolhido. CHECK hardcoded pix/boleto retirado e default pix eliminado sem alterar linhas antigas. Legado inválido exige escolha explícita, nunca fallback. Crédito/limiares inválidos falham. Fixture teste4, método AUDIT, plano e assignment existentes não foram alterados/duplicados.

## Evidências locais
- `python3 scripts/owner-orders-20261023/p1-isolation/test_local.py`: **50/50 PostgreSQL sintético PASS**, reprodução leak B pré-candidato, A/B direta/RPC, criação/edição/submissão/publicação/arquivo, produtor/default, item sibling A/B, owner/ownorg, externo, h15/perfil/owner, método inexistente/inativo/ambíguo, CAS integral/stale/duas conexões (um sucesso/um conflito), timestamp/ticket, rollback/histórico/anon/ref.
- Vitest runtime: **19/19** formulário/mutação/publicação em três arquivos; não prova nova RPC.
- Vitest candidato: **5/5** `bun run test scripts/owner-orders-20261023/p1-isolation/partnerSettingsRPC.test.tsx --config scripts/owner-orders-20261023/p1-isolation/vitest.config.ts`, TZ America/Sao_Paulo. SDK simulado; verifica baseline completo/RPC/CAS/fences. Sem PostgREST real.
- Primeira seleção isolada não encontrou teste; seleção sem filtro mesclou suíte ampla e excedeu prazo, NÃO contar como PASS. Filtro explícito acima PASS.
- Typecheck/build manuais não executados por regra do ambiente. Runtime/src não alterado neste turno; build do preview não certifica fontes inativas. Auditor deve typecheck candidato/produção após montar patch; não declarar PASS inexistente.

## NO-GO restante
Revisão independente do PRE integral (incluindo closure de permissões/locks/SaaS e definições de targets), hashes POST exatos, autorização operacional para default/Superadmin se necessária, JWT/PostgREST A/B reais, formulário real A com método AUDIT/na_entrega e negação B/external, concorrência/revogação completa, rollback real. Auth/h15/helpers capturados reais convivem com dependências reduzidas e Auth sintética no teste: **NÃO JWT/RLS hosted nem trigger graph integral**. No serviço de produção, paginação/listagem e APIs precisam prova real antes do writer. Pendências antigas (monitor, multiperfil B, anexos, fiscal/cancelamento/estorno/idempotência/preço) continuam abertas.
