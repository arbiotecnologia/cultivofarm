# Pacote incremental AR Bio → FSF — preparação 29/10/2026

**Não executado em produção. Nenhum arquivo deste pacote autoriza execução automática.**
Nova autorização permite preparar produção e futura implantação após inspeção. Não supera lacunas técnicas, fiscal/contabilidade nem permite emitir cobrança, boleto, NF, e-mail ou liberar automações financeiras.

## Artefatos e sequência

| Subconjunto | Artefato | Situação |
|---|---|---|
| UI | `creditBlockReason.ts` + integração existente em `ResponderCotacaoDialog.tsx` | 8 testes focados passaram; sem mudança de writer. Publicação NÃO realizada |
| 01 — aprovação/crédito/colunas | `01-credit-approval.install.sql.review` | 57 checks de componente + 6 ensaios do instalador completo passaram na rodada 20:28. **Autoridade integrada e corridas pós-lock ainda não ensaiadas; sem GO** |
| 02 — shared credit | `../financial-price-generator-20261029/shared-credit-guard.sql.review` | Bloqueado: integração integral de writers, d51_5, origem, FKs/ledger/importadores e locks ainda não demonstrada em produção |
| 03 — client link | `../fsf-client-link-20261029/link-partner-client.sql.review` | Não executado. Requer composição completa dos triggers de cliente/parceiro, audit/código, readiness h15 e teste sobre schema integral atual |
| 04 — Price | `../financial-price-generator-20261029/price-generator.sql.review` | **Não instalável/ativável com stubs**; proprietário confirmou boleto cadastrado em produção, mas limite/settings/origem NF/contabilidade permanecem pendentes |

O arquivo `01-credit-approval.body.sql.review` é somente entrada do harness, **não instalador**. Não executar isoladamente. Não concatenar subconjuntos 02–04 ao 01.

## Metadata real

Captura pelo conector externo cujo binding documentado é `swzpzcwiasxmjutrmvkm`, somente SELECT de catálogo. Sem consulta de credenciais/DSN, dados de clientes, título ou NF. A captura não prova estado de saídas externas, sessão, JWT/RLS ou versão do frontend publicado.

- `capture/production-metadata.json`: 49 funções, 45 triggers, 42 policies, 7 relações e 50 constraints.
- `capture/production-dependencies.json`: dependências adicionais, colunas e arestas pg_depend.
- Hashes fornecidos pelo proprietário conferidos: guard `b24a3c30910832e8b14456d912a67589`, exposição `213ac31f3a30816ead75365b0d1fed18`, aprovação `8127c7b697871fa1eecafa845a551eea`.
- `organizations_select_authenticated` **não está em produção**; SELECT próprio + `b2b_organization_full_row_containment` restritiva preservados. Não existe DDL de organizations neste pacote.
- pg_depend não fecha chamadas PL/pgSQL ou SQL dinâmico sozinho. Inventário é completo dos objetos capturados do recorte, **não certificação da cadeia recursiva inteira**.

## Correção focal do 01

Baseline real autoriza campos de aprovação por `arbio.b2b_credit_approval`. No ensaio local, setar essa GUC permite alterar campos no guard; isso **não prova exploração via JWT/RLS hosted**, que continua independente.

Candidato substitui GUC por ticket `txid_current()+ator+pedido` numa tabela privada sem ACL cliente/service; só o RPC autorizado o cria após lock da linha e lock comum do parceiro, revalida autoridade, e o trigger consome o ticket. Não cria ticket no harness para fabricar aprovação. Sem ticket, GUC spoof falha. `C2_ACCOUNTING_PENDING` permanece intacto. Alteração isolada de juros entra no trigger ampliado; shortcuts de aprovação exigem ambos os valores inalterados. Settings ausentes/inativas, limite não positivo/não finito e isolamento com snapshot fixo negam. Excesso configurado aprovado legitimamente continua em análise comercial, nunca é liberado para produção/fiscal.

## Preflight humano obrigatório — nenhuma execução nesta chamada

