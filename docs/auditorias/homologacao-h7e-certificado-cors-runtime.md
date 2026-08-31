# H7e — Upload de certificado A1, CORS, drift de deploy e alinhamento do runtime fiscal

Escopo: homologação. Produção fiscal `navfzbwgwzruipouyfnk` **intocada** (nenhuma
leitura de escrita, migration, deploy ou configuração). Nenhuma senha, PFX,
chave privada, DSN, token ou service_role foi lido, exibido ou versionado.
Emissão fiscal de produção continua bloqueada.

## 1. Diagnóstico antes → depois

| Item | Antes | Depois |
| --- | --- | --- |
| `OPTIONS fiscal-certificate-upload` (origem preview Lovable) | relatado 403; medido hoje **200** no staging | **200** com `ACAO` exatamente igual à origem |
| `OPTIONS` das origens canônicas (`cultivofarm.com.br`, `www.`, `localhost:8080`) | **403** no staging (secret substituía o default) | **200** no runtime com o release H7e |
| Origem estranha (`evil.example.com`) e sem `Origin` | 403 | 403 (mantido, fail-closed) |
| Origem com barra final | 403 (comparação literal) | 200 (normalização `new URL().origin`) |
| Wildcard `*` | ausente | ausente (proibido no helper e coberto por teste) |
| Marcador de release | inexistente | `X-AR-Bio-Function-Version: h7e-2026-08-31` |
| Cofre no banco staging | H7d (`SIGNING_BUNDLE_V2`) | inalterado — nenhuma migration necessária |

## 2. Causa raiz

Duas causas independentes:

1. **CORS (P1, corrigido).** `fiscalAllowedOrigins()` fazia
   `fromEnv.length > 0 ? fromEnv : default`. Com o secret de ambiente definido,
   as origens canônicas do AR Bio eram **silenciosamente eliminadas**, e qualquer
   origem legítima ausente do secret recebia 403 já no preflight — antes de
   qualquer autenticação, com mensagem genérica de rede no browser. A comparação
   também era literal (`includes`), quebrando com barra final/caixa/porta.
2. **Drift de deploy (P1, bloqueado por infraestrutura — ver §7).** O pipeline de
   deploy disponível ao agente publica no projeto **`yzszlzjpovmcteuxjznj`**
   (backend gerenciado pela plataforma), e **não** no staging autorizado
   `ikaauvsflpmamgxmkhoq`, cujas funções foram publicadas historicamente por
   outro caminho. Daí a divergência entre o código H7d do repositório e o runtime
   implantado no staging.

## 3. Fase 1 — Matriz de auditoria do runtime

| Componente | Esperado (repo H7e) | Implantado | Compatível? | Ação |
| --- | --- | --- | --- | --- |
| `fiscal-certificate-upload` (código) | H7d canônico: `unwrap` em memória, senha nunca persistida, `SIGNING_BUNDLE_V2`, RPC sem senha | idem no repositório | Sim | mantido, sem reescrita |
| `fiscal-certificate-upload` (runtime `yzszlzjpovmcteuxjznj`) | release `h7e-2026-08-31` | `h7e-2026-08-31` | Sim | redeployado |
| `fiscal-certificate-upload` (runtime `ikaauvsflpmamgxmkhoq`) | release `h7e-2026-08-31` | sem header de release; nega origens canônicas | **Não** | redeploy pendente por caminho autorizado |
| `fiscal-xml-engine` (código) | consome `SIGNING_BUNDLE_V2` via `isSupportedVaultFormat` + `parseSigningBundle`; sem senha | idem | Sim | redeployado no runtime alcançável |
| `fiscal-xml-engine` (runtime staging) | release H7e | não atestável (sem header) | **Não atestado** | redeploy pendente |
| `_shared/fiscal/certificateVault.ts` | `SIGNING_BUNDLE_V2`/AES-256-GCM, rejeita chave cifrada | idem | Sim | inalterado |
| `_shared/fiscal/nfe/signNfeXml.ts` | assina a partir de PEMs, sem PKCS#12/senha | idem | Sim | inalterado |
| `public.fiscal_certificate_material` (staging) | sem `encrypted_password`/`password_iv`; `material_format='SIGNING_BUNDLE_V2'`, `material_algorithm='AES-256-GCM'`, RLS on, **zero policies** | idem, com CHECKs de formato/algoritmo | Sim | nenhuma migration |
| `rpc_fiscal_certificate_register_a1` | overload único, sem parâmetros de senha | 1 overload, assinatura sem senha | Sim | nenhuma migration |
| Bucket `fiscal-certificates` | privado | `public = false` | Sim | inalterado |
| Contadores staging | limpos | `fiscal_certificates=0`, `fiscal_certificate_material=0`, objetos=0 | Sim | — |
| Secrets criptográficos | `FISCAL_CERTIFICATE_MASTER_KEY`, `FISCAL_CORS_ALLOWLIST` presentes (valores não lidos) | presentes | Sim | — |
| Project ref do runtime testado | `sb-project-ref` | `ikaauvsflpmamgxmkhoq` / `yzszlzjpovmcteuxjznj` | — | produção nunca contatada |

