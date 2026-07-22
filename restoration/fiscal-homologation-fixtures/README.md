# Fixtures de Homologação Fiscal (Fase 3.17)

**Uso exclusivo em ambiente de STAGING.** Nenhum script deste diretório é
aplicado automaticamente. Nenhum segredo, credencial, `project ref`,
URL, token ou material A1 real está presente aqui.

## Guarda obrigatória

Antes de qualquer execução, o ambiente precisa possuir a tabela sentinela:

```sql
CREATE TABLE IF NOT EXISTS public._fiscal_staging_marker (
  marker text PRIMARY KEY
);
INSERT INTO public._fiscal_staging_marker(marker) VALUES ('STAGING')
  ON CONFLICT DO NOTHING;
```

O passo `01-preflight.sql` **aborta** se o marker `STAGING` não existir.
O agente Lovable **não** cria esse marker. A responsabilidade é do
operador humano no console do banco de staging.

## Ordem de execução (manual)

1. `01-preflight.sql` — valida marker e ambiente.
2. `02-seed.sql` — cria fixtures com prefixo `FISCAL_HML_`.
3. `03-verify.sql` — provas: zero produção, zero AUTHORIZED/ISSUED,
   somente DRAFT/NONE/MANUAL_RECORD, snapshots presentes.
4. `04-cleanup.sql` — remove exclusivamente registros com prefixo
   `FISCAL_HML_`. Sem `CASCADE` amplo.

## Escopo das fixtures

- Empresa fiscal de homologação apenas se singleton compatível; se já
  existir, preservar e registrar baseline.
- Dois clientes sintéticos.
- Um produto fiscal pronto.
- Um serviço fiscal pronto.
- Rascunho NF-e válido, rascunho NFS-e válido e rascunho incompleto.
- Snapshots por item preenchidos via whitelist do server.
- **Nenhum** certificado real ou material A1 sintético. O checklist de
  homologação deve permanecer INCOMPLETE até o cadastro controlado.
- **Nenhum** status `AUTHORIZED` ou `ISSUED`.

## Cleanup

`04-cleanup.sql` limita-se a `DELETE ... WHERE nome LIKE 'FISCAL_HML_%'`.
Não usa `TRUNCATE`, não usa `CASCADE`, e não toca em dados fora do
prefixo. Nenhum dado real de produção é afetado.
