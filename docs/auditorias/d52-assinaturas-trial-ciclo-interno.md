# D52 — Assinaturas, trial e ciclo interno

## Decisão

- **Segurança e isolamento:** PASS estrutural.
- **Ciclo interno SaaS:** PASS estrutural; homologação funcional A/B registrada separadamente.
- **Pagamento externo:** BLOCKED / NO-GO. Não existe gateway homologado e nenhum fluxo, webhook ou confirmação simulada foi criado.

## Estado encontrado

- Cinco assinaturas foram preservadas: três `TRIAL`, uma `ACTIVE` e uma `SUSPENDED`.
- As cinco são legadas, sem versão comercial, preço, ciclo e vigência confiáveis.
- Nenhuma delas foi preenchida, recalculada ou migrada por inferência.
- O catálogo tinha 54 vínculos de funcionalidades, todos sem limite numérico definido.

## Implementação

- Versões imutáveis de plano guardam nome, preço, moeda, ciclo, limites, funcionalidades e vigência.
- Assinaturas novas guardam snapshots comerciais e iniciam trial imutável de 14 dias.
- Assinaturas legadas permanecem identificadas e fail-closed até regularização comercial explícita.
- Ações de estado são específicas, idempotentes por correlação e auditadas; não existe seletor arbitrário de status.
- A expiração diária alcança somente trials versionados com data vencida; legado sem data é ignorado.
- Entitlements existem apenas para assinatura versionada em `TRIAL` vigente ou `ACTIVE`; `PAST_DUE`, `SUSPENDED`, `CANCELLED` e `EXPIRED` não liberam módulos.
- Limites quantitativos não foram inventados: sem métrica e valor comercial definidos, a criação adicional deve permanecer bloqueada no fluxo correspondente.

## Segurança

- Escritas usam RPCs `platform_*` com validação server-side de Platform Superadmin, RLS e ticket por transação.
- Identificadores enviados pelo navegador selecionam o alvo, mas nunca concedem autorização.
- Histórico é append-only e registra ator, origem, motivo, ação, estados, planos, versão, snapshots e correlação.
- Nenhuma chave, token, preço ou identidade de homologação aparece neste relatório.

## Pagamento

Pagamento externo permanece **BLOCKED / NO-GO**. Ativação automática por pagamento, checkout, cobrança, webhook, conciliação e reativação financeira exigem integração real posteriormente autorizada e homologada. Falhas ambíguas nunca devem marcar uma assinatura como paga.

## Rollback e forward-fix

- Rollback seguro imediato: desabilitar as ações de interface e o job de expiração, preservando tabelas, snapshots e histórico.
- Não remover colunas, versões ou eventos após uso; correções devem ser migrations aditivas.
- Forward-fix: cadastrar versões comerciais reais por Superadmin e regularizar cada assinatura legada explicitamente, sem inferir valores.