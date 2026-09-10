# P0b — Checklist de segredos e configuração (somente nomes)

Nenhum valor de segredo foi lido, copiado, impresso ou armazenado. Este arquivo
lista **apenas nomes** e a decisão associada.

## Regra absoluta

Nada é copiado de homologação para produção. Chave de service role, senha de
banco, DSN, certificado digital A1/A3, token de provedor e JWT **não** são
transportados por este pacote. Produção recebe segredos próprios, provisionados
por pessoa autorizada, ou o domínio dependente fica desligado.

## Segredos referenciados pelo código

| Nome | Usado por | Decisão para produção |
|---|---|---|
| `FISCAL_CERTIFICATE_MASTER_KEY` | funções fiscais de certificado/assinatura/transporte | **NÃO provisionar nesta promoção** — fiscal permanece fail-closed |
| `FISCAL_CORS_ALLOWLIST` | `fiscal-certificate-upload`, `fiscal-sefaz-transport` | idem |
| `INTERNAL_FUNCTION_SECRET` | outbox de comunicação, webhook WhatsApp, health | provisionar **valor novo e distinto** só quando a onda de comunicação for autorizada |
| `LOVABLE_API_KEY` | funções de IA (`ai-*`) | provisionar valor próprio de produção, se as funções forem promovidas |
| `STAGING_DSN` / `STAGING_REF` | ferramentas de homologação | **NUNCA** em produção |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS`, `SUPABASE_DB_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` | gerenciados pela plataforma | já existem em produção; **não sobrescrever** |
| (chave do provedor de clima) | `sync-clima` | confirmar nome real na função antes de promovê-la |

## Flags de aplicação — estado exigido durante toda a promoção

```
COMMUNICATION_DELIVERY_ENABLED=false
EMAIL_DELIVERY_ENABLED=false
WHATSAPP_DELIVERY_ENABLED=false
COMMUNICATION_INAPP_ADAPTER_ENABLED=false
WHATSAPP_WEBHOOK_ENABLED=false
```

Fiscal permanece fail-closed; nenhum ambiente de autorização real (`tpAmb=1`)
pode ser habilitado por este pacote.

## Binding do frontend

`.env`, `src/integrations/supabase/client.ts` e
`src/integrations/supabase/types.ts` continuam apontando para **homologação**
até a onda P6. Restaurados nesta P0b a partir do baseline autorizado; o gate
`restoration/homologacao-h9/h9f-gates/h9f-binding-gate.sh` foi executado sem
qualquer conexão de banco e retornou OK.

## Conferência antes de cada onda

- [ ] nenhum segredo de homologação presente em produção
- [ ] nenhuma flag de entrega externa ligada
- [ ] backup/PITR comprovado por evidência humana
- [ ] ref do alvo validado por canal externo antes de definir `promocao.target_ref`


## Adendo P0c — nenhum segredo é pré-requisito da onda

Os nomes externos (`FISCAL_CERTIFICATE_MASTER_KEY`, `FISCAL_CORS_ALLOWLIST`,
`INTERNAL_FUNCTION_SECRET`, `LOVABLE_API_KEY`) **não existem** em produção, e
isso é o esperado: as integrações externas permanecem desligadas nesta onda.
A estrutura de comunicação é promovida com os 4 slots de segredo `NULL` e todas
as flags de entrega `false`, verificados por pós-check fail-closed. Nenhum
segredo é criado, copiado, lido por valor ou registrado.
