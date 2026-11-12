# F4.1 — execução 2026-11-12T17:31:09.992199+00:00

Total 23, falhas 1.

| Caso | Esperado | Observado | Resultado | Detalhe |
|---|---|---|---|---|
| prov.PL_010g_vigente.sha256 | PASS | PASS | OK | Schemas XML NF-e - Pacote de Liberação nº 010g v.1.03 - NT 2026.006 v.1.00 e NT 2026.008 v |
| prov.PL_010e_motor.sha256 | PASS | PASS | OK | Schemas XML NF-e - 010e_v.1.02 - NT 2025.002 v.1.40, NT 2026.002 v.1.0 e NT 2026.003 v.1.0 |
| prov.motor_alinhado_ao_vigente | PASS | REJECT | FAIL | difere: ['DFeTiposBasicos_v1.00.xsd', 'leiauteNFe_v4.00.xsd'] |
| neg.prov.xsd_adulterado | REJECT | REJECT | OK | ['leiauteNFe_v4.00.xsd'] |
| pos.motor.verifyNfeSignature | PASS | PASS | OK | {'valid': True, 'digestMatches': True, 'signatureMatches': True, 'referenceUri': '#NFe5126 |
| pos.tpAmb_homologacao | PASS | PASS | OK | tpAmb=2 |
| pos.xsd.PL_010g_vigente | PASS | PASS | OK | /tmp/f41-nzsmbm6z/signed.xml validates |
| pos.xsd.PL_010e_motor | PASS | PASS | OK | /tmp/f41-nzsmbm6z/signed.xml validates |
| pos.sig.independente_libxml2_openssl | PASS | PASS | OK | RSA_SHA1_OK |
| neg.sig.valor_alterado_infNFe | REJECT | REJECT | OK | DIGEST_MISMATCH |
| neg.sig.valor_alterado_infNFe.motor | REJECT | REJECT | OK | SIGNATURE_DIGEST_MISMATCH |
| neg.sig.signaturevalue_adulterado | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| neg.sig.signaturevalue_adulterado.motor | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| neg.sig.uri_referencia_trocada | REJECT | REJECT | OK | REFERENCE_URI_MISMATCH |
| neg.sig.uri_referencia_trocada.motor | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| neg.sig.certificado_substituido | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| neg.sig.certificado_nao_esperado | REJECT | REJECT | OK | CERT_NOT_EXPECTED |
| neg.xsd.sem_signature | REJECT | REJECT | OK | /tmp/f41-nzsmbm6z/nosig.xml fails to validate |
| neg.sig.ausente | REJECT | REJECT | OK | SIGNATURE_COUNT_0 |
| neg.xsd.cfop_invalido | REJECT | REJECT | OK | /tmp/f41-nzsmbm6z/badcfop.xml fails to validate |
| neg.xsd.tpAmb_invalido | REJECT | REJECT | OK | /tmp/f41-nzsmbm6z/badamb.xml fails to validate |
| neg.sign.certificado_expirado | REJECT | REJECT | OK | CERTIFICATE_EXPIRED |
| neg.sign.chave_nao_corresponde | REJECT | REJECT | OK | CERTIFICATE_KEY_MISMATCH |