1. Confirmar no painel e origem observada do app **produção canônica**, versão exata e SHA256 do manifesto aprovado. Arquivo SQL não consegue comprovar project ref pelo nome genérico do banco; não tratar variável/GUC declarada como prova de ambiente.
2. Inspecionar diffs e `inventory.json`; revisão independente precisa aprovar exatamente subconjunto 01, não o pacote inteiro.
3. Obter prova sanitizada de saídas OFF separadamente: comunicação, NF/SEFAZ, boleto/banco e auto-receivable. Não basta cinco flags de comunicação. Ausência = BLOCKED para qualquer cenário com escrita.
4. Restauração 20:28: preflight exato e instalador completo foram ensaiados com corpos reais, ACL/RLS e triggers, inclusive `trg_00_b2b_internal_snapshot`/autotítulo/readiness/auditoria e guards de perfil. Falhas PRE e POST desfizeram DDL; COMMIT/postflight, rerun recusado e contenção com body drift passaram. Isso valida instalação, não aprovação integrada: casos de revogação pós-lock com autoridade real, zero dispatch e caminhos fiscais ainda não foram executados. Os 57 checks continuam somente componente com seams explícitas.
5. Conferir baseline completo pelo `preflight.sql.readonly` antes da janela. Ele contém DO apenas de inspeção/assertion de catálogo, sem writes comerciais. Qualquer drift/objeto candidato já existente aborta. Não substituir hashes sem recaptura/revisão.
6. Implantação administrativa já autorizada; não solicitar novamente por esse motivo. Nesta chamada hosted permanece proibido: operador inspeciona e executa depois, somente quando lacunas técnicas do artefato exato estiverem fechadas. Lock timeout 3s, statement timeout 60s, tabela travada e pins rechecados na transação. Nenhum título/cliente/registro comercial é criado pelo instalador 01.
7. Conferir postflight exato (corpos/ACL/DDL vs artefato aprovado), zero tickets residuais, policies preservadas e executar releitura por sessões reais. Não chamar RPC de aprovação/criação para provar leitura.

## Rollback seguro

Falha antes de COMMIT desfaz DDL integralmente. Após COMMIT, `01-credit-approval.rollback.sql.review` é **contenção deny-only**: revoga EXECUTE da aprovação para clientes/service, mantém ticket, guards, colunas ampliadas, dados e histórico. Não reinstala corpo com GUC nem estreita coluna do trigger. Correção posterior exige novo baseline/pacote; rollback não promete reabrir aprovação antiga.

## Login e isolamento somente leitura — Renato/Fagner

Cada titular usa sua própria sessão em `https://app.cultivofarm.com.br`; nunca enviar senha/token/cookie ao assistente. Ver `LOGIN-READONLY.md`. Sem sessões reais nesta rodada, todos os resultados de login/isolamento ficam **NOT RUN**, não PASS. Nenhum usuário/perfil/vínculo criado ou concedido.

**Fluxo até o bloqueio fiscal:** apenas roteiro, ainda não validado em sessões reais.
**Fluxo financeiro completo:** NÃO VALIDÁVEL enquanto contabilidade/fiscal/settings/origem e composição técnica estiverem pendentes. Nenhum novo bloqueio comercial foi inventado.

## Evidências externas atualizadas — relato do proprietário às 20:28

- Boleto bancário `1e7bd8ba-82e5-4ced-a6ec-55a9661e3e1d` cadastrado pela UI AR Bio. Settings do parceiro FSF `4a7e37e0-632a-41d5-8ccb-c627185ad5b3` salvos pela RPC às `2026-10-29T20:20:51.010284Z`: auto_generate_receivable=false, método Boleto, limite NULL/prazo7 preservados e 0 pedidos/0 recebíveis. Não reconsultado como dado nesta rodada; não confundir com captura de catálogo.
- Fiscal AR Bio DRAFT/NOT_READY, nfe/nfse/production=false e accountingvalidated NULL. Nenhuma liberação financeira inferida.
- Tenant FSF `8f57c7dd-0557-4041-b401-7a00f7244626`, administrador Renato auth `cbdc4ef3-005a-4674-8ea3-4410c7d7d212`, não é o parceiro FSF. Comprador teste4 auth `beb25695-3957-48b0-aff8-6316520ea189` está dentro AR Bio e ligado ao parceiro TESTE AUDITORIA `7e52de9a-4bed-4d1e-8200-3255a805465c`, não ao FSF esperado. Lifecycle cross_partner recusa transferência; caminho seguro pendente, sem renomear/transferir/papéis nesta rodada.
- Sessão AR Bio confirmada pelo proprietário via UI; Fagner/FSF real e isolamento A/B seguem pendentes, não PASS do assistente.

