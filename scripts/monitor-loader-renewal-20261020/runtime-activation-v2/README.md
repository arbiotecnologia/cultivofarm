# Ativação runtime monitor v2 (separada do CQ)
- `src/hooks/useAuth.tsx`: baseline `165c628e…1f9f` conferida exata → candidato v2 `ace8f12d…dc4`.
- 5 simuladores em `src/test/config`: somente `abortSignal` (sem mudar asserts nem imports).
- CQ runtime preservado (hashes em `manifest.json`); demais gates inalterados.
- Lease 15 s inalterado; perfil ausente/inativo mantém signOut legado (não é resultado homologado novo).
- Resultados: tsgo 0; `src/test/config` 70/1077 PASS; 23 novos + 18 regressões PASS; build 0.
  A reprodução da baseline falha agora por design (defeito não ocorre no v2).
- Latência intermitente (RTT ~8 s, abortos de 12 s) segue limitação: estabilidade NÃO certificada.
- Rollback: `python3 scripts/monitor-loader-renewal-20261020/runtime-activation-v2/rollback.py` (recusa drift de CQ/runtime).
- Sem DDL/DML, roles, sessões, reload ou publicação.
