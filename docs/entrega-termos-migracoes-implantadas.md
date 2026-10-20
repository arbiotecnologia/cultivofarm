# entrega_termos — migrações já implantadas (produção `swzpzcwiasxmjutrmvkm`)

Registro documental. **Não reaplicar.** Implantadas pelo auditor via `apply_migration`.

| Quando (UTC) | Migration | Efeito | Verificação |
|---|---|---|---|
| 19/10/2026 23:52 | `termo_pdf_registration_acl_containment` | `REVOKE EXECUTE public.rpc_entrega_registrar_pdf_termo_v1(uuid,text,text) FROM PUBLIC, anon, authenticated`; `REVOKE TRUNCATE public.entrega_termos FROM PUBLIC, anon, authenticated` | has_privilege pós PASS; service_role EXECUTE e authenticated SELECT preservados; 0 termos. Teste DO sob authenticated deu erro de infra (`requestState`) e **não** contou como PASS. |
| 20/10/2026 ~00:50 | `entrega_termos_tenant_isolation_reviewed` (revisão SQL 42c953) | Helper `platform_private.entrega_termo_tenant_ok(uuid)` (DEFINER, ator h15 = entrega = cliente; EXECUTE postgres+authenticated); guards de tenant em gerar/assinar/cancelar; snapshot/cobertura service-only; REFERENCES/TRIGGER/MAINTAIN revogados; policy RESTRICTIVE `entrega_termos_tenant_isolation` usando o helper | Preflight e postflight integrais PASS; policy final com helper privado confirmada. |

## Contenção ACL preservada
O rollback do pacote `scripts/entrega-termos-tenant/rollback.sql.review` **não** regrava o EXECUTE do registrar nem o
TRUNCATE. Reverter o isolamento reabre leitura/RPC entre empresas: só em emergência.

## Pendente
- Edge `entrega-termo-pdf` e frontend do PDF (pacote `scripts/termo-pdf-download/`): candidato final aplicado no
  código, **sem deploy da Edge nem publicação**. Ordem: Edge primeiro, depois frontend.
- Homologação real A/B (incluindo operador_onfarm), sem assinar termo real. Testes locais são sintéticos.