## Limites concretos da restauração

`capture/stack-metadata-2028.json` contém somente catálogo, sem linhas reais/credenciais. Resultado em `incremental-stack-2028/restoration-results.json`: todos os triggers capturados restaurados, nenhum default/policy falhou; 44 funções/views externas não restauradas, principalmente texto sanitizado `[REDACTED]` e schemas SMTP/Storage não incluídos. Closure lexical da aprovação + stack de pedidos + gerador contém 55 nomes e nenhum corpo sanitizado, mas não é prova completa de SQL dinâmico. Uma constraint-trigger do módulo regulatório não foi restaurada como constraint; não integra o recorte01. PostgreSQL local conserva postgres superuser para DDL, enquanto hosted postgres não é superuser: instalação não certifica autoridade de sessão. Nenhum desses limites foi contornado com stub.
## Rodada 21:10 — subconjunto 01 integrado (offline)

- **Dependências fechadas:** os 44 objetos não restaurados eram corpos marcados `[REDACTED]` pela ferramenta de leitura e dependentes deles, mais esquemas `tenant_smtp_executor`/`finance_private`/`storage` ausentes. Recaptura somente leitura em base64 (`capture/stack-supplement-2107.json`, 60 funções, MD5 de cada corpo conferido contra `pg_get_functiondef`, nenhum `[REDACTED]`) + enum `storage.buckettype`. A constraint-trigger regulatória já era restaurada pelo `pg_get_triggerdef`; a falha antiga era a forma inválida `ADD CONSTRAINT`. Resultado: **0 funções/views, 0 constraints, 0 triggers, 0 defaults, 0 policies pendentes**; nenhuma dependência impossível restante. Nenhum stub.
- **Achado integrado (RED no baseline real):** `approve_b2b_credit` autorizava por `b2b_phase1_order_visible`, que resolve o parceiro do **comprador** (`organizations.partner_account_id`). (a) Equipe interna AR Bio sem vínculo é negada (`b2b_phase1_scope_denied`) — aprovação inalcançável; (b) se a organização de um tenant comprador apontar para o parceiro, o administrador desse tenant **aprova o próprio crédito** (demonstrado em transação revertida). Produção hoje: tenantFSF e AR Bio têm `partner_account_id` NULL (leitura 21:10Z), logo (b) é latente.
- **Correção:** `platform_private.b2b_credit_internal_authority(order,uid)` — só ator da organização proprietária do parceiro, com administrador/gestor/financeiro ativo e pronto, sem papéis externos (`parceiro_b2b`, `parceiro_b2b_tecnico`, `cliente_produtor`) nem `partner_users` ativo; relida antes e depois do lock de linha e do advisory. Superadmin de plataforma passa a ser negado (estreitamento deliberado, a revisar).
- **Ensaio integrado** (`test_integrated.py`, evidência `incremental-integrated-2110/`): 44/44 PASS com stack restaurada, artefato final com pins de pós-verificação: positivo interno, uma auditoria, zero tickets, replay recusado, nenhum título/parcela/documento/NF/comunicação/notificação/planejamento mesmo com `auto_generate_receivable=true` + `na_aprovacao`; negativos tenantFSF, cumulativo, superadmin, autoaprovação; GUC spoof sem linha alterada; settings inativas e limite zero; `C2_ACCOUNTING_PENDING`; gate SaaS real abortando atomicamente; revogação de papel durante lock de linha, desativação de perfil e novo vínculo externo durante advisory — todos negados com bloqueio comprovado por `pg_blocking_pids`; rollback deny-only preserva histórico.
- **Limites:** linhas de fixture sintéticas (pré-estado com `session_replication_role=replica`, inclusive revogações simulando commit concorrente); sessões com `request.jwt.claims` sem verificação de assinatura; postgres local superusuário. **Não é prova JWT/RLS/E2E**. Implantação ainda depende da revisão do artefato exato pelo proprietário e das leituras reais em `scripts/e2e-arbio-fsf-real-20261029/API-ISOLATION.md`.
