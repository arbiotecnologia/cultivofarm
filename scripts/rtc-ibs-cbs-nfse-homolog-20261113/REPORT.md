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

## 2026-11-13 20:50 — Consulta de envio pendente e sincronização do validador
- Nota ed5180f3…: ledger com UMA transmissão 07810b10-a70c-4e7f-90c9-a3489e15b1ed, HOMOLOGATION, SENT/PENDING, sem chave (leitura somente leitura).
- Tela Serviços: se houver transmissão indeterminada da própria nota (SENT/SENDING, PENDING ou RECONCILIATION_REQUIRED, sem chave), mostra só "Consultar envio pendente" (Edge `action:"reconcile"` + `transmission_id` do ledger → apenas GET mTLS DPS/NFS-e). "Enviar NFS-e" e "Reaplicar perfil" ficam ocultos; servidor (`rpc_nfse_transmit_begin_v1`) continua recusando nova transmissão com PENDING/SENT/RECONCILIATION_REQUIRED.
- Edge `nfse-nacional-emit` não foi alterada nem reimplantada; nada aplicado no banco por esta etapa.
- `live-capture/rpc_fiscal_draft_save.live.sql`: captura textual do corpo live ajustado pelo operador (md5 live `1b667dee72793e7bb37f76734cc477ad`); NFS-e aceita `ibs_cbs` só se idêntico a `service_fiscal_profiles.ibs_cbs_configuration` ativo da organização do ator (`service_ibs_cbs_profile_mismatch`). Não é migração a reaplicar.
- Testes: vitest services+IBS/CBS 57/57 (inclui `src/test/services/nfsePendingReconcile.test.ts` 5/5); offline Deno 19/19 sem rede; XMLs regenerados por `bun gen_xml.ts`; XSD: NF-e interna/interestadual CST000 e interna CST410 válidas no PL_010g original; DPS homologação válida no XSD original 20/10/2026; DPS produção só com âncora corrigida.

## 2026-11-13 20:58 — Três lacunas concluídas (migração 03 APLICADA)
- `migration/03_micro_billing_xml_prepare.sql` aplicada no projeto canônico, com PRE pins md5 (create_draft `adaa8f2e…`, xml_prepare `90424a27…`) e ACL preservada. POST: create_draft `d14e40e6…`, xml_prepare `b9920ec1…`.
- Microrganismo: coluna `microorganism_fiscal_profiles.ibs_cbs_configuration` (default `{}`), RPCs `rpc_fiscal_microorganism_ibs_cbs_get/save` (global → superadmin; próprio → admin/financeiro da dona; CAS). Cartão IBS/CBS no editor de microrganismo (`FiscalProdutos.tsx`, kind `microorganism`).
- Faturamento novo: `rpc_service_billing_create_draft_v1` copia `ibs_cbs` do perfil ativo do serviço ao snapshot do item (validador do rascunho exige identidade).
- NF-e real: `rpc_fiscal_xml_prepare_v1` (continua só homologação) inclui `det[].ibsCbsConfig` resolvido no servidor por `platform_private.fiscal_nfe_item_ibs_cbs_config_v1` (produto ou microrganismo ligado; divergência bloqueia; outra empresa ignorada) e `ide.rtcIbsCbs=true` só quando algum item tem perfil. Sem perfil, payload idêntico ao anterior. O snapshot fica congelado em `fiscal_xml_runs.payload`. Nenhuma transmissão.
- Rascunho/transmissão da consultoria (ed5180f3…, 07810b10… SENT/PENDING) não tocados.
- Testes: PG descartável `run_pg.sh` 7/7 (stubs; não prova RLS/JWT); `src/test/fiscal/nfePrepareIbsCbsContract.test.ts` 5/5; bateria fiscal+serviços 2.249 aprovados, 4 ignorados; typecheck OK.

## 2026-11-13 21:12 — Diagnóstico seguro da consulta e pré-visualização NF-e
- Edge `nfse-nacional-emit` reimplantada (source sha256 `8bead50d…`). `action:"reconcile"` devolve `diagnostic {stage, result, httpStatus, runtime{createHttpClient, denoVersion}}` — etapas dps_lookup/nfse_download/before_http; resultados certificate_unavailable, mtls_unavailable, mtls_client_rejected, timeout, tls_error, network_error, redirect_blocked, authorization_denied, not_found, server_error, unexpected_status, unexpected_format. Sem URL/id, corpo, XML, mensagem bruta ou credenciais. Gates, CAS, ledger e bloqueio de reenvio inalterados. Toast da tela Serviços mostra o diagnóstico.
- Deno.createHttpClient: docs oficiais e Deno ≥1.41/2.x usam `cert`/`key` PEM (certChain/privateKey removidos na 1.41); API estável no 2.x; Supabase Edge Runtime a expõe desde PR #515. O código já usava `cert`/`key` — sem defeito de nomes demonstrado. Corrigido: falha ao criar o cliente mTLS agora é capturada e classificada (antes escapava sem categoria). Verificação do servidor nunca desligada. Runtime hospedado não confirmado por nós (o campo `runtime` do diagnóstico o confirmará na próxima consulta do operador).
- Pré-visualização NF-e: aba Homologação fiscal → "Pré-visualizar NF-e com IBS/CBS". Usa buildNfeXml do backend, classificação real do catálogo (leituras existentes) e partes/valores fictícios; não reserva número, não grava, não transmite; nenhuma RPC nova.
- Evidência: XMLs da mesma função da UI em `evidence/preview/` validados no PL_010g original (assinatura placeholder estrutural): interna idDest 1/CFOP 5102/MG→MG e interestadual idDest 2/CFOP 6102/MG→SP, ambos com IBSCBS (`evidence/preview/xsd-preview-result.json`). Sessão autenticada indisponível no sandbox (projeto externo), UI não exercida com login.