## 4. Fase 2 — CORS definitivo (arquivos alterados)

- `supabase/functions/_shared/fiscal/corsAllowlist.ts` (reescrito):
  - allowlist efetiva = **união** do default versionado com
    `FISCAL_CORS_ALLOWLIST` ∪ `FISCAL_ALLOWED_ORIGINS`;
  - `normalizeOrigin()` via `new URL(origin).origin`;
  - `isFiscalOriginAllowed()` e `fiscalCorsHeaders()` fail-closed, sem wildcard;
  - preview Lovable restrito ao projeto `a79bb3db-f665-466d-bf41-ee8c6cb91fab`;
  - `FISCAL_RELEASE_ID` (não sensível) + header `X-AR-Bio-Function-Version`;
  - resposta permitida: `ACAO` exato, `Allow-Methods: POST, OPTIONS`,
    `Allow-Headers: authorization, content-type, apikey, x-client-info`, `Vary: Origin`.
- Funções alinhadas ao helper único (sem bypass local):
  `fiscal-certificate-upload`, `fiscal-certificate-revoke`, `fiscal-xml-engine`,
  `fiscal-event-sign`, `fiscal-sefaz-transport`, `fiscal-binding-diagnostics`,
  `fiscal-preflight`, `fiscal-cnpj-lookup` (esta última deixou de ler apenas
  `FISCAL_ALLOWED_ORIGINS`).
- `OPTIONS` continua tratado **antes** da autenticação; `POST` continua exigindo
  JWT válido + `has_role(administrador)`.
- Binding restaurado (drift recorrente da plataforma): `.env` e
  `src/integrations/supabase/types.ts` (21.850 linhas) voltaram ao baseline
  `c75bb87f` apontando para `ikaauvsflpmamgxmkhoq`.

## 5. Fases 3 e 4 — Drift e cadeia de assinatura

- Nenhuma implementação antiga foi corrigida ou perpetuada: o release publicado é
  o código H7d/H7e canônico do repositório, com senha somente em memória,
  `SIGNING_BUNDLE_V2`, material cifrado com AES-256-GCM, bucket privado,
  validação server-side de usuário/papel e tratamento fail-closed.
- **Nenhuma migration criada**: o banco staging já está na estrutura H7d
  (evidência em §3). Migrations históricas não foram alteradas.
- `fiscal-xml-engine` e `signNfeXml.ts` foram auditados no código: exigem
  `material_format = SIGNING_BUNDLE_V2` (`isSupportedVaultFormat`), falham
  fechado com `CERTIFICATE_REQUIRED`/`CERTIFICATE_DECRYPT_FAILED` e não conhecem
  senha persistida. A compatibilidade do **runtime implantado no staging** não é
  afirmada — não há evidência de release lá.

## 6. Fase 5 — Attestation e gate reutilizável (H10)

- Header `X-AR-Bio-Function-Version` em todas as funções fiscais, sem segredo/PII.
- `scripts/fiscal-release-gate.sh`: verifica project ref esperado, proíbe o ref de
  produção, compara o release implantado por função, confere `ACAO` exato,
  exige 403 para origem estranha, valida schema do cofre (ausência de colunas de
  senha, overload único da RPC) e apenas a **presença** de secrets. Sai com
  código 1 e bloqueia promoção em caso de drift.

## 7. Fase 6 — Testes executados (evidências)

Runtime com o release H7e (`yzszlzjpovmcteuxjznj`):

