# P0b — Resolução das 103 migrations com guarda de homologação

Nenhum SQL foi executado. Nenhum arquivo de `supabase/migrations/` foi alterado.

## 1. Refino do achado da P0

A P0 tratou "guarda de homologação" como categoria única. A leitura linha a
linha, com remoção de comentários antes da análise, separa três realidades:

| Subclasse | Qtde | O que é | Destino |
|---|---|---|---|
| **G0 — menção apenas em comentário** | 54 | o ref `ikaauvsflpmamgxmkhoq` aparece só em comentário; o código executável é neutro | promover o **arquivo histórico original**, sem artefato derivado |
| **G1 — guarda executável em bloco `DO`** | 46 | bloco `DO` puro de guarda (sem DDL/DML), lendo `_fiscal_staging_marker` ou comparando o ref | **artefato derivado** com a guarda removida e a guarda canônica de promoção prefixada |
| **G2 — guarda dentro do corpo de função / entrelaçada** | 3 | a checagem de ambiente está no corpo de uma função de runtime ou misturada com trabalho real | **NÃO promovível automaticamente** — decisão manual |

54 + 46 + 3 = **103**.

## 2. Guarda canônica de promoção

Os artefatos derivados começam com:

```sql
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;
```

O GUC `promocao.target_ref` **não** é definido por tabela marcadora. O runner:

1. resolve o ref do alvo por canal externo (API de projeto / parâmetros da
   conexão), fora do SQL;
2. compara com `navfzbwgwzruipouyfnk`;
3. só então emite `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`
   dentro da mesma transação da migration.

Efeito: qualquer execução acidental por `psql`, `db push` ou runner genérico
aborta com `42501`, porque o GUC não estará definido. Fail-closed antes de
qualquer DDL.

## 3. Geração dos artefatos

`gerar-promotion-sql.py` é determinístico e reexecutável. Ele:

- lê apenas os 46 alvos G1 (`.p0b-guard-targets.json`);
- localiza cada bloco `DO $tag$ … $tag$;` que mencione o ref ou o marcador de
  homologação **e** não contenha `CREATE/ALTER/DROP/GRANT/REVOKE/INSERT/UPDATE/
  DELETE/TRUNCATE/COMMENT ON/pg_get_functiondef` no miolo — ou seja, guarda pura;
- remove esses blocos e prefixa a guarda canônica;
- valida o resultado: se sobrar qualquer ref de homologação ou marcador em
  código executável, **não emite artefato** e marca `REQUER_DECISAO`;
- grava origem, SHA-256 da origem e SHA-256 do artefato em
  `10-manifesto-artefatos-promocao.csv`.

Resultado: **43 artefatos** em `promotion-sql/` e **3 `REQUER_DECISAO`**.

## 4. As 3 G2 e as 3 G1 que falharam a validação

| Version | Situação | Decisão |
|---|---|---|
| `20260731164849` | adapter fiscal simulado: a guarda está no corpo da função e o próprio objeto é de homologação | **NÃO PROMOVER** |
| `20260803215023` | idem | **NÃO PROMOVER** |
| `20260803215909` | idem | **NÃO PROMOVER** |
| `20260729004013` | captura `pg_get_functiondef` dentro do mesmo bloco da guarda | reescrita manual revisada, fora do gerador |
| `20260903182144` | hardening H7L com múltiplas checagens de ambiente entrelaçadas | reescrita manual revisada |
| `20261023000000` | forward H9-E2 com guarda entrelaçada à verificação de contrato | reescrita manual revisada |

As três reescritas manuais **não foram feitas nesta P0b** — exigem revisão
humana linha a linha. Continuam como blocker.

## 5. Caso especial: `20261003000000` (cron de retenção)

Esta migration valida `jobid = 5`, o `jobname`, o `schedule` **e o `md5` do
`command`** contra o baseline de homologação. A evidência do operador mostra que
o `command` de `prune-old-audit-logs` em produção tem hash **diferente**.
Portanto ela **abortaria em produção** por desenho, e o artefato derivado não
resolve isso: o baseline precisa ser lido do alvo antes.

Decisão: `REQUER_DECISAO`. O artefato de promoção só pode ser emitido depois de
capturar, em leitura autorizada em produção, o `jobid`, o `jobname` e o `md5` do
`command` reais, e de mapear a correção equivalente. Registrado como blocker.

## 6. Convergência do ledger — tradeoff e escolha única

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| `supabase db push` do repositório inteiro | suportado, registra o ledger sozinho | aplicaria as 59 em quarentena e as bloqueadas; sem controle por onda | **rejeitada** |
| Escrever direto em `supabase_migrations.schema_migrations` | simples | não suportado, proibido pelo enunciado | **rejeitada** |
| `supabase migration repair --status applied` por versão | suportado e oficial; não executa SQL | marca como aplicada uma versão cujo SQL real foi o **artefato derivado**, não o histórico | **rejeitada como caminho principal** |
| **Execução histórica controlada + uma migration de convergência** | ordem e onda sob controle; rastreabilidade origem→artefato→hash; ledger converge por caminho suportado | exige aplicar a mesma migration de convergência também em homologação | **ESCOLHIDA** |

Forma escolhida, em detalhe:

1. O runner aplica, por onda, **o arquivo histórico** (G0 e demais promovíveis)
   ou **o artefato derivado** (G1), cada um em transação própria.
2. Ao final de cada onda, o runner registra a versão no ledger pelo caminho
   suportado `supabase migration repair --status applied <version>` — usado
   apenas como **registro**, nunca como substituto da execução, e sempre depois
   de o SQL ter rodado com sucesso e os postchecks terem passado.
3. Ao final de todas as ondas, uma **nova migration de convergência**
   (`2026xxxx_convergencia_promocao_v1`) documenta, em tabela própria de
   auditoria de promoção, o par origem→artefato→hash de cada versão aplicada por
   artefato derivado. Essa migration é aplicada **também em homologação**, para
   que os dois ledgers avancem juntos e permaneçam comparáveis.
4. Nada é escrito manualmente em `supabase_migrations.schema_migrations`.
5. Nenhuma operação em `auth`, `storage` ou `realtime` participa da convergência.

A migration de convergência ainda **não foi escrita** — depende do conjunto
final de versões aprovadas. Blocker registrado.

## 7. Higiene dos artefatos

`17-validacao-p0b.py` reprova qualquer artefato que contenha ref do sandbox, ref
de homologação em código executável, marcador de homologação, UUID literal,
`service_role`, senha, certificado ou chave privada. Estado atual: aprovado.


## 8. Adendo P0c — destino final dos guards

Censo revisado por leitura direta (ref ou marcador em qualquer posição do
arquivo): **106 versões**, e não 103. A contagem da P0b usava o motivo textual
do manifesto e não enxergava `20260801221902`.

| Destino | Qtde |
|---|---|
| G0 — menção só em comentário, promover arquivo histórico | 53 |
| G1/G2 — artefato derivado em `promotion-sql/` | 46 |
| STAGING_ONLY — não promover | 7 |

As 3 pendências `REQUER_DECISAO` da P0b foram fechadas: `20260729004013` é
drill de rollback (STAGING_ONLY); `20260903182144` e `20261023000000` têm
artefato derivado gerado por `gerar-promotion-manuais.py`. Não resta nenhuma
version `BLOQUEADA_REQUER_DECISAO`.
