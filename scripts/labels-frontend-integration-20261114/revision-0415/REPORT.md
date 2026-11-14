# Revisão 04:15 — formatos, substituta e impressão fechada

## Corrigido no projeto principal
- `labelTemplate` prioriza `snapshot.template.codigo`; usa `produto_etiquetas.template_versao` (`codigo@v1`) e `snapshot.template_versao` como fallback; conserva formatos anteriores em `template_codigo`/metadata e fallback legado por tipo. Valores nulos são aceitos sem falsa escolha do default.
- `snapshotText` não serializa objetos arbitrários: apenas chaves de apresentação conhecidas, com labels legíveis; UUIDs, IDs internos, keys, campos desconhecidos e null não são impressos. Arrays deduplicam textos equivalentes sem fundir campos diferentes. Envase/Vínculos/Conformidade têm vocabulário específico de campos úteis.
- Correção exige `nova_etiqueta_id` UUID válido, substitui a etiqueta anterior nos IDs e na seleção com deduplicação, atualiza a URL canônica e relê a substituta. Seleção persiste no parâmetro `selected` após reload; não concede acesso. Falha sem ID positivo mantém tentativa incerta, sem falso sucesso.
- Impressão/PDF requer CQ explicitamente liberado e status permitido, sem substituta já vinculada. CQ null/false, cancelada, substituída ou status desconhecido ficam bloqueados antes da RPC.
- CSS de impressão das páginas de etiqueta é **fechado por padrão**, inclusive sem sessão. Só a chamada programática após ACK abre atributo one-shot no root existente. Ctrl+P/Meta+P são interceptados; impressão pelo menu/beforeprint fora da janela continua sem etiquetas. `afterprint`, retorno de `window.print`, revogação de contexto e unmount removem permissão. PDF não abre janela CSS.
- A permissão é contenção local de apresentação, não autorização server-side. O servidor permanece autoridade da RPC e do RLS; não protege contra usuário deliberadamente alterando DOM/código ou capturando tela.

## Verificações executadas
- **150 testes / 12 arquivos PASS**: `bun run test -- src/test/etiquetas src/test/envase src/test/lotes/consulta.test.ts --maxWorkers=2`; `vitest.log`.
- Nova fixture sintética segue campos conhecidos do SQL: template aninhado/versionado, valores null, IDs internos, CQ e vínculo de substituição. Não foi emitida nem consultada no banco.
- Regressões: quatro dimensões via snapshot e versão persistida, compatibilidade antiga, precedência, campos úteis sem IDs, deduplicação, ACK de substituta, seleção/reimpressão da substituta, falha/mesma chave, CQ/histórico, Ctrl+P/Meta+P, beforeprint/afterprint e disposal.
- Playwright/Chromium, componentes reais com fronteiras Auth/Supabase mockadas e HTTPS externo bloqueado: 1280×1800/390×1800, quatro medidas corretas, sem overflow ou pageerror; correção seguida de releitura da substituta e impressão auditada mockada. Atributo `true` durante chamada de impressão e ausente após `afterprint`.
- PDF sintético medido por pypdf: **100×150, 100×100, 80×50, 50×30 mm exatos**. Nenhum UUID interno/`perfil_key` impresso. QR **4/4** decodificado a 300 dpi com URL opaca esperada.
- Ctrl+P seguido de media print: todos os rótulos com `display:none`; `print-without-permit.pdf` sem texto de etiquetas. Teste evita falsa certificação por somente interceptar teclado.
- Build/typecheck automático observado **build OK em 04:17:35 UTC**. Não executado build/typecheck manual.
- Revisão automática observada: `6eb26a75499c4473cb47578673e52171a2a337b0`; documentação posterior pode gerar outra revisão. Hashes dos consumidores em `source-sha256.txt`.

## Arquivos e limites
Alterados `src/lib/etiquetas.ts`, `src/pages/etiquetas/EtiquetaProdutoPrintPage.tsx`, `src/components/etiquetas/etiquetas.css`, `src/test/etiquetas/recipientes.test.tsx`, `AGENTS.md`, `roadmap.md`; adicionados `src/lib/etiquetasPrintPermit.ts`, `src/test/etiquetas/{rpcFixture.ts,revisaoCanonica.test.tsx}` e estas evidências.

**Sem banco, SQL, migração, deploy, binding, Publish ou dados reais.** Sessões/JWT/RLS/Storage e impressora física não exercitados. A revisão usa o contrato fornecido pelo proprietário e estrutura conhecida do SQL local, sem recaptura hospedada. Campos desconhecidos no snapshot ficam omitidos, não inventados; novos campos úteis devem entrar explicitamente no vocabulário.

Reversão: somente revisão de frontend aprovada; não remover guards de banco nem restaurar CSS print aberto/serialização arbitrária. O relatório inicial descreve a implementação histórica anterior; esta revisão substitui a lacuna sobre Ctrl+P e corrige seus exemplos de template/correção.