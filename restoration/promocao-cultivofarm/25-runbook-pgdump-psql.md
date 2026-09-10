# Runbook local — promoção estrutural ao CultivoFarm (`swzpzcwiasxmjutrmvkm`)

Executar na máquina do operador, com `pg_dump`/`psql` locais. Nada aqui roda no
Lovable. Este runbook complementa `06-runbook-execucao-local.md`; não o substitui.

## 0. Guardas obrigatórias

- Alvo único autorizado: **`swzpzcwiasxmjutrmvkm`**.
- Proibidos como destino: `navfzbwgwzruipouyfnk` (produção AR Bio),
  `ikaauvsflpmamgxmkhoq` (homologação), `yzszlzjpovmcteuxjznj` (sandbox).
- Escopo: schema, funções, views, RLS, policies, índices, triggers, grants.
  **Sem dados, sem usuários, sem arquivos, sem Edge Functions, sem publicar.**

Guarda de shell — abortar se o DSN não contiver o ref autorizado:

```bash
ALVO="swzpzcwiasxmjutrmvkm"
case "$CULTIVOFARM_DSN" in
  *navfzbwgwzruipouyfnk*|*ikaauvsflpmamgxmkhoq*|*yzszlzjpovmcteuxjznj*)
    echo "ABORT: DSN aponta para ambiente proibido"; exit 3;;
esac
echo "$CULTIVOFARM_DSN" | grep -q "$ALVO" || { echo "ABORT: DSN nao e o CultivoFarm"; exit 3; }
```

Guarda equivalente em PowerShell:

```powershell
$Alvo = 'swzpzcwiasxmjutrmvkm'
foreach ($bad in 'navfzbwgwzruipouyfnk','ikaauvsflpmamgxmkhoq','yzszlzjpovmcteuxjznj') {
  if ($env:CULTIVOFARM_DSN -like "*$bad*") { throw "ABORT: DSN aponta para ambiente proibido" }
}
if ($env:CULTIVOFARM_DSN -notlike "*$Alvo*") { throw 'ABORT: DSN nao e o CultivoFarm' }
```

Toda sessão `psql` deve declarar o alvo, senão os scripts abortam:

```
psql "$CULTIVOFARM_DSN" -v ON_ERROR_STOP=1 \
  -c "SET promocao.target_ref = 'swzpzcwiasxmjutrmvkm';" -f <arquivo>
```

Na prática, use um arquivo de sessão que faça `SET` e depois `\i` do script,
para que a variável valha na mesma conexão.

## 1. Backup e ponto de restauração

1. Confirmar PITR/backup ativo no projeto CultivoFarm.
2. Guardar um dump do estado atual do destino, mesmo vazio:

```bash
pg_dump --schema-only --no-owner --no-privileges "$CULTIVOFARM_DSN" \
  > baseline-cultivofarm-pre-promocao.sql
sha256sum baseline-cultivofarm-pre-promocao.sql
```

Sem esse arquivo local, a promoção é **NO-GO**.

## 2. Prechecks somente leitura

```bash
psql "$CULTIVOFARM_DSN" -v ON_ERROR_STOP=1 -f restoration/promocao-cultivofarm/01-prechecks-readonly.sql
psql "$CULTIVOFARM_DSN" -v ON_ERROR_STOP=1 -f restoration/promocao-cultivofarm/23-prechecks-readonly.sql
```

Critério: destino estruturalmente vazio, extensões presentes, papéis presentes,
`auth.users` e `storage.buckets` zerados. Qualquer divergência interrompe.

## 3. Classificar migrations e montar o pacote

```bash
python3 restoration/promocao-cultivofarm/20-classificar-migrations.py
restoration/promocao-cultivofarm/22-montar-pacote-estrutural.sh gerado/
```

ou, no Windows:

```powershell
python restoration\promocao-cultivofarm\20-classificar-migrations.py
pwsh restoration\promocao-cultivofarm\22-montar-pacote-estrutural.ps1 -OutDir gerado
```

Saídas: `gerado/30-pacote-estrutural-cultivofarm.sql` e o manifesto de hashes.
Registrar o SHA-256 impresso no fim da execução.

## 4. Dry-run obrigatório em banco descartável

Nunca faça o primeiro `psql` contra o CultivoFarm.

```bash
createdb dryrun_cultivofarm
psql -d dryrun_cultivofarm -v ON_ERROR_STOP=1 \
  -c "SET promocao.target_ref='swzpzcwiasxmjutrmvkm';" \
  -f gerado/30-pacote-estrutural-cultivofarm.sql
```

O pacote é transacional: qualquer erro desfaz tudo. Só avance com dry-run limpo.

## 5. Aplicação no CultivoFarm

```bash
psql "$CULTIVOFARM_DSN" -v ON_ERROR_STOP=1 \
  -c "SET promocao.target_ref='swzpzcwiasxmjutrmvkm';" \
  -f gerado/30-pacote-estrutural-cultivofarm.sql 2>&1 | tee gerado/aplicacao.log
```

## 6. Pós-checks

```bash
psql "$CULTIVOFARM_DSN" -v ON_ERROR_STOP=1 -f restoration/promocao-cultivofarm/04-postchecks.sql
psql "$CULTIVOFARM_DSN" -v ON_ERROR_STOP=1 -f restoration/promocao-cultivofarm/24-postchecks-readonly.sql
```

Aceite: nenhuma tabela sem RLS, nenhuma RLS sem policy, nenhum `SECURITY DEFINER`
sem `search_path`, nenhuma view sem `security_invoker`, zero linhas de negócio,
zero usuários, zero buckets, zero jobs de cron.

## 7. Ledger

Registrar **uma** linha de baseline apenas depois de os pós-checks passarem;
nunca marcar migration sem pós-check real. Ver `06-runbook-execucao-local.md`.

## 8. Rollback

`05-rollback.md`. Enquanto o destino não tiver dados, o rollback é a restauração
total a partir de `baseline-cultivofarm-pre-promocao.sql`.
