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

`rotuloAcaoDocumento({ confirmada, possuiSnapshot })`:

- não confirmada → **Gerar romaneio**;
- confirmada, sem snapshot → **Baixar comprovante** (`p_reemissao = false`);
- confirmada, com snapshot → **Reemitir comprovante** (`p_reemissao = true`).

`p_reemissao=true` só é enviado por clique explícito na ação de reemissão; não há chamada automática em abertura de tela, refresh ou navegação. Aplicado tanto na tabela desktop quanto no `MobileCard`.

## 7. Testes executados

| Teste | Resultado |
| --- | --- |
| `src/test/entregas/comprovanteEntregaPdf.test.ts` | **24/24 PASS** |
| `tsgo --noEmit` | **PASS** (sem diagnósticos) |
| Vitest completo | **2800 passed / 4 skipped — ZERO FAIL** |
| `bun run build` | **PASS** (built in 23.08s) |
| `src/test/config/connection-binding.static.test.ts` (final) | **8/8 PASS** |

Provas específicas cobertas: ausência de import/consulta Supabase no renderer; romaneio sem linguagem de confirmação/assinatura; comprovante com recebedor, data/hora e aviso definitivo; formatação de origem nas três modalidades sem nome técnico/UUID; multi-item com 12 linhas, `didDrawPage` e rodapé de resumo; geração resiliente a falha de logo (CORS).

Base validada desta fase: commit `d9c8a249b21266c037c068d58efb38ae324dafa6`.

Durante a execução o `src/integrations/supabase/types.ts` sofreu reset automático de plataforma (duas ocorrências, reduzido a 135/155 linhas) junto com `.env`; ambos foram restaurados a partir do commit base `d9c8a249` (types.ts com 21.850 linhas), sem exibir qualquer chave ou DSN. Binding revalidado após cada restauração — `connection-binding.static.test.ts` **8/8 PASS** na execução final.

Diff acumulado sobre a base (`git diff --name-only d9c8a249..HEAD -- supabase/`) retorna **vazio**: nenhuma migration, função, policy ou config de backend foi alterada. Os arquivos de produto tocados são `src/lib/comprovanteEntregaPdf.ts`, `src/pages/Entregas.tsx`, `src/components/entregas/PreviewDocumentoEntrega.tsx`, `src/test/entregas/comprovanteEntregaPdf.test.ts` e este relatório.

## 8. Confirmações de escopo

- Nenhuma alteração em RPC, RLS, grants, migrations, sequences, snapshots, numeração CE ou gates de OS/volume/produto/lote/cliente/recebedor da Fase 2.
- O frontend apenas renderiza o payload de `rpc_get_comprovante_entrega_data`; nenhuma tabela adicional é consultada no gerador; nenhum segundo motor de PDF foi criado.
- Produção (`navfzbwgwzruipouyfnk`) não foi acessada. Nada publicado, nada implantado, nenhuma integração SEFAZ acionada, nenhum segredo exposto.
- QR público não implementado (fora de escopo desta fase).

## 9. Riscos residuais para a Fase 4

1. **Slogan/identidade**: `useSystemConfig` ainda não expõe slogan nem cor secundária; o renderer já aceita, falta a configuração.
2. **Validação visual em browser real**: a suíte usa mock de jsPDF/autoTable; ainda não houve inspeção de PDF renderizado com logo real e nomes longos de produto/microrganismo.
3. **`possuiSnapshot` na listagem**: o rótulo `Reemitir comprovante` depende de o registro de entrega expor o número do comprovante; onde esse campo não vier, a ação exibe `Baixar comprovante` (comportamento seguro — não incrementa reemissão indevidamente, apenas rótulo menos específico).
4. **Evidência de assinatura**: quando `assinatura_tipo` existir, é apresentada como texto; a representação gráfica de evidência real fica para fase posterior.

---

**FASE_3_LAYOUT_APTA_PARA_HOMOLOGACAO**
