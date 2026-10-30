# Entrega — pacote fechado revisável, NO-GO operacional

> Estado vigente (2026-10-30): instalado no hosted como parte de `release-combined.sql.review` (relato externo). Grants de cliente para grupo/cancelamento: candidato separado em `../delivery-group-capability-20261030/`.

## Estado vigente

- Instalador `install.sql.review` ensaiado em PostgreSQL descartável: **97 PASS / 0 FAIL / 0 BLOCKED** na regressão (257,264 s) e **9 PASS / 0 FAIL** no instalador fresco (242,091 s), ambos exit 0. Evidência da rodada diagnóstica anterior; **nenhum rerun nesta rodada documental**. Restauração: seis listas vazias.
- `WRITERS-INVENTORY.md` contém as **13 funções escritoras capturadas**, signatures/ACL/MD5, paths/linhas, callers diretos e transitivos, cron resumido, service cancel2args, caminhos ativos versus contidos e impactos reais de compatibilidade.
- Sem hosted SQL/writer, publicação, frontend, cobrança, alteração comercial ou nova arquitetura. Base publicada `859b8a8...`/`index-CYkBENfk.js` é relato externo do proprietário; não publicação executada pelo assistente.

## O que o candidato efetivamente fecha

`candidate.sql.review` instala `zz_delivery_mutation_closed` em entregas: cada INSERT/UPDATE exige permit privado one-shot por transação/ator/tenant/ação/alvo; DELETE é fechado. **Revoga DML de tabela e INSERT/UPDATE de colunas de PUBLIC/anon/authenticated**; mantém SELECT/RLS e batch de estoque independente. O trigger também contém escritores DEFINER/service sem permit; não alegar que preserva seus writes por manter EXECUTE.

Cancelador legado de **dois argumentos** recebe corpo deny-only e perde EXECUTE service/clientes. Novos overloads de criação em grupo e cancelamento observado ficam sem GRANT cliente/service; grants de testes são exclusivos do harness local. Não há caller observado de cancel2args em src/Edge/outra função capturada, mas integrações externas fora das fontes não são observáveis.

Grupo interno exige CAS OS/estoque, receipts contextualizados, reautorização/gates após waits, reserva/criação/movimento na mesma transação. Merge de split ocorre dentro do motor canônico com contexto/ledger, preservando índice, saldo e linha histórica. B2B/OnFarm e entregas com recebível/entregue seguem fechados. Rollback mantém histórico e trigger deny-only; não restaura corpo vulnerável nem DML cliente.

## Compatibilidade concreta pendente

**Três ações de comprovação ainda ativas no produto serão bloqueadas pelo instalador:** gerar formulário, coletar assinatura digital e anexar comprovante (`EntregaComprovantePanel.tsx:291,399,520`). Não possuem permit privado nem contenção cliente; assinatura/anexo fazem upload antes da RPC, com risco de objeto órfão quando a gravação falhar. Decisão do proprietário: migrar. A migração está em `scripts/delivery-proof-authz-20261030/` e foi entregue em `release-combined.sql.review` (atômico + comprovação numa única transação, backend primeiro, frontend depois). Relato externo do proprietário em 2026-10-30: `a566faa4…` aplicado no projeto canônico (migration `delivery_atomic_and_proof_authorization_20261030`, PRE/POST aprovados) e commit `8cd18556` publicado; este pacote isolado não deve ser reinstalado. A liberação de grupo/cancelamento a clientes segue em `scripts/delivery-group-capability-20261030/` (candidato, não aplicado). Demais callers de criação/status/cancelamento/recebimento/embalagens/sem-cobrança encontrados já estão contidos. Não confundir isso com homologação real de todos os callers.

Termos/PDF em tabela irmã permanecem caminho separado: geração/assinatura/upload/publicação de evento não são universalmente fechados por um trigger em entregas. Download e consulta financeira de títulos existentes continuam leitura. Detalhes e limites em `WRITERS-INVENTORY.md`.

## Downstream preservado e limite do recorte

Triggers financeiros/fiscais não foram desativados; flags auto_generate_receivable/fiscais não foram alteradas. Barreira privada em dez destinos nega writes durante operação de entrega; guard anterior à transição de partner_orders evita que o autogerador absorva erro filho. Autogerador e guard contábil permanecem pinados. `callgraph.json` descreve 116 funções/19 destinos textuais, não closure universal de SQL dinâmico.

financial_initial_installments/payment_schedule/financial_links pertencem à cadeia B2B negada no recorte interno testado. Isso não certifica integração externa nem reabre contabilidade/fiscal. Cron anterior não tem referência textual direta à entrega/cancelador; comandos completos/versão Edge implantada não constam dessa evidência resumida.

## Artefatos e execução local

- Instalação/pins: `assemble_install.py`, `pins.py`, `preflight.sql.review`, `postflight.sql.review`, `install.sql.review`, `rollback.sql.review`, `capture/post-expected.json`.
- Provas atuais: `test-results.json`, `install-results.json`, `restore-results.json`, `test_pg-current.log.txt`, `test_install-current.log.txt`, `test_pg-timing.json`, `test_install-timing.json`.
- Diagnóstico e limites: `TIMEOUT-DIAGNOSTICO.md`, `bounded_pg.py`, `run_bounded.py`; um runner por comando, prazos explícitos e checkpoints. Sem necessidade de repetir testes para esta documentação.
- Integridade: `SHA256SUMS`; comparação exata PRE/POST, drift corpo/ACL, falha POST com rollback DDL, COMMIT, rerun negado, denyrollback/histórico, batch preservado e delta motor confinado testados na rodada anterior.

Identidades/claims locais são sintéticas sobre PostgreSQL real, não JWT/RLS hosted. Nenhum GO operacional implícito. Histórico anterior preservado em `history/README-before-writers-inventory-20261030.md` e `history/timeout-dc841355/`; suas afirmações de ACL não revogada/instalador faltante/split bloqueado estão superadas e **não são guia vigente**.
