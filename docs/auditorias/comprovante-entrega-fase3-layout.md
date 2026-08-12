# Fase 3 — Homologação visual do Romaneio e do Comprovante de Entrega AR Bio

Data: 2026-08-12 · Ambiente: staging `ikaauvsflpmamgxmkhoq` (somente leitura nesta fase; nenhuma alteração de banco).

## 1. Diagnóstico do layout anterior

`src/lib/comprovanteEntregaPdf.ts` (v1) apresentava:

- faixa sólida colorida de 30 mm no topo em todas as emissões (consumo alto de tinta, pouca hierarquia);
- ausência de selo textual de status — o tipo do documento dependia de uma frase pequena ("Documento definitivo/provisório") e da cor;
- tabela de itens com 7 colunas, sem `Embalagem` e sem `Vol. unitário` separados, e volume sempre em litros (`0,50 L` para 500 mL);
- uso de `"Não informado"` para campos legitimamente opcionais;
- OS exibida dentro do bloco Destinatário, sem distinção entre OS de laboratório, OS On-Farm e pedido de parceiro;
- ausência de bloco de resumo (itens/embalagens/volume consolidado);
- rodapé desenhado apenas na última página, sem `Página X de Y`; blocos podiam colidir com o rodapé em documentos longos;
- assinatura renderizada em posição fixa, sem verificação de espaço restante;
- romaneio sem texto legal próprio e sem sinalização inequívoca de não-confirmação;
- UX: dois botões genéricos (ícone `FileDown` sem rótulo) idênticos para qualquer status.

## 2. Arquivos alterados

| Arquivo | Natureza |
| --- | --- |
| `src/lib/comprovanteEntregaPdf.ts` | Reescrita do renderer (layout v2) + refatoração para preview |
| `src/pages/Entregas.tsx` | Rótulos de ação por status + integração de preview |
| `src/components/entregas/PreviewDocumentoEntrega.tsx` | Novo — Componente de pré-visualização A4 |
| `src/test/entregas/comprovanteEntregaPdf.test.ts` | Novo — 24 testes de renderer/decisão |
| `docs/auditorias/comprovante-entrega-fase3-layout.md` | Este relatório |

Nenhuma migration, RPC, política RLS, grant, sequence ou snapshot foi tocado.

## 3. Decisões de design

- **A4 retrato, fundo branco.** Cor institucional (`branding.cor_primaria`, verde AR Bio via `useSystemConfig`) usada apenas em títulos de bloco, número do documento e filete de cabeçalho. Sem faixas sólidas de página inteira.
- **Status nunca depende só de cor:** selo textual em caixa de contorno — `DOCUMENTO OPERACIONAL — RECEBIMENTO NÃO CONFIRMADO` ou `ENTREGA CONFIRMADA`.
- **Slogan:** não hardcodado. `DocumentoEntregaBranding.slogan` é opcional e só é impresso se a configuração de branding fornecer o valor; hoje `useSystemConfig` não expõe slogan, então nada é impresso.
- **Nada de `Não informado`:** helper `txt()` devolve `—` para ausência legítima.
- **Volume humano:** `formatarVolume` imprime `500 mL` abaixo de 1 L e `10 L` / `1,50 L` acima.
- **Origem amigável:** `rotuloOrigem()` traduz `tipo` do payload em `Ordem de Serviço`, `OS On-Farm` ou `Pedido Parceiro B2B`. Nunca imprime `partner_order`, nome de coluna ou UUID (o `os_id` do payload é ignorado na renderização).
- **Hash:** abreviado visualmente (`aaaaaaaaaa…bcdefg`), com o valor completo permanecendo no payload.
- **Reemissão:** rodapé mostra `2ª via — reemissão do mesmo documento` (ou `Nª via`) quando `reemissoes > 0`, sem sugerir documento novo.
- **Logo:** `loadImageDataUrl` detecta PNG/JPEG pelo `blob.type`, trata `res.ok`, falha de CORS, ausência de `fetch`/`Image` e exceção de `addImage`. Em qualquer falha o PDF continua sendo gerado, apenas sem logo.

## 4. Romaneio x Comprovante

