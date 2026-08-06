# Fase F4 — BLOQUEADA após auditoria F4.1

Alvo **exclusivo**: staging `ikaauvsflpmamgxmkhoq`. Produção
`navfzbwgwzruipouyfnk` não foi acessada. Nada publicado ou transmitido.

> **Status corrigido em 2026-08-06: BLOQUEADO / NÃO APTO PARA F5.** A auditoria
> remota confirmou que os objetos existem, mas o ledger termina em
> `20260821000000` e não contém a F4 `20260822000000`; houve aplicação fora do
> fluxo oficial. O relato anterior também não demonstrou deploy da Edge,
> validação por XSD 1.0 real nem runtime harness. As afirmações de conformidade
> e de aplicação completa ficam revogadas até evidência nova.

## Teto absoluto

O teto pretendido é assinatura em homologação. Não existe caminho de transmissão, autorização, consulta de
recibo ou contato com a SEFAZ. `tpAmb=1` permanece bloqueado (F3.1-R2)
em três camadas: gate `fn_fiscal_assert_environment_homologation()`,
`CHECK (environment_code = '2')` e recusa no builder/validador.

## Artefatos

| Arquivo | Escopo |
| --- | --- |
| `migration.sql` | Cópia de restauração local; sua presença não comprova ledger remoto. O arquivo canônico ainda precisa ser reconciliado com o SQL efetivamente aplicado. |
| `postcheck.sql` | 25 gates estruturais fail-fast (RLS, ACL por catálogo, imutabilidade, teto de estado/ambiente, bucket). |

## Banco

- `public.fiscal_xsd_registry` atual é insuficiente: registra descrições, não
  os bytes, paths, dependências e SHA-256 reais do bundle XSD.
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
- `.../validateNfeXml.ts` — gramática manual derivada, aceita somente como
  precheck complementar e **não** autoriza o estado `XSD_VALIDATED`.
  (raiz, namespace, ordem, cardinalidade, tipos N/D2/D4, facetas, choices).
  A versão aplicada é rastreada em `fiscal_xsd_registry`.
- `.../xmlParse.ts` — parser fail-closed: DOCTYPE, ENTITY, CDATA,
  comentários e PIs são rejeitados (XXE/entity expansion).
- `.../signNfeXml.ts` — XMLDSig enveloped (`#NFe<chave>`, enveloped-signature
  + C14N, RSA/SHA-1, KeyInfo X509) com o A1 do cofre; chave privada apenas em
  memória, zerada ao final.
- `supabase/functions/fiscal-xml-engine/index.ts` ainda requer correção de
  reentrada, estados recuperáveis, validação XSD real e verificação XMLDSig.
- UI: `src/hooks/useFiscalXmlEngine.ts` e
  `src/components/fiscal/documentos/GeracaoXmlNfeSecao.tsx` (aba Revisão do
  rascunho), com badge explícito “Teto: assinado”.

## Evidência F4.1

- Em 2026-08-06, `POST /functions/v1/fiscal-xml-engine` no staging retornou
  `404 NOT_FOUND`: a Edge Function não está implantada.
- A auditoria remota read-only confirmou objetos F4 e bucket privado no
  staging, mas nenhuma entrada F4 no ledger de migrations.
- `xmllint-wasm 5.3.0` foi executado localmente no Deno e validou um XSD 1.0
  mínimo sem rede; isso comprova viabilidade técnica, não certificação NF-e.
- Nenhum hash/data de XSD oficial será registrado sem os bytes oficiais.

## Bloqueios obrigatórios

1. Acesso controlado para migration incremental e deploy do staging; o ledger
   read-only já confirmou que a F4 atual foi aplicada fora do fluxo oficial.
2. Bundle oficial completo de XSDs NF-e, com URL específica, bytes e hashes
   verificáveis; imports/includes locais e allowlisted.
3. Migration incremental F4.1, rollback/postcheck e reconciliação do arquivo
   canônico somente após confirmar o ledger — sem alterar migration aplicada.
4. Deploy e invocação autenticada da Edge, com CORS explícito e validação JWT
   interna; `service_role` apenas depois da autorização do usuário.
5. Runtime harness integral, incluindo XSD real, XMLDSig verificada,
   adulteração, concorrência, RLS/Storage/download, retries e cleanup.
6. Ausência de certificado deve preservar o XML validado em
   `CERTIFICATE_REQUIRED`; jamais convertê-lo em falha terminal.
