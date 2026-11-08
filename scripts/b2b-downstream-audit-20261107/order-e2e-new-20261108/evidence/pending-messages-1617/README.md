# Reconciliação das mensagens pendentes — 08/11/2026 16:17 UTC

Escopo: mensagens recentes desde o cadastro com financeiro posterior até o bloqueio de isolamento FSF→ARBio. Esta reconciliação não reabre nem promove resultados históricos e não substitui revisão independente.

## Disposição de cada frente

- **Cadastro sem configuração financeira automática:** baseline reconciliada e testes de ausência/abertura sem gravação concluídos; nenhum instalador novo criado.
- **Reconstrução E2E e autoridade comprador/vendedor:** harness novo concluído localmente com shape real de tenant vendedor, sem recuperar artefatos perdidos nem reutilizar contagens antigas.
- **Journal do comprador novo:** reserva inicial não afirma envio anterior; `uncertain`, `committed`, `closed` e troca de conta permanecem cobertos, sem alterar deduplicação.
- **Defaults financeiros:** novo formulário inicia `manual` e `auto_generate_receivable=false`; existentes e CAS preservados.
- **Datas do plano:** o auditor reproduziu que `Playwright.fill(date)` alterava o DOM sem manter o estado após outro campo mudar; `setValue` e o fluxo normal persistiram a versão 2 corretamente. Não há defeito de produto comprovado nem necessidade de correção SQL/schema. Nenhum teste de regressão de produto foi adicionado para um defeito não reproduzido.
- **Comprador sem condição:** o auditor publicou a atribuição exclusiva da versão 2; a preparação seguinte cobre targeting escopado, meio obrigatório e contenção durante releitura. Nenhum pedido foi enviado.
- **Logística de revenda:** compra, reserva, cancelamento/restauração, nova expedição, envio, comprovante/anexo, confirmação, replays, negativos e rollback passaram em PostgreSQL descartável, sem fabricação/CQ/envase, NF ou recebível novo.
- **Isolamento FSF→ARBio:** candidato inativo preparado; leitura e escrita cruzadas foram reproduzidas antes e negadas depois no fixture sintético, com PRE/POST e rollback deny-only.

## Nova execução consolidada

Os resultados abaixo são desta reconciliação e permanecem separados, sem soma entre suítes:

1. `commercial-plans.txt`: **58/58**, exit `0`; reprodução do vazamento/escrita indevida antes e contenção depois.
2. `order-e2e.txt`: **20/20 checkpoints**, exit `0`; reconstrução integral, dez gatilhos/ACL/fence e rollback preservados.
3. `ui-focused.txt`: **9 arquivos, 137/137 testes**, exit `0`; defaults financeiros, capability/meio e journal/recuperação.

`summary.json` registra limites e hashes. O candidato logístico é `6452c8ce4c61dbc52222d2081fe2a9c0d0099dc5c11ecad11cae48849b61cbb3`; o candidato de isolamento é `92053bcba29f7896f9a16cb311b8eff5fc28ed73af5e0a9fcae7afd5dc494af6`.

## Pendências que não podem ser executadas localmente

- Revisão independente dos candidatos e instalação manual somente após autorização específica.
- Ativação escopada do novo parceiro pelo auditor, com UUID completo, array preservado e CAS fresco.
- Reteste real ARBio/FSF e homologação JWT/RLS/PostgREST/Storage/browser após instalação autorizada; não executar escrita FSF em produção.

Nada foi aplicado no banco hospedado ou publicado. NF, cobrança, recebíveis novos, comunicação e envios externos permanecem bloqueados. PASS local não é aprovação de produção.
