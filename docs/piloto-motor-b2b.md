# Piloto Operacional — Motor B2B AR Bio (Fluxo A à vista)

**Objetivo:** validar em produção o Fluxo A (pedido à vista/antecipado) com 1 parceiro real antes de liberar planos safra.

**Escopo:** apenas plano `à vista / antecipado (7 dias)`. Planos safra permanecem desabilitados no seletor até conclusão do piloto.

**Duração sugerida:** 5 dias úteis, 3 a 5 pedidos reais de baixo valor.

---

## 1. Pré-requisitos (D-1)

- [ ] Parceiro-piloto selecionado (perfil `parceiro_comercial`, com pelo menos 1 cliente ativo).
- [ ] Confirmar que `simulate_b2b_payment_plan_secure` e `create_partner_order_secure` estão nas versões consolidadas (migrations `20260707220218` → `20260707222533`).
- [ ] Confirmar no seletor de planos que apenas `à vista` está marcado como recomendado ao parceiro-piloto (planos safra ficam visíveis mas com aviso).
- [ ] Comercial + Financeiro alinhados sobre canal único de suporte (WhatsApp/Slack) durante o piloto.
- [ ] Backup lógico dos snapshots atuais (opcional):
  ```sql
  SELECT count(*) FROM partner_order_payment_terms;
  SELECT count(*) FROM partner_order_payment_schedule;
  ```

## 2. Checklist por pedido do piloto (parceiro)

1. Login no Portal Parceiro.
2. Acessar `/portal-parceiro/catalogo` e adicionar 1 item de baixo valor.
3. Clicar **Continuar para condição de pagamento**.
4. Selecionar plano **À vista / antecipado (7 dias)**.
5. Conferir no `PaymentSimulationSummary`:
   - Valor de tabela = preço lista × quantidade
   - Desconto comercial aplicado
   - Base líquida = tabela − desconto
   - Total final = base líquida (sem juros à vista)
   - Parcelas = 1
6. Clicar **Enviar pedido para análise** e anotar número do pedido.

## 3. Checklist por pedido (comercial/financeiro)

- [ ] Pedido aparece em `/comercial/pedidos-b2b` com plano correto.
- [ ] `partner_order_payment_terms` tem snapshot com `requires_credit_approval = false`.
- [ ] `partner_order_payment_schedule` tem 1 parcela com vencimento = hoje + 7 dias.
- [ ] AR pode ser gerada sem bloqueio (não exige aprovação financeira).
- [ ] Valores do AR batem com o snapshot (nenhum recálculo divergente).

Query rápida de conferência:
```sql
SELECT po.numero_pedido, pot.total_final, pot.requires_credit_approval,
       (SELECT count(*) FROM partner_order_payment_schedule s WHERE s.order_id = po.id) AS parcelas
FROM partner_orders po
JOIN partner_order_payment_terms pot ON pot.order_id = po.id
WHERE po.created_at >= now() - interval '7 days'
ORDER BY po.created_at DESC;
```

## 4. Critérios de aprovação do piloto

Piloto **aprovado** se, ao final:

- 100% dos pedidos gravaram `partner_order_payment_terms` + `partner_order_payment_schedule`.
- 0 pedidos criados sem `payment_plan_id`.
- 0 divergências entre snapshot e AR gerado.
- 0 chamados críticos abertos pelo parceiro.
- Feedback qualitativo positivo do parceiro sobre clareza da simulação.

## 5. Critérios de rollback

Acionar rollback **imediato** se qualquer um ocorrer:

- Pedido criado sem snapshot financeiro (`partner_order_payment_terms` ausente).
- AR gerado com valor divergente do snapshot.
- Erro 500/timeout recorrente em `simulate_b2b_payment_plan_secure`.
- Duplicidade de parcelas em `partner_order_payment_schedule`.
- Parceiro conseguiu enviar pedido sem selecionar plano.

## 6. Procedimento de rollback

1. **Bloquear novos pedidos do piloto** desativando temporariamente o parceiro-piloto (`partner_accounts.status = 'suspenso'`).
2. **Comunicar** comercial/financeiro pelo canal único.
3. **Cancelar pedidos afetados** via tela admin (`status = 'cancelado'`, com justificativa "rollback piloto").
4. **Estornar AR** eventualmente gerado indevidamente.
5. **Abrir issue** com: número do pedido, snapshot esperado vs real, logs da RPC.
6. **Não reverter migrations** sem análise — as RPCs são idempotentes e o rollback é operacional, não estrutural.

## 7. Encerramento (D+5)

- [ ] Consolidar métricas: nº de pedidos, ticket médio, tempo médio parceiro→AR, incidentes.
- [ ] Reunião comercial + financeiro + tech para decisão: **liberar plano safra** ou **estender piloto**.
- [ ] Registrar aprendizados em `docs/piloto-motor-b2b-retro.md`.

## 8. Próximas fases (pós-piloto aprovado)

1. Habilitar plano safra para o mesmo parceiro-piloto por mais 5 dias.
2. Validar fluxo de aprovação financeira (Fluxo B) e reprovação (Fluxo C).
3. Rollout gradual: +3 parceiros/semana até cobertura total.
