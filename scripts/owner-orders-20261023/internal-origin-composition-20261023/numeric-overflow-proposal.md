# Proposta separada — capacidade do percentual de crédito

**Não integrada ao candidato de origem, não aplicada e não autoriza reabertura.**

Função capturada: `public.fn_b2b_credit_exposure(uuid,numeric,uuid)`, MD5 `3bcc92e68f80b86bc01db7b5e94ee4c6`, owner postgres, ACL postgres/service_role somente. Fonte imutável: `baseline/public.fn_b2b_credit_exposure.sql` e `baseline/pricing.json`.

Com limite **1**, exposição projetada **180**, a fórmula gera **18000,00%**. A variável `v_pct numeric(6,2)` admite apenas 9999,99: ocorre SQLSTATE **22003** antes da decisão financeira. Testes reproduzem a exceção na função capturada e rollback completo pelo create real local.

Alteração mínima proposta, em revisão financeira própria:

```diff
- v_proj numeric(14,2); v_disp numeric(14,2); v_pct numeric(6,2);
+ v_proj numeric(14,2); v_disp numeric(14,2); v_pct numeric;
```

`numeric` sem precisão fixa evita escolher um teto arbitrário sem conhecer os limites suportados. Manter integralmente fórmula `ROUND(...,2)`, limites/exposição, ordem das decisões, ações, JSON, assinatura, owner/ACL e callers. Não truncar, limitar percentual nem alterar limite financeiro para obter PASS.

Experimento exclusivamente transacional no PostgreSQL descartável substitui essa única declaração, confirma **18000% / exposição180 / LIMIT_EXCEEDED_BLOCK** e faz ROLLBACK, verificando MD5 original reinstalado. O candidato principal e seu PRE/POST continuam exigindo a função original com o bloqueio conhecido.

Antes de qualquer aplicação independente: PRE byte-exato de corpo/owner/ACL/callers; POST do novo corpo com decisão block e approval_required, casos sem limite/dentro do limite/vencidos, limites extremos e payloads inválidos; rollback deve manter writer contido e nunca abrir ACL. Esta proposta não é uma migration pronta nem uma certificação financeira integral.