# F4.1 — execução 2026-11-12T17:35:57.374732+00:00

Total 66, falhas 0, divergências de ferramenta registradas 2.

| Caso | Esperado | Observado | Resultado | Detalhe |
|---|---|---|---|---|
| prov.PL_010g_vigente.sha256 | PASS | PASS | OK | Schemas XML NF-e - Pacote de Liberação nº 010g v.1.03 - NT 2026.006 v.1.00 e NT 2026.008 v |
| prov.motor_manifesto.sha256 | PASS | PASS | OK | Schemas XML NF-e - Pacote de Liberação nº 010g v.1.03 - NT 2026.006 v.1.00 e NT 2026.008 v |
| prov.PL_010e_arquivo_compat.sha256 | PASS | PASS | OK | Schemas XML NF-e - 010e_v.1.02 - NT 2025.002 v.1.40, NT 2026.002 v.1.0 e NT 2026.003 v.1.0 |
| prov.motor_manifesto_pacote_vigente | PASS | PASS | OK | PL_010g_v1.03.zip |
| prov.motor_alinhado_ao_vigente | PASS | PASS | OK | 5/5 idênticos |
| neg.prov.xsd_adulterado | REJECT | REJECT | OK | ['leiauteNFe_v4.00.xsd'] |
| icms20_mt.pos.motor.verifyNfeSignature | PASS | PASS | OK | {'valid': True, 'digestMatches': True, 'signatureMatches': True, 'referenceUri': '#NFe5126 |
| icms20_mt.pos.chave_dv_coerente | PASS | PASS | OK | DV=8 |
| icms20_mt.pos.xsd.xerces_motor_PL_010g | PASS | PASS | OK | PL_010g_v1.03 xerces-wasm@2.0.1 [] |
| icms20_mt.pos.xsd.libxml2_motor_PL_010g | PASS | PASS | OK | /tmp/f41-e2lpy4bq/icms20_mt.xml validates |
| icms20_mt.pos.xsd.oficial_PL_010g | PASS | PASS | OK | /tmp/f41-e2lpy4bq/icms20_mt.xml validates |
| icms20_mt.pos.xsd.compat_PL_010e | PASS | PASS | OK | /tmp/f41-e2lpy4bq/icms20_mt.xml validates |
| icms20_mt.pos.sig.independente_libxml2_openssl | PASS | PASS | OK | RSA_SHA1_OK |
| icms20_mt.neg.sig.valor_alterado_infNFe | REJECT | REJECT | OK | DIGEST_MISMATCH |
| icms20_mt.neg.sig.valor_alterado_infNFe.motor | REJECT | REJECT | OK | SIGNATURE_DIGEST_MISMATCH |
| icms20_mt.neg.sig.signaturevalue_adulterado | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| icms20_mt.neg.sig.signaturevalue_adulterado.motor | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| icms20_mt.neg.sig.uri_referencia_trocada | REJECT | REJECT | OK | REFERENCE_URI_MISMATCH |
| icms20_mt.neg.sig.uri_referencia_trocada.motor | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| icms20_mt.neg.sig.certificado_substituido | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| icms20_mt.neg.sig.certificado_nao_esperado | REJECT | REJECT | OK | CERT_NOT_EXPECTED |
| icms20_mt.neg.xsd.sem_signature.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| icms20_mt.neg.xsd.sem_signature.libxml2 | REJECT | REJECT | OK | /tmp/f41-e2lpy4bq/v4.xml fails to validate |
| icms20_mt.neg.sig.ausente | REJECT | REJECT | OK | SIGNATURE_COUNT_0 |
| icms20_mt.neg.xsd.cfop_invalido.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| icms20_mt.neg.xsd.cfop_invalido.libxml2 | REJECT | REJECT | OK | /tmp/f41-e2lpy4bq/v5.xml fails to validate |
| icms20_mt.neg.xsd.tpAmb_invalido.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| icms20_mt.neg.xsd.tpAmb_invalido.libxml2 | REJECT | REJECT | OK | /tmp/f41-e2lpy4bq/v6.xml fails to validate |
| icms20_mt.neg.xsd.ncm_9_digitos.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| icms20_mt.neg.xsd.ncm_9_digitos.libxml2 | - | - | KNOWN_TOOL_DEFECT | libxml2 aceitou o que o Xerces normativo rejeitou: /tmp/f41-e2lpy4bq/v7.xml validates |
| icms20_mt.neg.xsd.ncm_letra.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| icms20_mt.neg.xsd.ncm_letra.libxml2 | REJECT | REJECT | OK | /tmp/f41-e2lpy4bq/v8.xml fails to validate |
| icms20_mt.neg.chave_dv_incorreto | REJECT | REJECT | OK | KEY_DV_INVALID |
| icms20_mt.neg.chave_cDV_divergente | REJECT | REJECT | OK | KEY_IDE_MISMATCH |
| mg_icms00.pos.motor.verifyNfeSignature | PASS | PASS | OK | {'valid': True, 'digestMatches': True, 'signatureMatches': True, 'referenceUri': '#NFe3126 |
| mg_icms00.pos.chave_dv_coerente | PASS | PASS | OK | DV=6 |
| mg_icms00.pos.campos_fixture | PASS | PASS | OK | campos conferidos |
| mg_icms00.pos.xsd.xerces_motor_PL_010g | PASS | PASS | OK | PL_010g_v1.03 xerces-wasm@2.0.1 [] |
| mg_icms00.pos.xsd.libxml2_motor_PL_010g | PASS | PASS | OK | /tmp/f41-e2lpy4bq/mg_icms00.xml validates |
| mg_icms00.pos.xsd.oficial_PL_010g | PASS | PASS | OK | /tmp/f41-e2lpy4bq/mg_icms00.xml validates |
| mg_icms00.pos.xsd.compat_PL_010e | PASS | PASS | OK | /tmp/f41-e2lpy4bq/mg_icms00.xml validates |
| mg_icms00.pos.sig.independente_libxml2_openssl | PASS | PASS | OK | RSA_SHA1_OK |
| mg_icms00.neg.sig.valor_alterado_infNFe | REJECT | REJECT | OK | DIGEST_MISMATCH |
| mg_icms00.neg.sig.valor_alterado_infNFe.motor | REJECT | REJECT | OK | SIGNATURE_DIGEST_MISMATCH |
| mg_icms00.neg.sig.signaturevalue_adulterado | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| mg_icms00.neg.sig.signaturevalue_adulterado.motor | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| mg_icms00.neg.sig.uri_referencia_trocada | REJECT | REJECT | OK | REFERENCE_URI_MISMATCH |
| mg_icms00.neg.sig.uri_referencia_trocada.motor | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| mg_icms00.neg.sig.certificado_substituido | REJECT | REJECT | OK | SIGNATURE_VALUE_MISMATCH |
| mg_icms00.neg.sig.certificado_nao_esperado | REJECT | REJECT | OK | CERT_NOT_EXPECTED |
| mg_icms00.neg.xsd.sem_signature.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| mg_icms00.neg.xsd.sem_signature.libxml2 | REJECT | REJECT | OK | /tmp/f41-e2lpy4bq/v12.xml fails to validate |
| mg_icms00.neg.sig.ausente | REJECT | REJECT | OK | SIGNATURE_COUNT_0 |
| mg_icms00.neg.xsd.cfop_invalido.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| mg_icms00.neg.xsd.cfop_invalido.libxml2 | REJECT | REJECT | OK | /tmp/f41-e2lpy4bq/v13.xml fails to validate |
| mg_icms00.neg.xsd.tpAmb_invalido.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| mg_icms00.neg.xsd.tpAmb_invalido.libxml2 | REJECT | REJECT | OK | /tmp/f41-e2lpy4bq/v14.xml fails to validate |
| mg_icms00.neg.xsd.ncm_9_digitos.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| mg_icms00.neg.xsd.ncm_9_digitos.libxml2 | - | - | KNOWN_TOOL_DEFECT | libxml2 aceitou o que o Xerces normativo rejeitou: /tmp/f41-e2lpy4bq/v15.xml validates |
| mg_icms00.neg.xsd.ncm_letra.xerces_motor | REJECT | REJECT | OK | PL_010g_v1.03 xerces-wasm@2.0.1 ['XSD_INVALID'] |
| mg_icms00.neg.xsd.ncm_letra.libxml2 | REJECT | REJECT | OK | /tmp/f41-e2lpy4bq/v16.xml fails to validate |
| mg_icms00.neg.chave_dv_incorreto | REJECT | REJECT | OK | KEY_DV_INVALID |
| mg_icms00.neg.chave_cDV_divergente | REJECT | REJECT | OK | KEY_IDE_MISMATCH |
| mg_icms00.neg.campos_indFinal_divergente | REJECT | REJECT | OK | {'indFinal': '0'} |
| neg.sign.certificado_expirado | REJECT | REJECT | OK | CERTIFICATE_EXPIRED |
| neg.sign.chave_nao_corresponde | REJECT | REJECT | OK | CERTIFICATE_KEY_MISMATCH |
