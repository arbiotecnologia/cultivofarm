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
