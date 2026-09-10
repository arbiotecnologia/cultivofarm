# P0d — Correção final de evidência (sem SQL, sem deploy)

Fase somente-arquivos. **Zero SQL executado**, nenhum banco acessado, nenhuma
migration histórica editada, nada publicado.

## 1. View interna `public._src_vw_esteira_laboratorio`

Evidência lida em produção por canal autorizado somente-leitura:
`relkind='v'`, `reloptions` NULL (sem `security_invoker`), `anon_select=false`,
`authenticated_select=false`. As duas views públicas já mapeadas também estão
sem `security_invoker`.

Deixou de ser "pendência menor". Criado artefato novo, incluído na **onda P1**:

- `promotion-sql/20261102000000_p0d_security_invoker_views_v1.sql`
- `rollback-sql/20261102000000_p0d_security_invoker_views_v1_rollback.sql`

Conteúdo:

| Item | Implementação |
|---|---|
| Guarda | `promocao.target_ref = navfzbwgwzruipouyfnk`, fail-closed |
| Precheck | as 3 views existem e são `relkind='v'`; senão aborta |
| Baseline | `reloptions` das 3 gravado em `promocao_rollback_baseline` na transação |
| Ação | `ALTER VIEW … SET (security_invoker = true)` nas 3 views |
| ACL | nenhum `GRANT`; `REVOKE`s atuais preservados |
| Pós-check | 3/3 com `security_invoker=true`; `_src_…` sem SELECT para anon/authenticated |
| Rollback | restaura baseline capturado (`RESET` quando a opção era ausente) |
| Advisor | após a onda, exigir **zero** ERROR `security_definer_view` |

Postchecks 4g/4h adicionados em `04-postchecks.sql`.

## 2. SHA-256 da convergência

Defeito: `20261101000000_promocao_convergencia_ledger_v1.sql` inseria a própria
linha com `md5('convergencia-promocao-h9-v1') || md5('estrutura')` na coluna
`sha256_origem` — 64 hex que **não são SHA-256**, falsificando a semântica.

Correção criptograficamente honesta:

- o `INSERT` autorreferente foi **removido**; a migration apenas cria estrutura;
- `sha256_origem` e `sha256_artefato` ganharam `CHECK (~ '^[0-9a-f]{64}$')`;
- o registro desta version é inserido **pelo runner**, somente após execução +
  postcheck + `supabase migration repair --status applied 20261101000000`,
  usando o SHA-256 real já fixado em `10-manifesto-artefatos-promocao.csv`;
- nenhum MD5 é gravado em campo `sha256_*` (o `md5_conteudo` de
  `promocao_rollback_baseline` é campo próprio, nomeado corretamente);
- a version **não pode** ser reportada como `APLICADA` antes do passo do runner;
- rollback ajustado: recusa se houver **qualquer** linha nas duas tabelas.

Postcheck 4i adicionado: rejeita qualquer `sha256_*` fora de 64 hex.

## 3. Hashes corrigidos

| Artefato | SHA-256 |
|---|---|
| `promotion-sql/20261101000000_promocao_convergencia_ledger_v1.sql` | `65de029be6e90ea2bd76008df22273d8323cbd3272f3589a601025f5d50d7137` |
| `promotion-sql/20261102000000_p0d_security_invoker_views_v1.sql` | `de9c450fff121a0ae78b62049c4703ae400a58a43c3f4e64c39a416542518f8b` |

## 4. Validador

`19-validacao-p0c.py` passou a exigir:

- nenhuma concatenação de MD5 nem chamada `md5(` associada a coluna `sha256_*`
  em qualquer artefato;
- todos os `sha256_origem`/`sha256_artefato` do manifesto com 64 hex minúsculos
  **e** valor conferido contra o arquivo real;
- convergência sem `INSERT` próprio e com os dois `CHECK` de formato;
- artefato `20261102000000` presente, com as 3 views, precheck, pós-check 3/3,
  pós-check de ACL, guarda canônica, sem `GRANT` e com rollback.

## 5. Contagens

| Item | Resultado |
|---|---|
| Versões classificadas | 192/192 (135 PROMOVER, 47 com artefato, 3 condicionadas, 7 STAGING_ONLY, 0 bloqueadas) |
| Artefatos no manifesto 10 | 50 (49 do P0c + `20261102000000`) |
| Views com hardening previsto | 3/3 |
| SQL executado na P0d | 0 |

## 6. Veredito

**GO PARA A ONDA P1**, condicionado exclusivamente à **prova humana de backup /
restore point recente** em produção. Nenhum blocker técnico restante.
