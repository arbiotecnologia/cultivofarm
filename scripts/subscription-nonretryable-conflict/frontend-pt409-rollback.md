# Frontend PT409 definitivo — rollback

Delta: `src/lib/saas/subscriptionTransition.ts` aceita o código exato `PT409` como erro definitivo
(mesmo caminho/mensagem de 22/23/40/42/P0; sem retry de escrita e sem reconciliação). Outros `PT*`,
timeout e desconhecidos permanecem inalterados. Teste: `src/test/saas/subscription-transition-pt409.test.ts`.

Rollback: restaurar a linha original
`if (response.error.code && /^(22|23|40|42|P0)/.test(response.error.code)) {`
removendo o comentário PT409, e apagar o teste novo. Com rollback, PT409 volta a "resultado desconhecido"
com 3 leituras de reconciliação (sem risco de escrita duplicada).