| Elemento | Romaneio | Comprovante |
| --- | --- | --- |
| Selo | `DOCUMENTO OPERACIONAL — RECEBIMENTO NÃO CONFIRMADO` | `ENTREGA CONFIRMADA` |
| Cabeçalho | emissão + origem | emissão + **data/hora da entrega** + origem |
| Bloco final | `Conferência` (aguardando confirmação) | `Recebimento` (recebido por, cargo, documento, data/hora, ressalvas, evidência de assinatura quando houver, `Registrado no sistema por`) |
| Assinaturas | ausentes | recebedor + entregador (apenas identificação; nenhuma assinatura digital fictícia) |
| Hash de autenticidade | não | sim, abreviado |
| Texto de rodapé | `Documento operacional para conferência e transporte. O recebimento físico ainda não foi confirmado.` | `Este documento comprova exclusivamente a entrega física dos produtos nele relacionados. Não substitui documento fiscal, receituário agronômico, prescrição técnica ou laudo técnico quando legalmente exigíveis.` |

O `aviso` retornado pelo backend, quando presente, tem precedência sobre o texto padrão (`avisoDocumento`).

## 5. Multi-item e paginação

- Tabela `Produtos entregues` com 9 colunas: Produto | Microrganismo/Cepa | Lote | Fabricação | Validade | Embalagem | Qtde. | Vol. unit. | Vol. total.
- `overflow: "linebreak"` e larguras fixas garantem quebra controlada de Produto/Microrganismo sem truncamento.
- `margin.bottom = 28 mm` impede colisão com o rodapé; `didDrawPage` redesenha um cabeçalho **compacto** (logo reduzida, nome, título, número) nas páginas 2+; o autoTable repete o cabeçalho da tabela automaticamente.
- Rodapé de resumo (`showFoot: "lastPage"`): total de itens, total de embalagens e volume consolidado — soma puramente visual sobre o payload (`resumirItens`), sem persistência nem alteração de regra.
- Bloco de assinatura verifica o espaço restante e migra para nova página quando necessário.
- Rodapé (aviso + número + hash + reemissão + `Página X de Y`) é reimpresso em todas as páginas ao final da geração, com o total já conhecido.
- Cenários exercitados por teste: 0, 1 e 12 itens.

## 6. UX de Pré-visualização e Botões

Implementada pré-visualização em Dialog A4 antes do download. O renderer institucional é invocado para gerar um Blob de preview, garantindo fidelidade 1:1 com o arquivo baixado.

### 6.1 Detecção confiável de snapshot/reemissão (correção final)

O rótulo dependia de `e.comprovante_numero`, campo que a query de listagem **não** carregava — logo a flag era sempre falsa. Correção aplicada sem backend:

- A mesma query de `entregas` passou a embutir a relação já existente `entrega_comprovantes!entrega_comprovantes_entrega_id_fkey(id, tipo, numero_formulario, metadata, gerado_em)` — sem N+1, sem RPC nova, sem tabela nova, respeitando a RLS vigente.
- Helper puro `possuiComprovanteDefinitivo(entrega)` em `src/lib/comprovanteEntregaPdf.ts` só considera definitivo o registro cuja `metadata` contém a chave canônica `comprovante_snapshot_v1` (a mesma gravada por `fn_comprovante_entrega_montar_v1`). Formulários legados (`formulario_entrega`, `termo_recebimento`) e `metadata` nula/inválida **não** contam.
- `selecionarComprovanteDefinitivo` resolve arrays de forma determinística (`gerado_em` desc, depois `id` desc) apenas para detecção visual; o conteúdo do documento continua sendo montado no servidor.
- Após a primeira emissão definitiva (`p_reemissao=false` com `doc_tipo='comprovante'`), a query `entregas` é invalidada, de modo que a próxima ação já exibe `Reemitir comprovante`.

`rotuloAcaoDocumento({ confirmada, possuiSnapshot })`:

- não confirmada → **Gerar romaneio**;
- confirmada, sem snapshot canônico → **Baixar comprovante** (`p_reemissao = false`);
- confirmada, com snapshot canônico → **Reemitir comprovante** (`p_reemissao = true`).

`p_reemissao=true` só é enviado por clique explícito e apenas quando `possuiComprovanteDefinitivo(e)` é verdadeiro; não há chamada automática em abertura de tela, refresh ou navegação. Aplicado tanto na tabela desktop quanto no `MobileCard`.

### 6.2 Mensagens de erro da Fase 2