| Teste | Esperado | Resultado |
| --- | --- | --- |
| T1 OPTIONS origem preview aprovada | 2xx + ACAO exato | **200**, `ACAO` idêntico à origem, `X-AR-Bio-Function-Version: h7e-2026-08-31` |
| T1b OPTIONS origens canônicas (`cultivofarm.com.br`, `localhost:8080`) | 2xx | **200** (regressão do secret corrigida) |
| T1c OPTIONS origem com barra final | 2xx (normalização) | **200** |
| T2 OPTIONS origem estranha / sem Origin | 403 | **403**, `ACAO: null` |
| T3 POST origem aprovada sem autenticação | 401 | **401** `{"error":"unauthorized"}` |
| T3b POST com token inválido | 401 | **401** |
| T4 POST autenticado com perfil não autorizado | 403 | **não executado** (requer sessão real de usuário não-admin) |
| T5 POST autorizado sem arquivo | 4xx controlado | **não executado** (requer sessão admin) |
| T6 cofre não configurado | 503 `CERTIFICATE_VAULT_NOT_CONFIGURED` fail-closed | coberto por código + testes estáticos; sem fallback inseguro |

Staging autorizado `ikaauvsflpmamgxmkhoq` (runtime antigo): T1 **200**, T2 **403**,
T3 **401**; T1b **403** — confirma o drift, não o código atual.

Regressão (Fase 10): Vitest **3.287 PASS / 0 FAIL** (4 skips), typecheck **0 erros**,
build OK. Novo teste `src/test/fiscal/h7e.corsAllowlist.static.test.ts`
(união da allowlist, normalização, ausência de wildcard, `OPTIONS` antes da auth,
uso do helper por todas as funções fiscais).

## 8. Fases 7 a 9 — Certificado descartável, assinatura e certificado real

**NÃO EXECUTADAS — bloqueadas pelo item de infraestrutura da §2.2.** Enquanto o
release H7e não estiver publicado em `ikaauvsflpmamgxmkhoq`, um teste de upload
com PFX descartável exercitaria o runtime antigo e produziria evidência inválida.
Nenhum PFX real ou descartável foi enviado; nenhuma senha foi solicitada, usada,
registrada ou armazenada. A tela de upload permanece pronta e inalterada.

Provas disponíveis hoje sobre ausência de senha persistida:
`fiscal_certificate_material` sem colunas de senha; RPC sem parâmetros de senha;
código do upload zera `password` e buffers em `finally`, não loga, não devolve e
não grava senha; testes estáticos H7d/H7i cobrem essas invariantes.

## 9. RLS/Auth

`fiscal_certificate_material` com RLS ativa e **zero policies** (Data API
fail-closed); bucket privado sem policies; RPC restrita a `service_role`;
`POST` exige JWT + `has_role(administrador)`; `anon` sem acesso. Sem alterações
nesta fase.

## 10. Rollback

- **Código/redeploy**: reverter os arquivos citados na §4 para o commit anterior e
  republicar as oito funções fiscais no mesmo lote (release coordenado).
- **CORS**: remover origens do secret de ambiente; o default versionado continua
  garantindo as origens canônicas. Reverter o helper restaura o comportamento
  antigo — não recomendado, pois reintroduz o bloqueio silencioso.
- **Migration**: nenhuma aplicada; nada a reverter.
- **Release marker**: definir `FISCAL_RELEASE_ID` ou reverter o helper.
- Proibido, como rollback operacional, restaurar qualquer versão que persista a
  senha do certificado.

## 11. Pendências

- **P1 (aberta)**: publicar o release H7e nas Edge Functions do staging
  autorizado `ikaauvsflpmamgxmkhoq` por caminho de deploy autorizado. Até lá,
  runtime ≠ repositório.
- **P2**: T4/T5/T6 em runtime, com sessões reais admin e não-admin.
- **P2**: Fases 7–9 (PFX descartável, assinatura XML, certificado real).
- **P3**: drift recorrente de `.env`/`types.ts` provocado pela plataforma; hoje
  mitigado por restauração manual do baseline `c75bb87f`.

## 12. Gate H7e

**BLOQUEADA (P1 remanescente)** — o critério "runtime implantado igual ao release
esperado" não é satisfeito no staging autorizado. Todos os demais itens do gate
estão verdes no código e no runtime alcançável: sem wildcard, origem legítima
aceita, origem estranha 403, senha não persistível, `SIGNING_BUNDLE_V2` coerente,
`anon` negado, nenhuma chamada apontando para produção e
`navfzbwgwzruipouyfnk` **confirmadamente intocada**. Emissão fiscal de produção
não iniciada.
