# Isolamento REST/RPC com sessões reais — somente leitura (2026-10-29 21:10Z)

Ferramenta: `api-isolation-readonly.js`. O **titular** cola no console do navegador já logado em
`https://app.cultivofarm.com.br`. Só faz GET com contagem (`Range: 0-0`); não chama RPC que grava, não envia
token a terceiros nem o imprime. Saída: status HTTP, contagens e prefixo SHA-256 do ator. Colar só essa saída.
Nunca enviar senha, token, cookie ou JWT ao assistente.

SQL privilegiado ou harness local **não prova** JWT/RLS; só esta saída por sessão real conta, e resultado ausente = NOT RUN.

## Identidades (tenant FSF ≠ parceiro comercial FSF dentro da AR Bio)

| Sessão | Auth | Organização | Papel informado |
|---|---|---|---|
| A — arbiotecnologia@gmail.com | (titular) | AR Bio `007bb519…` | interno AR Bio |
| F1 — rh@refilinformatica.com.br | `e2ddcd4f…` | tenantFSF `8f57c7dd…` | só administrador, 0 partner_users |
| F2 — renato_cunha22@hotmail.com | `cbdc4ef3…` | tenantFSF `8f57c7dd…` | admin antigo, preservado |
| T4 — teste4@refilinformatica.com.br | `beb25695…` | AR Bio (exclusivo; não migrar) | comprador ligado ao parceiro TESTE AUDITORIA `7e52de9a…` |
| T2 — teste2@ | — | AR Bio | — |

Parceiro comercial FSF dentro da AR Bio: `4a7e37e0…` (partner_accounts). Não é a organização tenantFSF.

## Controles esperados

| Rótulo | A (AR Bio) | F1/F2 (tenantFSF) | T4 (comprador AR Bio) |
|---|---|---|---|
| own_profile | 1 (positivo) | 1 (positivo) | 1 |
| org_arbio_row | 1 | **0** (negativo) | 1 ou 0 conforme política própria; nunca tenantFSF |
| org_tenant_fsf_row | **0** | 1 | **0** |
| partners_owned_by_arbio | ≥1 | **0** | ≤1 (somente o próprio) |
| partner_fsf_in_arbio | 1 | **0** | **0** (ligado a outro parceiro) |
| partner_teste_auditoria | 1 | **0** | 1 |
| orders_partner_fsf / receivables_partner_fsf / fin_settings_partner_fsf | conforme dados (0 pedidos/0 títulos relatados) | **0** | **0** |
| clientes_org_arbio | ≥0 | **0** | conforme vínculo |
| clientes_org_tenant_fsf | **0** | 3 (positivo, igual UI) | **0** |
| partner_users_self | 0 | 0 (F1 relatado) | 1 (parceiro TESTE AUDITORIA) |

Qualquer contagem positiva em célula **0** = FAIL de isolamento; HTTP 401/403 em controle positivo = sessão inválida (NOT RUN, não PASS).
Divergência do T4 (parceiro TESTE AUDITORIA em vez de FSF) é pendência de cadastro registrada; não transferir/renomear/mudar papéis.

## Fora do escopo desta leitura

Aprovação de crédito, pedidos, títulos, NF, boleto e qualquer RPC de escrita. A aprovação integrada foi ensaiada só
em PostgreSQL descartável (`docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-integrated-2110/`).
