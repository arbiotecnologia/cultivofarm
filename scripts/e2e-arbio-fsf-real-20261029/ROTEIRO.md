# Roteiro E2E AR Bio / FSF (preparação — NÃO executado)

## Modos (nunca misturar)
- **PROD_READONLY** — ref `swzpzcwiasxmjutrmvkm`, apenas leitura/navegação; sem criar, aprovar ou alterar nada.
- **HOMOLOG_ISOLATED** — ref `vrlcdwmlytukrjezrrnf` (ou outro aprovado por evidência); rejeita produção; fixtures sintéticas marcadas e saídas externas OFF.
`preflight.sh` é um **validador de evidência fornecida**: não acessa rede, banco nem credenciais e não verifica o runtime. Ele confere por igualdade exata o JSON descrito em `evidencia-preflight.schema.md` (URL observada, ref observado, commit de 40 hex, modo, 5 saídas, automações NF/SEFAZ/boleto/auto-recebível e conferência humana). Declarar um ref não prova para onde o app aponta.
Resultado por escopo: `PREFLIGHT_RESULT READONLY=… WRITE_SCENARIOS=…`. Produção é sempre só READONLY (escrita = DENY). Escrita em homolog só é GO com schema, massa, automações bloqueadas e acessos confirmados; hoje fica BLOCKED. Chave repetida/contraditória, saída ligada, ref/URL de produção em homolog, modo/escopo ausente, falta de `rg` ou raiz errada = DENY. A versão é a observada em execução, nunca o HEAD local; este roteiro não orienta publicar nem republicar produção.

## Estado conhecido (leitura confirmada pelo proprietário)
- Produção: Renato Cunha = administrador ativo da organização AR Bio; Fagner Furtado = administrador ativo da organização FSF Agro; parceiro FSF tem **0 partner_users** (ninguém tem portal de parceiro FSF). Administrador da organização FSF ≠ portal do parceiro FSF.
- Homologação: só a organização "FSF Agro HOMOL" `dcf50a75-579a-4828-a0fc-1d8eadcb4b8a`; nenhuma AR Bio, nenhum profile nessas organizações, partner_users 0.

## Pré-requisitos NÃO executados (não criar nem conceder aqui)
- PR1: JSON de evidência preenchido e conferido por pessoa (URL, ref observado, commit). PR2: 5 saídas OFF e, para escrita, automações NF/SEFAZ/boleto/auto-recebível OFF.
- PR3 (homolog): organização AR Bio, profiles A/F e vínculos de parceiro — inexistentes; sem eles a Parte HOMOLOG fica BLOCKED.
- PR4 (homolog): prova de que automações de recebível (`trg_auto_b2b_receivable`, `tg_sync_b2b_financial_status`, entrega→AR) não geram título antes do fiscal; sem prova, H5/H6 ficam NÃO EXECUTÁVEIS.
- PR5: contrato de Storage definido (URL assinada válida até expirar é comportamento autorizado; a negativa vale só para pedido NOVO de URL/objeto de outra organização).
- Ninguém envia senha/token ao auditor; cada pessoa entra na própria sessão.

## Parte 1 — até o bloqueio fiscal | Parte 2 — financeiro completo
Parte 2 (título→parcelas→pagamento→estorno reais) é **NÃO VALIDÁVEL** enquanto contabilidade/fiscal estiverem pendentes; registrar BLOCKED, nunca PASS.

## Negações cruzadas
Somente com fixtures do ambiente isolado e pela API legítima da tela (lista/detalhe por ID da fixture de outra organização). Nunca usar IDs de terceiros em produção. Redirecionamento de rota NÃO conta como prova de isolamento.
