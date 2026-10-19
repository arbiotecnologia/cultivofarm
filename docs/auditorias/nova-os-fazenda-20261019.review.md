# Nova OS — correção focal da seleção de fazenda

Achado real informado pelo proprietário13:32: cliente selecionado, porém Fazenda desabilitada porque sua condição executava `validarOS`, que exige fazenda e talhão — dependência circular.

## Alteração mínima

`src/pages/OrdensServico.tsx`: somente a condição `disabled` do Select Fazenda mudou. Depende de `saving`, `canCreate`, `loaded`, `loadError`, `isRefreshing` e cliente presente em `clientes`. Não depende de fazenda/talhão/produto/área ou validação completa. Listas continuam filtradas por cliente/fazenda; mudança de cliente/fazenda continua limpando seleções descendentes.

`validarOS`, botão submit, `handleCreate`, insert e segurança server-side permanecem intocados. Nenhuma OS criada, alteração de status, permissão, RPC, contrato, gate, dependência ou publicação.

## Evidência local

25/25 Vitest dirigidos PASS:24 validação existente +1 teste novo em `src/test/ordens-servico/formProgression.test.tsx`. O novo teste monta a página e os controles Radix reais, abre Nova OS, seleciona cliente→fazenda→talhão, confirma área herdada e submit incompleto bloqueado; tentativa direta de submit não chama insert. Transporte/roles são fake explícitos; não é login/browser hosted ou homologação real.

Primeira tentativa do teste encontrou limitação JSDOM de pointer capture, não falha de runtime; versão final usa interação de teclado real do Select e shim de scroll somente no teste. Avisos React Router e descrição do diálogo preexistente, sem erro não tratado no teste final.

## Fixture informada — preservar, não duplicar

- Cliente B `cc586e4a-8953-4f3c-9a38-57e3665d1667`.
- Fazenda B `46bea8e9-79fc-440b-bdb5-76f40ba4550f`.
- Talhão B `806d9789-a87e-4e25-8d59-aa9eea24dabe`.
- OS ainda não criada pelo auditor; este agente não criou dados. Avanço de OS continua fechado, não contornado por esta correção.

Proprietário informou checker repetido no snapshot estável EXIT0 e monitor105/105 independentes; recibos não certificam esta alteração posterior nem homologação real. Nenhum checker manual executado pelo agente; compilação automática não substitui checker app.

## Rollback restrito

Reverter exclusivamente a condição do Select Fazenda ao texto anterior (isso reintroduz o bloqueio conhecido), sem restaurar a página inteira ou outros pacotes:

```tsx
disabled={saving || !canCreate || !!validarOS(form, { clientes, fazendas, talhoes, produtos, microrganismos }) || !form.cliente_id}
```

Pacotes SQL/PDF e snapshots anteriores permanecem intactos; não regenerados para absorver esta correção. Homologação da seleção na sessão real aguarda publicação própria pelo proprietário, sem reload ou troca de sessão pelo agente.