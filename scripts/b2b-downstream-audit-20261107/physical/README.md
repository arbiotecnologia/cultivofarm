# Reconciliação física local — 07/11/2026

**Somente código e PostgreSQL descartável.** Nenhuma operação hospedada, publicação, NF/cobrança/aprovação contábil real, envio ou delegação. B3 e B4 não foram reabertos nem alterados.

## Causa exata do `ENVASE_RELEASE_DRIFT`

A fonte divergente não foi uma guarda de negócio nem uma mudança de catálogo. O arquivo `stock-envase-recovery-20261027/isolated/release.sql.review` tinha SHA256 `3dd3d226c3437389b54ad31a26769c7a0f5218ff3876fa4259003389403c5493` e terminava com `ENVASE_RELEASE_REVIEW_AND_CONCURRENCY_REQUIRED` + `ROLLBACK`: era o stub pré-matriz, não o release revisado.

`ENVASE_TARGETED=1` retorna antes de `write_release()`, mas `assemble.write()` regravava `release.sql.review` com esse stub. Os pre/postflight preservavam os estados do release anterior, tornando a incompatibilidade determinística.

Correção mínima de compatibilidade:

1. o stub passou a ser gravado em `release-stub.sql.review`;
2. o teste de negação pré-matriz consome o stub;
3. `release.sql.review` só é regravado por `write_release()` após a matriz completa;
4. a preparação do checkpoint de confirmação cria a pasta descartável `/tmp/delivery-confirmation` antes do `pg_dump`.

**Nenhum SQL candidato, pino de catálogo, ACL, grant, policy, trigger ou guard foi removido/afrouxado.** O candidato do ajuste financeiro permanece separado e inativo.

## Resultados executados

| Bateria | Resultado | Evidência |
|---|---:|---|
| Envase completo: CQ, estoque, grants, revogação, concorrência, cooperação, group/cancel, release e rollback | **119/119**, exit 0 | `evidence/envase-full/` |
| Recorte que antes sobrescrevia o release | **21/21**, exit 0 | `evidence/envase-targeted/` |
| Release antes × depois do recorte | **byte-idêntico**, `cmp` exit 0 | `evidence/envase-targeted/release-{before,after}.sha256` |
| Expedição, em rota, comprovante, confirmação, cancelamento, concorrência, replay e rollback | **123/123**, exit 0 | `evidence/confirmation/` e `delivery-atomic-hardening-20261030/confirmation/test-results.json` |
| B4 útil sobre B3 atual | **63/63 preservados**, sem nova instalação | `../b4/evidence-b4-b3.json` |

Release revisado regenerado: SHA256 `ea8083ea5a1f31e29b8ef289021b6c3fedad104bd6044b2cf0b25aef799ba93b`. O stub isolado conserva o hash antigo `3dd3d226…`, agora no arquivo correto. Os pinos pre/postflight são `0b3e5f48162211e7db913d0555875be7b0bdc512e599a1f3863e5f0531a40ebd` e `a84a79c99a5d261a6416c6f6a46d6877981e2dbd882df7e3f9ce90a1010a1dd3`.

A confirmação cobriu Enviar→Confirmar sem segunda baixa de estoque, CAS ausente/stale, replay sem mutação, conflito de payload, isolamento estrangeiro, revogação de perfil/papel/tenant/SaaS durante locks observados, corridas envio/confirmação/cancelamento, lineage de ledger, provas, dois itens sequenciais e rollback deny-only. As 14 tabelas financeiras/fiscais/outbox permaneceram integralmente inalteradas.

## Cobertura e lacunas

- Os 119 e 123 PASS usam **produto biológico fictício em ml** e as tabelas/RPCs canônicas capturadas.
- A cobertura posterior de produto acabado está em `finished-product/`: reprodução 17/17, candidato 19/19 e legado focal 6/6, todos locais. Químicos/fertilizantes em kg/g e apresentações L/ml preservam unidade e embalagem inteira; peso não vira ml. O candidato continua INATIVO/BLOQUEADO, com baseline LIVE, composição B3 e entrada canônica pendentes de revisão.
- Auth/JWT, papéis e Storage são costuras sintéticas locais. Algumas fixtures upstream usam `session_replication_role=replica` somente na montagem ou para simular mudanças; os writers testados executam com os gatilhos habilitados. Isso não prova JWT/RLS/Storage/PostgREST/browser real.
- Releases continuam NO-GO para revisão independente. O grant de writer existente no harness é exclusivamente local e não representa ativação hospedada.
- NF autorizada permanece fixture local sem rede no B4; nenhuma integração fiscal/recebível real foi certificada. Cancelamento de NF após pagamento continua sem decisão e não foi implementado.

## Ajuste financeiro separado

O caminho mínimo para o ajuste `pending→pending` continua exclusivamente em `../02-install.sql.review` com PRE/POST/rollback e pins próprios: escopo `b2b_phase1_order_visible` antes da escrita, lock e reautorização, bloqueio `C2_ACCOUNTING_PENDING` e rollback deny-only. Candidato MD5 `55996e9496ffb123504adaeaa502c81f`, **29/29 local, inativo e não revisado/aplicado em LIVE**. Esta reconciliação física não muda esse pacote.

`diagnosis.json`, `composition-fixes.json`, `results.json`, `composition.patch`, `manifest.json` e `SHA256SUMS` consolidam causas, diffs, origens e hashes. Todo PASS é local e sintético, nunca homologação do fluxo real completo.
