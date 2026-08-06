# F4.1-R1 — Correção canônica e homologação real do motor XML NF-e

Data: 2026-08-06 UTC
Alvo autorizado: staging `ikaauvsflpmamgxmkhoq`
Produção `navfzbwgwzruipouyfnk`: **não acessada**. Nada publicado. Nenhuma
chamada SEFAZ. `PRODUCTION_NOT_ACCESSED=true`

## Status

**PARCIALMENTE CONCLUÍDA — código e homologação XSD real PASS;
BLOQUEADA nos itens que exigem banco/deploy de staging.**

## 1. Bundle XSD oficial (RESOLVIDO)

Obtido do Portal Nacional da NF-e, seção “Esquemas XML”:

- Pacote: `PL_010e_v1.02.zip` (41.335 bytes)
- Rótulo: “010e_v.1.02 – NT 2025.002 v.1.40, NT 2026.002 v.1.0 e NT 2026.003 v.1.0”
- Publicado: 10/07/2026
- SHA-256: `d44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1`
- Página: `listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D`

Arquivos versionados em `supabase/functions/fiscal-xml-engine/xsd/`
(hashes completos em `xsd/manifest.json`):

| arquivo | bytes | sha256 (prefixo) |
| --- | --- | --- |
| `nfe_v4.00.xsd` | 716 | `adce3646…` |
| `leiauteNFe_v4.00.xsd` | 352.527 | `598c7178…` |
| `tiposBasico_v4.00.xsd` | 22.532 | `772619c8…` |
| `DFeTiposBasicos_v1.00.xsd` | 61.958 | `7fe1dbd8…` |
| `xmldsig-core-schema_v1.01.xsd` | 3.747 | `f56744a5…` |

`xs:include`/`xs:import` são satisfeitos **apenas** por preload local; o
validador roda em WebAssembly, sem rede, sem DTD e sem entidade externa.

## 2. Validação XSD 1.0 real (RESOLVIDO)

- Novo módulo `supabase/functions/fiscal-xml-engine/xsdValidate.ts`
  (`xmllint-wasm@5.3.0`, libxml2 / XSD 1.0), com mensagens sanitizadas.
- `validateNfeXml.ts` foi rebaixado a **precheck** de gramática: não
  autoriza mais o estado `XSD_VALIDATED`.
- A validação normativa passou a ocorrer sobre o **documento assinado**,
  porque o XSD oficial exige `ds:Signature` dentro de `NFe`.

### Defeito real encontrado pelo XSD oficial e corrigido

O builder emitia `<CNAE>` logo após `<IE>`. O XSD rejeita: `CNAE` só é
admitido na sequência que contém `IM`. `buildNfeXml.ts` foi corrigido
(ordem `IE, IEST, IM, CNAE, CRT`, com `CNAE` apenas quando há `IM`). A
gramática manual anterior aprovava esse XML inválido — evidência direta
de que o precheck não substitui o XSD.

## 3. Verificação XMLDSig independente (RESOLVIDO)

`verifyNfeSignature()` em `signNfeXml.ts` recalcula o DigestValue da
referência `#NFe<chave>` a partir do documento assinado (removendo
`Signature`, conforme a transform enveloped) e verifica o
`SignatureValue` com a chave pública do X509 embutido.

## 4. Gate runtime local executado

`deno run -A restoration/fase-f4-1/runtime-harness/xsd-gate.ts` — **7/7 PASS**:

| gate | resultado |
| --- | --- |
| documento não assinado: única pendência é `Signature` | PASS |
| elemento desconhecido (`vXXX`) rejeitado pelo XSD | PASS |
| faceta de `NCM` (8 dígitos) rejeitada pelo XSD | PASS |
| documento **assinado** válido no XSD oficial | PASS |
| adulteração de tipo (`vNF=ABC`) rejeitada | PASS |
| XMLDSig positiva (digest + RSA) | PASS |
| adulteração de conteúdo → `SIGNATURE_DIGEST_MISMATCH` | PASS |
| troca do `SignatureValue` → `SIGNATURE_VALUE_MISMATCH` | PASS |

Certificado usado: A1 de teste gerado localmente, fora do repositório
(`/tmp`), sem qualquer relação com o cofre. Nenhuma senha, chave privada
ou material de certificado foi registrado.

## 5. Motor (Edge Function) reescrito

`supabase/functions/fiscal-xml-engine/index.ts`:

1. precheck de gramática → falha vira `NFE_PRECHECK_FAILED`;
2. upload do não assinado tolera reentrada (objeto determinístico já
   existente não é falha);
3. assinatura A1;
4. **XSD oficial sobre o assinado**;
5. **verificação XMLDSig**;
6. só então `XSD_VALIDATED` → `SIGNED`.

Ausência/indisponibilidade de certificado devolve HTTP 412
`CERTIFICATE_REQUIRED` **preservando a execução em `GENERATED`** — deixou
de ser falha terminal, conforme exigido.

## 6. Itens BLOQUEADOS (dependem de acesso a staging)

Esta execução não possui credencial de banco (`PGHOST` ausente) nem CLI
Supabase. Portanto **permanecem pendentes**:

- reconciliação do ledger: `supabase_migrations.schema_migrations` termina
  em `20260821000000`; a F4 (`20260822000000`) continua aplicada fora do
  fluxo oficial;
- aplicação de `restoration/fase-f4-1/migration-incremental.sql`
  (registro dos bytes/hashes reais do bundle em `fiscal_xsd_registry`);
- deploy da Edge `fiscal-xml-engine` (último POST no staging: 404);
- harness runtime remoto: RLS/Storage, concorrência, download assinado,
  retries e cleanup.

A UI de geração (`GeracaoXmlNfeSecao.tsx`) permanece **bloqueada** com
mensagem honesta até o deploy e a reconciliação do ledger.

## 7. Qualidade local

- `tsgo --noEmit`: limpo.
- Vitest: 168 arquivos PASS / 1 skipped; 2.764 testes PASS / 4 skipped.
- `bun run build`: PASS.

## Critério de desbloqueio para F5

Ledger reconciliado (antes/depois), migration incremental aplicada, Edge
implantada e invocada com JWT real, e harness remoto integral sem skip
crítico.
