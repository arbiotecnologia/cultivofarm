# Roteiro controlado futuro — não executado nem autorizado nesta rodada

## 0. Entrada fail-closed

- Responsável independente registra autorização específica para fixtures/sessões/mutações controladas e atesta ref `swzpzcwiasxmjutrmvkm` por binding/config externo; nunca Cloud/outro ref. Não executar runners legados com defaults de outros projetos.
- Ler plano original, A2 e oito gates OS/entrega; comparar corpos instalados, ACL tabela/coluna/funcão/PUBLIC, triggers/RLS/FORCE/policies, Storage privado e flags. Se dependência ausente/NO-GO, marcar IDs BLOCKED e parar aquele caminho, não forçar status/ticket/GUC/grant.
- Ambiente controlado dentro do destino canônico, isolamento de fixtures confirmado; snapshot/backup auditável antes de mutação. Não usar cliente/produto real de produção para completar vazio.
- Fiscal apenas homologação/mock comprovado e sem transmissão real; comunicação externa/push/email/WhatsApp OFF comprovados no servidor. Ausência de segredo/var não comprova flag configurada.

## 1. Identidades e fixtures próprias

- Inventariar usuários reais autorizados A/B/C com IDs internos em arquivo privado, nunca tokens/senhas no relatório. Confirmar papel servidor, tenant, profile ativo, senha definida, vínculos e planos/features.
- A/B pares positivos/negativos; C sem vínculo; parceiro gestor/técnico isolado/produtor exclusivo e cumulativos; multi-vínculo mesma empresa e vínculo entre empresas explicitamente aprovado. CQ/logística mapeados a papéis reais, sem criar enum/papel novo.
- Manifesto imutável de IDs criados pela auditoria: cliente/fazenda/talhão/parceiro/produto autorizado/planejamento/pedido/OS/programação/lote/CQ/envase/estoque/entrega/arquivo/título/parcelas/documento mock. Referências existentes reutilizadas só com permissão explícita; sem classificação fiscal inventada.
- Setup só via provisionamento/RPC canônicos aprovados. Não editar Auth/roles/vínculos diretamente para obter PASS. Fixtures marcadas e limites monetários/quantidade auditados antes do teste.

## 2. Prova por passo e matriz

- Consumir CSV de cenários; expandir IDs de perfil/tarefa/vínculo/status. Cada cenário registra precondição, versão, ator/tenant permitido, endpoint, request sem segredo, status HTTP/SQL, leitura antes/depois e trilha/receipt/ledger.
- Catálogo/carrinho: própria elegibilidade/volume/preço servidor; alterações inválidas/fora vigência/custo/quantidade; técnico sem compra; hash/snapshot preservado entre simulação e pedido.
- Pedido/comercial/crédito: solicitação/aprovação/reprovação, plano/método/RECEITA, billing na aprovação ou entrega conforme contrato instalado; parcelas positivas/soma/exatas/imutáveis; perda ACK/replay com mesma intenção e chave; técnico/cross-tenant negado.
- Manual OS e B2B: caminhos distintos, aprovação/programação separadas, vínculo/item/origem snapshots; não substituir por conversão visita. Lote/CQ: referência ativa completa, aprovado/reprovado, medidas limites, sem autoenvase/tickets forjados.
- Envase/estoque/entrega: volume finito, parcial somente contrato aprovado; batch item N, split alvo/ledger/receipt, expedição integral/preexistente, documentos comprovante/bytes, cancelamento versus retorno e reconciliação títulos. Falha filho não anuncia sucesso ou rollback falso.
- Fiscal mock e BI: documento pai/itens tenant, CAS versão, erro após recebível não regenera cobrança; BI reconcilia números das fixtures; nenhum envio real.

## 3. Concorrência/revogação e conectividade

- Duas conexões/sessões reais A/B: observar `pg_stat_activity`/bloqueio/pids sem tokens. Gate/advisory/linha e filhos: revogação canônica commitada durante wait→nega sem efeito; mutação primeiro→commit auditável, revogação posterior não apaga história. Organização/feature/vínculo/revogado/transferido têm writer canônico específico; indisponível=BLOCKED.
- Testar mesma chave/intenção, chave divergente, dois itens ordem invertida, timeout55P03, serialização40001 genuína distinta de PT409; falha no item N e POST; não classificar revogar-e-tentar como revogação durante espera.
- Offline/reconexão/ACK perdido, duplo clique no mesmo tick/abas/remount, token renovado/stale/revogado e tenantA→B→A enquanto await. Não reler/rebase silencioso de draft; reconciliar status/receipt antes de nova intenção.

## 4. Segurança/UX

- A→B/B→A/C/anon por URL/query/payload/UUID válido alheio/inválido, parent/child IDs e path arquivo; REST direto além UI. SELECT permitido não implica DML; DEFINER exige guards após waits; grants/RLS/column ACL verificados efetivamente.
- URLs antigas sem cachebuster, resposta bytes com sessão atual e pós-revogação, CDN/link copiado/stream/ZIP/auth stale; não gerar URL assinada no browser. Somente own scope lê, anexos financeiros sem canal DELIVERY indevido.
- SQL injection via campos textuais tratada como dados, whitelist e parâmetros; nenhum log/storage/browser contendo secret. Não colar tokens em screenshot ou HAR.
- Desktop1280×1800/mobile390×844, teclado/tab/foco modal/erro, leitor de tela/status, contraste/zoom, textos sem sobreposição; campos preenchidos, vazio/loading/403/404/PT409/55P03/offline; UI nunca mostra dados do contexto antigo.

## 5. Cleanup auditável, sem apagar história

- Responsável compara manifesto antes/depois; executar cancelamento/estorno/soft-delete canônicos permitidos, não DELETE arbitrário/reverter snapshot. Títulos/movimentos/audit trail/receipts históricos preservados; indicar fixtures retidas e saldo final.
- Arquivos: só IDs/path exatamente próprios e aprovação explícita, sem bucket wipe. Objetos órfãos listados para decisão, não cleanup destrutivo automático. Remover privilégios temporários via provisionamento canônico se autorizado; registrar sem senha/JWT.
- Verificar zero dados alheios alterados, zero comunicação/NF, saldos/parcelas/BI reconciliados e lista de resíduos esperados. Falha cleanup é FAIL/BLOCKED visível, não retry automático.
- Anexar matriz atualizada com evidências reais e revisão independente. Permanecer NO-GO onde faltam provas; publicação não substitui auditoria pós-implantação.