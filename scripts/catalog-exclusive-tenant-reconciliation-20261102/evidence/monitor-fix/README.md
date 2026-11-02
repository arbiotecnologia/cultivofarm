# Correção das 10 falhas de baseline — partnerCatalogMonitor.integration.test.tsx

Status: somente teste local; produção, SQL hosted e publicação intocados. Release NO-GO preservado.

## Causa comprovada (01-before)
Todas as 10 falhas: `state.writes` (sentinela de RPC inesperada) recebia `partner_order_journal_capability_v1`.
O hook real `useOrderJournal` passou a sondar essa capability ao montar o catálogo; o fixture não a conhecia,
então a sonda caía no ramo "RPC inesperada". Não era regressão de produto nem de isolamento.

## Tentativa rejeitada (02-attempt)
Envelope `enabled:true` levou o hook ao modo durável, que chama `recover_partner_order_attempt_v1`
(reserva de chave no servidor). A sentinela acusou corretamente essa escrita; a tentativa foi descartada,
sem afrouxar a sentinela.

## Correção (diff)
Fixture responde à sonda com o sinal exato de "não instalado" (PGRST202 nomeando a RPC) → modo legado,
o mesmo caminho de compatibilidade aceito por `journalCapability`. A recuperação continua proibida via
`state.writes`. Nova assertion: a sonda foi chamada e somente com parceiros informados pelo contexto do servidor.
Nenhuma assertion de isolamento/contrato removida; nenhum skip, sleep ou timeout novo; nenhum código de produção alterado.
O modo durável segue coberto por `src/test/pedidos/orderJournal.integration.test.tsx` (não certificado por esta rodada).

## Resultados reais
- 03: suíte específica 14/14.
- 04: 51 arquivos da baseline (`baseline-files.txt`), `vitest --maxWorkers=2 --minWorkers=1`: 51/51, 1017/1017 (antes 1007 + 10 falhas).
- 05: `tsgo --noEmit -p tsconfig.app.json`: exit 0.

## Pendências
Pacote exclusivo do isolado (814c5bc) ainda não recebido; propriedade dos 13 produtos/25 microrganismos
fica para os vínculos auditados do pacote. SMTP fechado, fiscal pendente, sem cobranças. JWT/RLS/navegador real não executados.
