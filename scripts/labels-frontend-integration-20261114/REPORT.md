# Integração de etiquetas — projeto principal — 14/11/2026

## Aplicado somente no código
- Entradas **Envase → Gerar etiquetas**, **Lotes → Gerar etiquetas** e embalagem individual/lote reutilizam `EtiquetaProdutoActions` e o gerador `rpc_gerar_etiquetas_recipientes_v1`. Payload contém exatamente envase OU lote, tipo e código do modelo. Não há vínculo manual posterior nem gerador legado nessas entradas.
- A geração cobre recipientes do root escolhido, conforme contrato existente. A seleção de um/vários recipientes para saída acontece na página canônica `/etiquetas/:id/imprimir?ids=...`; a lista de UUIDs não concede acesso. Leituras são feitas pelo cliente existente, sujeitas ao RLS, em lotes de 100; falta de qualquer etiqueta aborta a consulta.
- Modelos físicos 100×150, 100×100, 80×50 e 50×30 mm. Reduzidos preservam identificação/lote/validade/QR; dados completos autorizados ficam expansíveis e no rastreio. Conteúdo extenso que exceda o formato impede impressão/PDF e pede formato maior; não é truncado silenciosamente como resultado válido.
- Marca e logo vêm de `snapshot.empresa`, nunca da empresa da sessão ou marca inventada. Ausência de marca não é preenchida artificialmente. PDF exige carregamento do logo real; falha de imagem/CORS aborta a saída.
- Prévia, seleção, impressão A4/térmica e PDF de múltiplas páginas. A saída ocorre apenas depois do sucesso de `rpc_imprimir_etiquetas_recipientes_v1` com IDs e motivo. PDF é preparado antes do writer, mas não baixado antes da confirmação. Motivo mínimo de três caracteres na interface.
- Correção usa somente observações/modelo/motivo/chave UUID em `rpc_corrigir_etiqueta_produto_v1`. Falha conserva chave/intenção; intenção diferente fica bloqueada e não existe retry automático. Reconsulta depois de sucesso.
- QR usa exclusivamente `https://app.cultivofarm.com.br/rastrear-produto/<token-opaco>`, margem silenciosa de quatro módulos. Não contém UUID de produto/recipiente, JSON ou credencial.
- Novo rastreio autenticado usa `rpc_consultar_etiqueta_qr_v1`, exige `autorizado === true`. Sem sessão, o leitor público legado continua limitado pelo contrato server-side existente; códigos não públicos apresentam o login canônico na mesma página. Nenhuma nova rota ou alteração em App/guards.
- Contextos de geração/embalagem/impressão/rastreio usam a fence existente de identidade/tenant/roles/época e descartam respostas tardias. Nenhum cancelamento de etiqueta foi habilitado.

## Evidências executadas
- **134 testes / 11 arquivos Vitest PASS**, `bun run test -- src/test/etiquetas src/test/envase src/test/lotes/consulta.test.ts --maxWorkers=2`. Incluem regressões existentes, payload XOR, quatro medidas, ACK, falhas, seleção individual, correção/chave/intenção, troca/revogação, login/legado e negativa de autorização. Mocks sem tráfego produtivo. Log: `evidence/vitest.log`.
- Build/typecheck automático: **build OK**, registro observado `2026-11-14T04:12:46Z`; nenhum build/typecheck manual foi executado.
- Playwright/Chromium sintético em 1280×1800 e 390×1800, módulos reais com fronteiras Auth/Supabase substituídas e HTTPS externo abortado. Sem overflow global nem pageerror; quatro layouts sem overflow no conteúdo sintético. Ensaio exerceu seleção, PDF com writer mockado e correção com releitura.
- `etiquetas-sinteticas.pdf`: quatro páginas; pypdf mediu exatamente **100×150, 100×100, 80×50, 50×30 mm**. Conteúdo identificado como teste sintético.
- QR das quatro páginas rasterizadas a 300 dpi: **4/4** decodificados com ZXing-C++, URL opaca exata. QR da impressão A4 a 150 dpi: **4/4**.
- `convencional-a4.pdf`: quatro páginas A4, textos SYN-1..4 presentes e etiquetas visíveis. O primeiro ensaio expôs conflito com CSS global de relatórios (visibility hidden); corrigida especificidade exclusivamente no escopo das etiquetas e repetido o mesmo ensaio com resultado positivo.
- Evidências e hashes em `evidence/`. PDFs são teste offline, não representam impressão/auditoria real.

