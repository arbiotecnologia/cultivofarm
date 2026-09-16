# Identidade visual por portal — pendência de banco

Alvo único: `swzpzcwiasxmjutrmvkm`. O canal de banco disponível no ambiente Lovable
aponta para outro projeto, portanto **nada foi executado aqui**.

## Como aplicar (na máquina do operador)

```bash
psql "$CULTIVOFARM_DSN" -X -v ON_ERROR_STOP=1 \
  -f restoration/branding-portais/20261028000000_tenant_portal_branding_v1.sql
```

Antes: confirmar que o DSN contém `swzpzcwiasxmjutrmvkm` e que o backup/PITR está ativo.
O script é idempotente e roda em uma única transação.

## O que ele cria

- `marca_nome`, `marca_logo_url`, `marca_cor_primaria` em `clientes` e `partner_accounts`,
  com validação de tamanho (2–80) e cor `#RRGGBB`.
- `save_client_portal_branding` — exige vínculo ativo e vigente em `user_clientes`.
- `save_partner_portal_branding` — exige papel `gestor` em parceiro ativo.
- Upload no bucket `logos` restrito às pastas `clientes/<id>/` e `parceiros/<id>/`.

## Depois de aplicado

Avise para que a tela de autoatendimento nos portais do produtor e do parceiro
(nome, logo e cor) seja implementada sobre essas funções.
