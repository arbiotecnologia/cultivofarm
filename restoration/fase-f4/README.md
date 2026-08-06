# Fase F4 — Geração, validação XSD e assinatura da NF-e 4.00 (modelo 55)

Alvo **exclusivo**: staging `ikaauvsflpmamgxmkhoq`. Produção
`navfzbwgwzruipouyfnk` não foi tocada. Nada publicado.

## Teto absoluto

`SIGNED`. Não existe caminho de transmissão, autorização, consulta de
recibo ou contato com a SEFAZ. `tpAmb=1` permanece bloqueado (F3.1-R2)
em três camadas: gate `fn_fiscal_assert_environment_homologation()`,
`CHECK (environment_code = '2')` e recusa no builder/validador.

## Artefatos

| Arquivo | Escopo |
| --- | --- |
| `migration.sql` | Migration canônica `20260822000000_fase_f4_nfe_xml_motor.sql` (transaction-neutral; aplicar com `--single-transaction`). |
| `postcheck.sql` | 25 gates estruturais fail-fast (RLS, ACL por catálogo, imutabilidade, teto de estado/ambiente, bucket). |

## Banco

- `public.fiscal_xsd_registry` — esquemas oficiais versionados; `source_url`
  restrito por `fn_fiscal_official_url_allowlisted` (somente `*.gov.br`).
- `public.fiscal_xml_runs` — execuções append-only (`PREPARED → GENERATED →
  XSD_VALIDATED → SIGNED`, `FAILED` lateral). Correção nunca sobrescreve:
  gera nova `run_version` encadeada por `previous_run_id`.
- Imutabilidade real por trigger: `DELETE` sempre bloqueado; `UPDATE` só via
  `rpc_fiscal_xml_record_v1` (GUC `app.fiscal_xml_engine`), inclusive para
  `service_role`. Hashes e caminhos são write-once; estados terminais não
  regridem.
- RPCs: `rpc_fiscal_xml_prepare_v1` (authenticated, congela payload +
  SHA-256), `rpc_fiscal_xml_record_v1` (**service_role apenas**),
  `rpc_fiscal_xml_status_v1` (leitura sanitizada para a UI).
- RLS `FORCE` nas duas tabelas, somente `SELECT` para perfis internos
  (`fn_fiscal_can_read_internal`). `anon`/`PUBLIC` sem qualquer grant.
- Bucket privado `fiscal-xml` (10 MiB, `application/xml`), leitura por perfil
  interno, escrita apenas por `service_role`.

## Aplicação/runtime

- `supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts` — builder puro e
  determinístico (mesmo payload ⇒ mesmos bytes), razão social de homologação
  forçada no destinatário, ICMS00/ICMSSN102 conforme CRT.
- `.../validateNfeXml.ts` — gramática derivada do XSD oficial 4.00
  (raiz, namespace, ordem, cardinalidade, tipos N/D2/D4, facetas, choices).
  A versão aplicada é rastreada em `fiscal_xsd_registry`.
- `.../xmlParse.ts` — parser fail-closed: DOCTYPE, ENTITY, CDATA,
  comentários e PIs são rejeitados (XXE/entity expansion).
- `.../signNfeXml.ts` — XMLDSig enveloped (`#NFe<chave>`, enveloped-signature
  + C14N, RSA/SHA-1, KeyInfo X509) com o A1 do cofre; chave privada apenas em
  memória, zerada ao final.
- `supabase/functions/fiscal-xml-engine/index.ts` — orquestra preparo →
  build → armazenamento → validação → assinatura → revalidação pós-assinatura,
  registrando cada transição; falhas viram `FAILED` com código sanitizado.
- UI: `src/hooks/useFiscalXmlEngine.ts` e
  `src/components/fiscal/documentos/GeracaoXmlNfeSecao.tsx` (aba Revisão do
  rascunho), com badge explícito “Teto: assinado”.

## Validações executadas

- `postcheck.sql`: **25/25 PASS** no staging.
- `vitest`: **2764 passed / 4 skipped**, incluindo 20 casos novos do motor de
  XML (determinismo, facetas, ordem, tipos, teto de ambiente, XXE).
- `tsc --noEmit`: limpo.

## Pendências externas (fora do sandbox)

1. Promover `migration.sql` para `supabase/migrations/20260822000000_fase_f4_nfe_xml_motor.sql`
   pelo fluxo oficial (`supabase db push`) — o arquivo aqui é byte-idêntico ao
   aplicado no staging.
2. Deploy da Edge Function `fiscal-xml-engine` e inclusão da origem em
   `FISCAL_CORS_ALLOWLIST`.
3. Certificado A1 de homologação carregado (`fiscal-certificate-upload`) e
   `FISCAL_CERTIFICATE_MASTER_KEY` configurada; sem eles a execução termina em
   `CERTIFICATE_NOT_CONFIGURED` (fail-closed, por projeto).