## Arquivos
- `src/lib/etiquetas.ts`, `src/lib/etiquetasPdf.ts`.
- `src/components/etiquetas/{EtiquetaProdutoActions,EtiquetaProdutoPrint,QRCodeRastreioProduto}.tsx`, `etiquetas.css`.
- `src/pages/etiquetas/EtiquetaProdutoPrintPage.tsx`, `src/pages/public/RastrearProduto.tsx`.
- `src/pages/{EnvasePage,Lotes,EstoqueEmbalagens}.tsx`.
- `src/components/estoque/{GerarEtiquetaEmbalagemDialog,GerarEtiquetasLoteDialog}.tsx`.
- `src/test/etiquetas/{recipientes,rastreioAutorizado}.test.tsx`, regressão `src/test/envase/envasePageReadOnly.test.tsx` atualizada para a autorização expressa de etiquetas (complemento/criação de embalagem continuam sem montar).
- `AGENTS.md`, `roadmap.md` e este pacote de evidências.

## Revisão e reversão
- Base observada antes da integração: `2e755af4f9f3d1e256d173908c7830d290b26854`.
- Revisão automática observada após código e evidências: `edc878ebfb590d260958efb3e8713fe8c45d69ac`. O sistema gerencia commits; nenhum commit/checkout/reset foi executado pelo agente. A atualização documental final pode gerar revisão posterior. Hashes do código estão registrados em `evidence/source-sha256.txt`.
- Reversão exclusivamente de frontend: remover as novas entradas de geração e restaurar os consumidores anteriores por revisão aprovada; conservar server-side RLS, ACL, snapshots, rastreio e histórico. Não executar rollback SQL, não mudar binding e não reabrir cancelamento ou writers legados. Nenhuma reversão automática foi feita.

## Limites e ações não executadas
- **Zero SQL, migrations, deploy, Publish, alteração de binding ou consultas/escritas/testes no banco produção.** Paridade do banco foi informada pelo proprietário, não recertificada pelo agente.
- JWT/RLS/Storage reais, logo privado real, impressão térmica física, IAB/Chrome do usuário e scanner físico não foram exercitados. Não houve criação de etiqueta real nem simulação de usuário.
- O contrato de impressão/correção fornecido não especificou o formato do retorno; transporte sem erro é tratado como sucesso, incluindo retorno void/null, mas envelopes explicitamente negativos são recusados. Se o banco retornar outro envelope de negação, sua forma precisa ser conhecida para adicioná-la; não foi consultado o banco para inferir.
- Impressão via Ctrl+P do navegador não é auditável pela aplicação; o fluxo dos botões é auditado. PDF reduzido exige conteúdo que caiba; o contrato permite correção de formato.
- Logos HTTPS que demandem CORS/autorização especial podem impedir exportação PDF, sem saída falsa. Nenhum mecanismo paralelo de URL assinada foi inventado.
- Correções incertas conservam tentativa somente durante esta montagem; após reload, exigem consulta da situação atual. O servidor permanece responsável por idempotência e autoridade.
- A limpeza QA anterior continua bloqueada pelo canal administrativo ausente; está fora deste pedido, que proíbe dados/banco. Nenhum alvo QA/Bombarbio foi acessado.

**Frontend disponível apenas na prévia; publicação não realizada.**