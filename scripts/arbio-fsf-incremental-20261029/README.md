# Pacote incremental AR Bio → FSF — preparação 29/10/2026

**Não executado em produção. Nenhum arquivo deste pacote autoriza execução automática.**
Nova autorização permite preparar produção e futura implantação após inspeção. Não supera lacunas técnicas, fiscal/contabilidade nem permite emitir cobrança, boleto, NF, e-mail ou liberar automações financeiras.

## Artefatos e sequência

| Subconjunto | Artefato | Situação |
|---|---|---|
| UI | `creditBlockReason.ts` + integração existente em `ResponderCotacaoDialog.tsx` | 8 testes focados passaram; sem mudança de writer. Publicação NÃO realizada |
| 01 — aprovação/crédito/colunas | `01-credit-approval.install.sql.review` | Candidato transacional com pins atuais, ticket privado e pós-espera; 52 checks de componente passaram. **Não instalar até composição integral/revisão independente** |
| 02 — shared credit | `../financial-price-generator-20261029/shared-credit-guard.sql.review` | Bloqueado: integração integral de writers, d51_5, origem, FKs/ledger/importadores e locks ainda não demonstrada em produção |
| 03 — client link | `../fsf-client-link-20261029/link-partner-client.sql.review` | Não executado. Requer composição completa dos triggers de cliente/parceiro, audit/código, readiness h15 e teste sobre schema integral atual |
| 04 — Price | `../financial-price-generator-20261029/price-generator.sql.review` | **Não instalável/ativável com stubs**; boleto oficial de produção ausente na última evidência, settings/origem NF/contabilidade pendentes |

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
4. Reproduzir stack integral atual (incluindo `trg_00_b2b_internal_snapshot`, `trg_auto_b2b_receivable`, RLS/readiness, auditorias e constraints). O componente de 52 checks omite explicitamente essa stack; positivo legado sintético não autoriza pedido real.
5. Conferir baseline completo pelo `preflight.sql.readonly` antes da janela. Ele contém DO apenas de inspeção/assertion de catálogo, sem writes comerciais. Qualquer drift/objeto candidato já existente aborta. Não substituir hashes sem recaptura/revisão.
6. Só em futura chamada autorizada executar instalador transacional aprovado; lock timeout 3s, statement timeout 60s, tabela travada e pins rechecados dentro da mesma transação. Nenhum título/cliente/registro comercial é criado pelo instalador 01.
7. Conferir postflight exato (corpos/ACL/DDL vs artefato aprovado), zero tickets residuais, policies preservadas e executar releitura por sessões reais. Não chamar RPC de aprovação/criação para provar leitura.

## Rollback seguro

Falha antes de COMMIT desfaz DDL integralmente. Após COMMIT, `01-credit-approval.rollback.sql.review` é **contenção deny-only**: revoga EXECUTE da aprovação para clientes/service, mantém ticket, guards, colunas ampliadas, dados e histórico. Não reinstala corpo com GUC nem estreita coluna do trigger. Correção posterior exige novo baseline/pacote; rollback não promete reabrir aprovação antiga.

## Login e isolamento somente leitura — Renato/Fagner

Cada titular usa sua própria sessão em `https://app.cultivofarm.com.br`; nunca enviar senha/token/cookie ao assistente. Ver `LOGIN-READONLY.md`. Sem sessões reais nesta rodada, todos os resultados de login/isolamento ficam **NOT RUN**, não PASS. Nenhum usuário/perfil/vínculo criado ou concedido.

**Fluxo até o bloqueio fiscal:** apenas roteiro, ainda não validado em sessões reais.
**Fluxo financeiro completo:** NÃO VALIDÁVEL enquanto contabilidade/fiscal/settings/origem e composição técnica estiverem pendentes. Nenhum novo bloqueio comercial foi inventado.