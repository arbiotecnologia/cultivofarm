# Rollout candidato POSPLANOS — revenda física/OS, gates OFF

**Estado: REVIEW_ONLY_INACTIVE_NOT_APPROVED.** Nenhum arquivo foi executado pelo Lovable em produção; não houve login, conexão, publicação, grant temporário ou ativação. O projeto exigido é `swzpzcwiasxmjutrmvkm`. O isolamento `cc1f6cc…` já está instalado pelo auditor e não faz parte deste pacote.

## Pacote mínimo e ordem

O auditor deve revisar hashes e executar cada PRE/POST. Qualquer drift, overload inesperado ou contagem divergente aborta e exige nova captura; não atualizar pins para contornar.

1. `00-production-pre-posplans.sql.readonly`: valida POSPLANOS, corpos/ACLs/schema completos da baseline, contagens relatadas (6 planos, 4 assignments, 9 orders, 10 receivables, 5 fiscal invoices), ausência da confirmação pública de quatro argumentos e de todos os objetos novos; lista overloads para a evidência.
2. `11`/`12`: confirmação manual canônica fechada; capability instalada, writer sem EXECUTE de cliente.
3. `20`/`21`/`22`: PRE, envio manual canônico fechado e POST; writer sem EXECUTE de cliente.
4. `30`/`31`/`32`: PRE pós-confirmação/envio, produto físico acabado e POST; gate físico OFF.
5. `40`/`41`/`42`: PRE pós-físico, logística parcial de revenda e POST; gate logístico OFF.
6. `50`/`51`/`52`: PRE, leitor `public.rpc_b2b_resale_os_availability_v1(uuid)` + endpoint público de OS e POST; gate de OS OFF. O helper privado não recebe EXECUTE de `authenticated` nem `service_role`.

Rollback deny-only, em ordem inversa: `90`, `94`, `93`, `92`, `91`. Preserva histórico e não reabre writers. Não inclui nem desfaz planos comerciais. `manifest.json` contém os 20 hashes/tamanhos exatos.

## Frontend candidato integrado, não publicado

`ResaleOsAvailabilityPanel` foi montado no detalhe canônico do vendedor em `PedidosB2B.tsx`. O leitor exato decide a visibilidade; ausência/erro/gate OFF não exibe ação. Tenant, ator, roles e época cercam leitura/escrita. O envio exige clique, CAS e chave; tentativa incerta fica na sessão por escopo e reload apenas relê/reconcilia, nunca reenvia automaticamente. Dados locais não concedem autoridade.

## Evidência local fresh

- Composição descartável: **41/41**, exit 0; inclui logística parcial, reautorização e rollback deny-only do endpoint e do leitor.
- Endpoint/leitor: **15/15**. FSF com feature de estoque ON e papel válido foi negada contra ARBio por `B2B_RESALE_ORDER_SCOPE_DENIED`, no writer e no leitor. Controle positivo FSF-own com feature ON passou e sua fixture foi revertida. A negativa antiga por feature OFF permanece classificada separadamente.
- Concorrência do endpoint: duas chamadas, uma OS e um replay. ACL: helper direto negado; `service_role` tem EXECUTE=false comprovado no catálogo, separado da ausência de USAGE no schema.
- UI integrada: **21/21** testes focados; retenção por escopo/TTL, ausência de auto-resend e fences. Typecheck exit 0 e build OK. Não houve browser autenticado nem prova JWT/RLS/Storage real.
- Regressões de parciais: **13/13**; compatibilidade canônica de OS: **73/73** na bateria focada desta preparação.

## O que continua fechado

Instalação não ativa piloto. Uma validação futura somente poderá ocorrer em produção após revisão independente, autorização específica, fixture ARBio aprovada e plano de ativação mínimo. Este pacote não habilita esses gates nem writers de entrega.

B4, ponte fiscal, NF-e/NFS-e, recebíveis, pagamentos, cobrança, comunicação e publicação frontend estão excluídos. Recebível somente após evento fiscal válido; nenhum título/documento/alocação foi criado. O positivo fiscal integrado permanece `NOT_RUN_BLOCKED_REAL_ALWAYS_DENY`.
