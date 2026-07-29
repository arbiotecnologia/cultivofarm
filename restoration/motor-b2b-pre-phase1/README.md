# Motor B2B — Kit de rollback pré-Fase 1

Artefatos da Fase 0.1. Ambiente permitido: **staging `ikaauvsflpmamgxmkhoq`**.
Produção `navfzbwgwzruipouyfnk` é **recusada** por trava fail-fast em todos os scripts.

| Arquivo | Função |
| --- | --- |
| `restore-functions.sql` | Restaura corpo, `search_path`, comentários e GRANTs das 17 funções do motor a partir do snapshot, com assert de checksum. Atômico. |
| `verify-restoration.sql` | Comparação **read-only** entre o estado atual e o snapshot; falha em divergência. |

Fonte do snapshot: tabela `public._motor_b2b_pre_phase1_snapshot` (staging).
Inventário e checksums: `docs/commercial-engine-pre-phase1-snapshot.md`.

## Ordem de uso

```bash
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f verify-restoration.sql
psql "$PGURL_STAGING" --single-transaction -v ON_ERROR_STOP=1 -f restore-functions.sql
psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f verify-restoration.sql
```

Nenhum script altera dados operacionais (pedidos, parcelas, recebíveis,
produção, entregas, fiscal, BI, comunicação) e nenhum registra secrets.
