# Roadmap

- [x] H7e — CORS canônico, release marker, gate de release, relatório
- [ ] Publicar release H7e nas Edge Functions do staging autorizado (bloqueado: pipeline aponta para outro ref)
- [x] Corrigir erros de typecheck do preview (drift de `types.ts` gerado)
- [x] H7k — preflight fiscal por campo, integridade aritmética de itens, menor privilégio (staging, 8/8 postchecks + harness PASS)
- [ ] Provisionar certificado A1 de homologação para o smoke real SEFAZ (cStat 100/204/539)
- [ ] Drift recorrente de `.env`/`types.ts`: restaurar baseline `c75bb87f` antes de cada execução fiscal
- [x] P0/P1 promoção staging→produção: inventário, contrato `expected/`, manifesto de migrations, manifesto de dados, scripts read-only e dry-run (nenhum DDL/DML em produção)
- [ ] P2 promoção: exige `PROD_DSN` humano, PITR confirmado, quarentena das 20 migrations de sandbox e reconciliação do ledger do staging
- [ ] H7A — aplicar no pipeline autorizado do staging o guard de `certificate_ref` e revalidar o vínculo após deploy; nenhum SQL foi aplicado ao backend errado