`ERROS_COMPROVANTE` passou a mapear também `COMPROVANTE_OS_OBRIGATORIA` (orienta vincular OS, OS On-Farm ou pedido de parceiro legítimo), `COMPROVANTE_VOLUME_OBRIGATORIO` (volume total válido e maior que zero) e `COMPROVANTE_PARAMS_INVALIDOS`. Erros desconhecidos continuam sendo exibidos na íntegra — nada é mascarado.

### 6.3 Painel legado renomeado

O antigo botão `Documento` abria `EntregaComprovantePanel` + `EmbalagensEntregaPanel` + `TermoEntregaPanel` — evidências e termos, não o PDF canônico. O recurso foi **preservado integralmente**; apenas os rótulos mudaram: botão → **Evidências**, título do dialog → **Evidências e termos da entrega**, com `title` explicativo (assinatura, embalagens e checklist).
### 6.4 Preview não contabiliza reemissão (fechamento controlado)

Regra implementada com helper puro `decidirReemissaoNoDownload({ docTipo, possuiSnapshotAntes })`:

| Situação | Abertura do preview | Clique em "Baixar Documento" |
| --- | --- | --- |
| Romaneio (não confirmada) | `p_reemissao=false` | nunca reemite |
| Comprovante — primeira emissão | `p_reemissao=false` (congela o snapshot) | usa o payload já recebido, **sem segunda chamada** |
| Comprovante — já com snapshot | `p_reemissao=false` | nova RPC com `p_reemissao=true`, **uma única vez** |

- `possuiSnapshotAntes` é capturado **antes** de abrir o preview (`possuiComprovanteDefinitivo(e)`) e guardado no estado junto com `previewEntregaId`, de modo que a decisão do download não depende do refetch intermediário.
- Fechar/cancelar o preview limpa `previewPayload`, `previewEntregaId` e `previewSnapshotAntes` sem qualquer chamada RPC — nunca incrementa contador.
- Não há reemissão automática em mount, refresh ou navegação: `p_reemissao=true` só existe no caminho de clique explícito.
- Após o download, `queryKey: ["entregas"]` é invalidada.

### 6.5 Higiene de recursos do preview

`PreviewDocumentoEntrega.tsx` passou a manter a Object URL viva em `urlRef`, eliminando a closure obsoleta que impedia a revogação. `revogarUrl()` é chamada ao trocar payload, ao fechar o dialog e em um `useEffect` de desmontagem dedicado. As dependências do efeito são `[open, payload, revogarUrl]` (`revogarUrl` é `useCallback` estável), sem ciclo de regeração do blob.

## 7. Testes executados

| Teste | Resultado |
| --- | --- |
| `src/test/entregas/comprovanteEntregaPdf.test.ts` | **43/43 PASS** (layout + detecção de snapshot + semântica de reemissão + gates estáticos de tela) |
| `tsgo --noEmit` | **PASS** (sem diagnósticos) |
| Vitest completo | **2819 passed / 4 skipped — ZERO FAIL** (171 arquivos) |
| `bun run build` | **PASS** |
| `src/test/config/connection-binding.static.test.ts` (final) | **8/8 PASS** |

Provas específicas cobertas: ausência de import/consulta Supabase no renderer e no preview; romaneio sem linguagem de confirmação/assinatura; comprovante com recebedor, data/hora e aviso definitivo; formatação de origem nas três modalidades sem nome técnico/UUID; multi-item com 12 linhas, `didDrawPage` e rodapé de resumo; geração resiliente a falha de logo (CORS). Gates de detecção: sem relação → `Baixar comprovante`/false; formulário legado sem snapshot → false; snapshot canônico → `Reemitir comprovante`/true e número `CE-2026-000007`; relação como objeto único; ordenação determinística; `metadata` nula/string/`snapshot=null` rejeitadas; entrega não confirmada permanece em `Gerar romaneio` mesmo com snapshot. Gates de reemissão: romaneio nunca reemite; primeira emissão não vira reemissão; comprovante existente reemite uma única vez; `doc_tipo` ausente/desconhecido nunca reemite; existe **exatamente uma** ocorrência de chamada RPC com `true` no arquivo; relação e campos mínimos presentes na query; erros da Fase 2 mapeados; botão legado exposto como `Evidências` com os três painéis preservados; revogação de Object URL por ref.

Base validada desta fase: commit `ec4801cb744be6ef89d4df0261177019a68d5c1a`.

