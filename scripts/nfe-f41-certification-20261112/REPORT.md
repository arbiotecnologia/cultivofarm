# F4.1 — Harness offline de certificação NF-e 55

Execução: `python3 scripts/nfe-f41-certification-20261112/run_harness.py` (requer xmllint, openssl, deno, python3-lxml).
Saída: `evidence/report.json`, `evidence/REPORT-run.md`, `evidence/run.log`, `evidence/signed-synthetic-nfe.xml`.

## Estado encontrado
- Motor já tinha builder (`buildNfeXml.ts`), assinador e verificador próprio (`signNfeXml.ts`, node-forge) e bundle XSD PL_010e_v1.02 com manifesto/hash.
- O verificador do motor reaproveita a mesma canonicalização textual do assinador: não é prova independente.
- Não havia harness F4.1 executável ligando XSD vigente, proveniência e assinatura.

## O que o harness faz
1. Proveniência: SHA-256 dos 5 XSD do PL_010g_v1.03 (baixado do portal nacional em 12/11/2026, publicado 26/10/2026, ZIP `b329ecbe…5eaf`) e do PL_010e embarcado, contra manifestos.
2. Constrói e assina a fixture sintética (emitente/destinatário fictícios, tpAmb=2) com o builder e assinador REAIS via Deno, usando certificado RSA-2048 autoassinado efêmero.
3. Valida offline com xmllint contra PL_010g e PL_010e.
4. Verifica a assinatura de forma independente: C14N 1.0 do libxml2 + SHA-1 + RSA-SHA1 via OpenSSL, conferindo algoritmos, transforms, URI e certificado esperado.
5. Casos negativos (XSD adulterado, valor alterado, SignatureValue adulterado, URI trocada, certificado substituído/inesperado, assinatura ausente, CFOP e tpAmb inválidos, certificado expirado, chave não correspondente).

## Resultado (23 checks; 22 OK, 1 FALHA real)
- OK: proveniência dos dois pacotes; XSD PL_010g e PL_010e da nota assinada; assinatura independente (RSA_SHA1_OK) e do motor; todos os 15 negativos rejeitados.
- **FALHA (lacuna real):** `prov.motor_alinhado_ao_vigente` — o motor usa PL_010e; o vigente é PL_010g. Diferem `leiauteNFe_v4.00.xsd` (ex.: `IE` do destinatário opcional, `vUnComLiq`/`vProdLiq`, `ICMSPrevistoPagtoAntecip`, `vProdLiqTot`, `vNFTot`) e `DFeTiposBasicos_v1.00.xsd` (grupos IBS/CBS, monofasia). A fixture passa nos dois, mas isso não prova conformidade de notas com IBS/CBS ou campos novos.

## Limitações
- Certificado autoassinado: não prova cadeia ICP-Brasil, e-CNPJ A1 real, revogação nem titularidade.
- Sem transmissão: não prova aceitação SEFAZ (regras de negócio/cStat), autorização, protocolo nem QR/DANFE.
- Uma fixture (ICMS20, sem IBS/CBS); chave de acesso sem DV conferido; não cobre NFC-e, eventos ou contingência.
- C14N independente cobre o caso do motor (namespace default só em NFe); deepcopy no lxml evita um artefato `xmlns=""` do subconjunto.
- Nenhum banco, segredo, flag ou gate foi lido/alterado; nada publicado.

## Atualização 12/11/2026 17:3x UTC — motor alinhado ao PL_010g v1.03
- ZIP oficial baixado de novo do portal; SHA-256 `b329ecbe…5eaf` (49 751 bytes) igual ao registrado; os 5 XSD NFe/ conferidos por hash antes de copiar para `supabase/functions/fiscal-xml-engine/xsd/`.
- `xsd/manifest.json` reescrito (PL_010g_v1.03.zip, `supersedes` PL_010e_v1.02.zip); `xsdBundle.ts` regenerado por `scripts/generate-xsd-bundle.mjs`; `XSD_PACKAGE` = `PL_010g_v1.03` e comentários atualizados. NFS-e/eventos não usam este bundle e não mudaram.
- PL_010e preservado em `official/PL_010e` + `manifest-PL_010e.json` só para checagem de compatibilidade.
- Nova fixture `fixtures/synthetic-mg-icms00.json`: MG interna, indFinal=1, indIEDest=9, CFOP 5101, CST 00, orig 0, NCM 48021000, R$1,00; ICMS 18%, PIS 1,65%, COFINS 7,6% SINTÉTICOS. Chave `31261111222333000181550010000000021876543216` (DV 6). A fixture ICMS20 teve o DV corrigido para 8.
- Harness: 66 checks, 0 falhas, 2 divergências de ferramenta. Por fixture: Xerces do motor + libxml2 (PL_010g motor/oficial, PL_010e compat), assinatura independente, DV/coerência da chave, campos da fixture e negativos (assinatura, certificado, URI, DV, cDV, CFOP, tpAmb, NCM, sem Signature, indFinal). Mais certificado expirado e chave errada.
- **Divergência real de ferramenta:** o libxml2 2.15 aceita NCM de 9 dígitos contra o padrão `[0-9]{2}|[0-9]{8}`; o Xerces normativo do motor rejeita. Registrado como KNOWN_TOOL_DEFECT, não como OK.
- Vitest `src/test/fiscal`: 145 arquivos, 2119 aprovados, 4 pulados (já existentes); estáticos config/segurança 48/48.

## Limitações adicionais
- `fiscal_xsd_registry` no banco e Edge publicada continuam no estado anterior: nada foi aplicado/implantado.
- Builder não gera campos novos do PL_010g (vUnComLiq, vProdLiqTot, IBS/CBS): compatível, mas não exercitados.
