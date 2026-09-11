# Pacote de hardening de segurança — CultivoFarm `swzpzcwiasxmjutrmvkm`

Estado: **PENDENTE DE INVENTÁRIO**. Nenhum SQL deste pacote foi executado em
nenhum banco. As correções específicas ficam deliberadamente vazias até o
inventário real do CultivoFarm ser recebido — escrever policies sem o schema
real bloquearia usuários legítimos.

## Ambientes

| Ref | Papel | Permitido |
| --- | --- | --- |
| `swzpzcwiasxmjutrmvkm` | CultivoFarm — alvo único | leitura agora; escrita só após aprovação da onda |
| `ikaauvsflpmamgxmkhoq` | homologação | proibido nesta execução |
| `navfzbwgwzruipouyfnk` | produção antiga | proibido |
| `yzszlzjpovmcteuxjznj` | sandbox | proibido |

## Estrutura

```text
restoration/hardening-cultivofarm/
├── README.md                              este arquivo
├── 10-instrucoes-coleta.md                como rodar a coleta e devolver o resultado
├── 20-plano-hardening.md                  ondas, critérios de aceite e gates
├── inventario/
│   └── 00-coleta-readonly.sql             coleta somente leitura (8 blocos)
├── prechecks/
│   └── 01-prechecks-readonly.sql          guarda de alvo + estado antes da onda
├── forward-sql/
│   └── 20261111000000_hardening_v1.sql.PENDENTE   preenchido após o inventário
├── rollback-sql/
│   └── 20261111000000_hardening_v1_rollback.sql.PENDENTE
└── postchecks/
    └── 02-postchecks-readonly.sql         verificação após a onda
```

## Regras invioláveis do pacote

1. Toda escrita é idempotente e roda dentro de `BEGIN … COMMIT` com guarda de
   alvo fail-closed (`hardening.target_ref = 'swzpzcwiasxmjutrmvkm'`).
2. Autorização nunca usa `user_metadata`; apenas `public.user_roles` +
   `public.has_role`.
3. `admin@arbio.com`, sua organização e o papel `administrador` são preservados.
4. Emissão fiscal permanece desativada; certificados e secrets não são tocados.
5. Nenhum dado de teste é criado ou importado.
6. Nenhuma publicação de frontend e nenhum deploy de Edge Function.
