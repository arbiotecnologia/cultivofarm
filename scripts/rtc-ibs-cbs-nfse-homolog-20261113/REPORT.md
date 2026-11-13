# IBS/CBS ponta a ponta + exceção de envio NFS-e (homologação AR) — 2026-11-13

## Implantado (produção do projeto swzpzcwiasxmjutrmvkm, backend)
- Migração 01: `platform_private.nfse_homolog_send_allowlist` (sem acesso de cliente), `public.rpc_nfse_homolog_send_allowed_v1(uuid,uuid)` (só service_role) e `rpc_service_billing_reapply_profile_v1` copiando `ibs_cbs` ao snapshot do item (PRE md5 136791c1…, POST 3d464ef1…; ACL preservada).
- Migração 02: uma linha na allowlist — organização 007bb519… (AR BIOTECNOLOGIA LTDA), emitente 7a52fb16…
- Edge `nfse-nacional-emit` (source sha256 20c06fd5…).
- NÃO implantado: frontend (sem publicação), `rpc_service_billing_create_draft_v1` (novos faturamentos não copiam IBS/CBS; usar "Reaplicar perfil"), `rpc_fiscal_xml_prepare_v1` (NF-e real não envia `ibsCbsConfig`), IBS/CBS para microrganismos (sem coluna/RPC).

## XSD (evidence/xsd-result.json)
- NF-e interna CST 000, interestadual CST 000 (UF destino) e interna CST 410: PL_010g original — válidos (assinatura placeholder estrutural).
- DPS homologação com IBSCBS: pacote produção restrita 20/10/2026 original — válida.
- DPS produção: original rejeita (defeito conhecido da âncora de série); cópia com âncora corrigida — válida.
