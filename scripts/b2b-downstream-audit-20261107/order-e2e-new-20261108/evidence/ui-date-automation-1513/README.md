# Datas do plano sintético — diagnóstico independente encerrado

Relato recebido de Renato S. Cunha em 08/11/2026 15:13 UTC; não é uma nova sessão de navegador executada pelo agente.

- Na reprodução sem salvar, `Playwright.fill(date)` exibiu o valor no DOM, mas a alteração de outro campo o removeu após o rerender.
- No controle pelo fluxo normal, CUA `setValue` seguido da alteração do motivo manteve as datas. O auditor salvou a versão 2 e confirmou no banco `valid_from=2026-11-08T00:00Z` e `valid_until=2026-11-15T00:00Z`.
- A versão 1 `d95f0198-51d5-476d-8bfe-5574ed22bd2d` permanece inativa. O payload de auditoria já havia mostrado que o servidor recebeu NULL nela; não houve prova de perda no servidor.
- Conclusão: mecanismo de preenchimento automatizado, sem defeito de produto comprovado. Nenhum ajuste de runtime, teste de regressão de produto, schema ou SQL é justificado por este achado.
- O roteiro UI deve usar eventos reais de data/CUA `setValue`, salvar pelo fluxo normal e reler os valores. `Playwright.fill(date)` não deve ser usado como evidência deste bug.
- A versão 2 é fixture sintética de 30 dias, uma parcela, 10% de desconto e juros zero. Sua atribuição exclusiva ao novo parceiro está sendo preparada pelo auditor, fora desta execução.

Nenhuma operação hospedada, publicação, NF, cobrança ou envio foi realizada pelo agente.