O Fast Visual Edit `b90ada5d` voltou a alterar `.env` e reduziu `src/integrations/supabase/types.ts` a 155 linhas. `.env`, `client.ts`, `types.ts` e `supabase/config.toml` foram restaurados via `git show ec4801cb:<arquivo>`, sem imprimir chaves, DSN ou segredos. Estado final: `types.ts` com **21.850 linhas**, `config.toml` apontando para o staging `ikaauvsflpmamgxmkhoq`, `connection-binding.static.test.ts` **8/8 PASS**, com a suíte completa reexecutada depois da restauração.

Diff acumulado sobre a base (`git diff --name-only ec4801cb`) contém apenas `docs/auditorias/comprovante-entrega-fase3-layout.md`, `src/components/entregas/PreviewDocumentoEntrega.tsx`, `src/lib/comprovanteEntregaPdf.ts`, `src/pages/Entregas.tsx` e `src/test/entregas/comprovanteEntregaPdf.test.ts`: nenhuma migration, função, policy ou config de backend foi alterada.

## 8. Confirmações de escopo

- Nenhuma alteração em RPC, RLS, grants, migrations, sequences, snapshots, numeração CE ou gates de OS/volume/produto/lote/cliente/recebedor da Fase 2.
- O frontend apenas renderiza o payload de `rpc_get_comprovante_entrega_data`; nenhuma tabela adicional é consultada no gerador; nenhum segundo motor de PDF foi criado.
- Produção (`navfzbwgwzruipouyfnk`) não foi acessada. Nada publicado, nada implantado, nenhuma integração SEFAZ acionada, nenhum segredo exposto.
- QR público não implementado (fora de escopo desta fase).

## 9. Riscos residuais para a Fase 4

1. **Slogan/identidade**: `useSystemConfig` ainda não expõe slogan nem cor secundária; o renderer já aceita, falta a configuração.
2. **Validação visual em browser real**: a suíte usa mock de jsPDF/autoTable; ainda não houve inspeção de PDF renderizado com logo real e nomes longos de produto/microrganismo.
3. **`possuiSnapshot` na listagem — RESOLVIDO**: a detecção passou a usar a relação `entrega_comprovantes` carregada na própria query e o helper puro `possuiComprovanteDefinitivo`, ancorado na chave canônica `comprovante_snapshot_v1`. Não depende mais de campo inexistente na listagem; formulários legados não disparam reemissão.
4. **Evidência de assinatura**: quando `assinatura_tipo` existir, é apresentada como texto; a representação gráfica de evidência real fica para fase posterior.

---

**FASE_3_LAYOUT_APTA_PARA_HOMOLOGACAO**

---

## 10. Último gate da Fase 3 — reemissão contabilizada só no download

Correções estritamente de frontend/testes/docs (zero alteração em `supabase/` ou SQL):

- **Abertura do preview**: `handleGerarDocumento` chama a RPC com a constante explícita
  `REEMISSAO_NA_ABERTURA_DO_PREVIEW` (`false`) para romaneio, comprovante novo e reemissão.
  O booleano `eraComprovanteExistente` (`possuiComprovanteDefinitivo(e)` no instante do clique)
  e o `entregaId` são congelados no estado do preview.
- **Download**: `handleDownloadPreview` é o único ponto que pode contabilizar reemissão.
  Usa o helper puro `deveReemitirNoDownload({ docTipo, eraComprovanteExistente })`;
  comprovante já existente refaz a RPC com `p_reemissao=true` e gera o PDF com o payload NOVO;
  primeira emissão e romaneio reaproveitam o payload do preview sem segunda chamada.
  Em todos os casos `['entregas']` é invalidada ao final.
- **Fechar sem baixar**: nenhuma chamada com `true`; o estado do preview é limpo.
- **Duplo clique**: estado `downloadingPreview` com guard de reentrada, botões desabilitados,
  spinner e bloqueio de fechamento enquanto processa (prop `downloading` no preview).
- **Object URL**: revogação por `urlRef` na troca de payload, no fechamento e na desmontagem.

Gates finais: `tsgo --noEmit` **PASS** · Vitest completo **2822 passed / 4 skipped — ZERO FAIL** ·
`bun run build` **PASS** · `connection-binding.static.test.ts` **8/8 PASS** (binding e `types.ts`
com 21.850 linhas restaurados de `ec4801cb` após novo reset da plataforma, sem expor segredos).
Produção não acessada, nada publicado, SEFAZ não acionado.

**FASE_3_LAYOUT_APTA_PARA_HOMOLOGACAO**
