# Tipagem efetiva e checkout recuperável

**App NÃO CERTIFICADO nesta entrega.** Não foi executado checker manual: a instrução do ambiente proíbe builds/typechecks manuais. O comando raiz `tsc --noEmit` com `files:[]` e references não certifica `src`; Vite/SWC transpila e verifica bundling, não tipos semânticos. O log automático pode reportar erros de tipos, mas não identifica versão/comando/projeto/exit code suficiente para recibo independente.

O erro inicial na chamada da RPC (assinatura LIVE ausente do tipo canônico gerado) foi corrigido com adaptação tipada restrita do método do **mesmo** cliente; nenhum arquivo gerado foi alterado nem cliente paralelo criado. Build automático posterior OK não é PASS de checker app.

`python3 scripts/application-recovery/export-checkout.py` gera `/tmp/application-recovery-checkout.zip`, inventário SHA256 por entrada em `checkout-inputs.json`, incluindo `src` completo, cliente/tipos canônicos, testes, configs explícitos, `package.json` e `bun.lock`; exclui Git/dependências/output/secrets. Não fica só em lista irrecuperável de hashes. O arquivo pode ser copiado para Files para entrega solicitada depois de inspecionar suas entradas.

Auditor: extrair em diretório limpo, validar `checkout-inputs.json`, instalar com `bun install --frozen-lockfile`, usar checker externo sem modificar dependências do projeto:

```sh
tsgo --version > checker-version.log 2>&1
tsgo -p tsconfig.app.json --noEmit > typecheck-app.log 2>&1
app_exit=$?
printf '%s\n' "$app_exit" > typecheck-app.exit
tsgo -p tsconfig.node.json --noEmit > typecheck-node.log 2>&1
node_exit=$?
printf '%s\n' "$node_exit" > typecheck-node.exit
```

Registrar HEAD, versão checker, comandos exatos/config, SHA dos inputs/logs e exit codes. `tsconfig.app.json` inclui todo `src`, DOM, aliases e vitest; `strict:false`, `skipLibCheck:true`, não strict integral de bibliotecas. Node é recibo separado, não substitui app. Não trocar resultado de TypeScript do lock e tsgo silenciosamente.