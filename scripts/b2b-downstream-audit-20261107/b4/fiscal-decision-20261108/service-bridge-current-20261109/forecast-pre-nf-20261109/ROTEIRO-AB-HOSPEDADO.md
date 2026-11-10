# Roteiro A/B hospedado — previsão pré-NF, ciclo de vida e leitor financeiro

Status: `REVIEW_ONLY_INACTIVE_NOT_APPROVED`. Este roteiro NÃO autoriza SQL hospedado, publicação, envio, emissão ou cobrança.
Cada etapa exige autorização específica do proprietário e revisão independente aprovada.

## 0. Pré-condições (bloqueantes)
1. Revisão independente aprovada do pacote, com o mesmo hash de `final-manifest-20261110.json` (ver `review-1609-source-hashes.json`).
2. O ref do projeto no painel é `swzpzcwiasxmjutrmvkm`. Se for divergente, PARAR.
3. Gate fiscal/contábil continua pendente: o fluxo financeiro completo permanece NÃO VALIDÁVEL. SEFAZ real fica fora do escopo.
4. `b2b_resale_logistics_gate_v1` permanece como está; este pacote não o abre nem altera.
5. Comunicação/envios OFF (flags `*_DELIVERY_ENABLED=false`).

## 1. Diagnóstico somente leitura (operador)
- Executar `hosted-live-pre-diagnostic.sql.readonly` (BEGIN READ ONLY … ROLLBACK).
- Comparar com o manifesto. Se houver objetos `LIVE` diferentes do pin, PARAR e registrar o drift. `INTERMEDIATE`/`LOCAL_ONLY` presentes antes da instalação → PARAR (instalação paralela desconhecida).
- Não se pede captura LIVE de funções que só existem após etapas locais (leitor, helpers, wrappers, gate próprio).

## 2. Instalação fechada (após revisão; somente com autorização explícita)
Seguir `final-manifest-20261110.json → executable_order`, um estágio por vez: PRE → INSTALL → POST.
- Não reinstalar estágios marcados `ALREADY_PRESENT_VERIFY_ONLY`; apenas rodar o PRE/diagnóstico.
- Se qualquer PRE falhar, PARAR sem tentar de novo nem trocar o pin.
- Resultado esperado: gate lifecycle `enabled=false`, allowlist com zero linhas, wrappers só para `authenticated`, helpers privados sem grants, leitor só para `authenticated`.

## 3. Sessões reais A/B — doações zero (sem concessão de negócio)
Usar contas já existentes criadas pelos fluxos normais da interface. Sem criar contas, papéis, ou grants por SQL.
- **A** = financeiro/administrador ARBio (empresa vendedora).
- **B** = usuário de outra empresa (FSF ou comprador).

| # | Sessão | Ação (via API autenticada do app, sem botão novo) | Esperado |
|---|---|---|---|
| 1 | A | `get_b2b_financial_forecast_secure` em pedido próprio | leitura própria ou indisponível; nunca de outra empresa |
| 2 | B | mesmo pedido de A | negado/vazio |
| 3 | A | `rpc_b2b_forecast_fiscal_sync_v1` / `cancel_residual_v1` com gate fechado | `42501 B2B_FORECAST_*` |
| 4 | B | idem | `42501` |
| 5 | A | `rpc_receivable_money_projection_v1` título próprio (financeiro/gestor/admin) | linhas próprias |
| 6 | B | título de A | `42501 MONEY_ORIGIN_ACCESS_DENIED` |
| 7 | anon | qualquer RPC acima | `permission denied` |
| 8 | A | registrar pagamento (fluxo existente) | inalterado, sem envio |

Evidência: capturas de tela sanitizadas e IDs com hash. Nunca coletar senha, token, cookie ou JWT.

## 3b. Previsão fora do piloto (cf7d5fb/214)

Depois do estágio 3, `b2b_forecast_creation_gate_v1` deve estar `enabled=false` e a allowlist vazia (o POST verifica). Aprovações reais nas sessões A/B não devem criar previsão. Uma concessão de criação só vale para um pedido sintético AR Bio, com autorização própria. A guarda B4 `respond` espera `97bcdb98…`; se vier `4926a99c…` ou qualquer outro valor, PARE.

## 4. Piloto restrito ARBio (fase separada, só com nova autorização)
- Inserir allowlist apenas por processo administrativo revisado: ator, organização ARBio, parceiro, pedido e operação exatos, `synthetic=true`, com validade curta. Ligar o gate lifecycle só na janela de teste.
- Outros tenants não mudam: as linhas da allowlist exigem `organization_id` exato e o gate não concede nada sem linha.
- Revogar (`revoked_at`) e desligar o gate ao fim. Histórico preservado.

## 5. Rollback
Arquivos `04/08/12/16` são deny-only: revogam grants, desligam o gate e revogam a allowlist. Nunca restauram corpo vulnerável nem apagam histórico ou previsões.

## Limites
Provas locais usam PostgreSQL descartável e Auth sintética. Não certificam JWT/RLS/Storage hospedado. A UI atual só lê a previsão; não existe fluxo real completo de SYNC/CANCEL/leitor.
