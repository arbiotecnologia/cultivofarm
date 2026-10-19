# Recibo de tipagem — candidata PDF d155925

**Typecheck NÃO CERTIFICADO.** “Automatic harness build OK” no recibo histórico não constitui typecheck. Manifesto/snapshots/recibo do pacote PDF em revisão permanecem intactos; este documento retifica sua interpretação.

Complemento do auditor 19/10 12:35 UTC: confirmou `typecheck='tsc --noEmit'` na raiz com `files:[]` e apenas references, e Vite/SWC sem checker. **Projeto app efetivamente checado nesta entrega: nenhum; `tsconfig.app.json` NÃO executado.** Projeto exigido para recibo independente: `tsconfig.app.json`, com comando, versão, log e exit code reais. PASS do comando raiz não pode ser registrado como PASS da aplicação. O projeto node deve ter recibo separado e não substitui o app.

`package.json`: build = `vite build`. `vite.config.ts`: React SWC, build-id e tagger no desenvolvimento; sem checker TypeScript, tsgo ou tsc. Vite/SWC transpila TS/TSX; build verifica parsing, imports, bundling e processamento de recursos, **não análise semântica completa de tipos**. Log do harness só informa `build OK`. A instrução do ambiente informa execução automática de build/typechecks, mas não disponibiliza comando/config/versão/exit code de checker; não é evidência de tipagem. Não executamos comandos separados por proibição expressa do harness.

O script raiz `typecheck: tsc --noEmit` não é recibo: `tsconfig.json` tem files vazio e references; executá-lo sozinho não prova src checado. Verificação independente no checkout completo com dependências do bun.lock preservado:

```sh
tsgo --version
tsgo -p tsconfig.app.json --noEmit > typecheck-app.log 2>&1
# Registrar exit code imediatamente, sem pipes que o substituam.
tsgo -p tsconfig.node.json --noEmit > typecheck-node.log 2>&1
```

Auditor registra HEAD, versão exata do checker, comandos/config, logs, exit codes e hashes. Usar tsgo fornecido externamente sem mudar dependências do projeto. Alternativamente TypeScript5.8.3 do lock pode ser verificado pelo auditor com -p explícito, identificando compilador; não trocar resultados de ferramentas silenciosamente.

Config app inclui todo src/testes, vitest/globals, DOM e alias @/*; strict false, skipLibCheck true, noEmit true. Não é strict integral de bibliotecas. Config node inclui vite.config.ts com strict true. Entradas presentes em checkout: src/** completo (tipos canônicos e imports transitivos), tsconfig*.json, package.json, bun.lock, vite.config.ts, vitest.config.ts. `independent-inputs.json` lista SHA256 de cada entrada, sem .env/secrets/dependências/Git gerados. Valide antes de executar; copiar só dois callers não cobre seus imports.

Homologação real PDF bloqueada: aplicações/evidências produção vazias conforme auditor, RPC salvar fechada. Não criar fixture hospedada/inserts para vencer o bloqueio.