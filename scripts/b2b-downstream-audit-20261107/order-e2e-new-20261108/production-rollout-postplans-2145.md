# Rollout incremental em produção — caller de OS/UI, PREPARADO e DESATIVADO

**Destino exclusivo: `swzpzcwiasxmjutrmvkm`. Nenhuma instalação, ativação, publicação ou sessão autenticada foi executada pelo Lovable.** O isolamento de planos `cc1f6cc…` já está instalado pelo auditor e não faz parte deste rollout.

## 0. Entrada obrigatória e bloqueios

1. Revisão independente final dos candidatos e aprovação específica do proprietário para cada estágio. Os testes locais não aprovam instalação.
2. Controle positivo ARBio dos planos em sessão real: listar somente os planos do próprio tenant; FSF já relatado com zero após reload. Não executar escrita FSF para esse controle.
3. Captura READ ONLY atual da produção POSPLANOS e comparação com os pins das evidências `review-postplans-2145`. Não usar o PRE de planos nem qualquer instalador combinado que reinstale planos.
4. Inventariar as dependências físicas já presentes: catálogo por empresa/apresentação, B3/C2, motor e batch de estoque, compra de produto acabado, grupo/cancelamento, envio físico, comprovante/Storage e confirmação manual. Ausência ou divergência bloqueia este rollout; não importar fixtures, grants ou pacotes antigos para suprir a lacuna.
5. Manter contabilidade sem promoção artificial, `b2b_integration_dependencies` real always-deny, dez triggers/ACL de recebíveis, no-downstream, comunicação/provedores/NF/cobranças/pagamentos desligados. Cinco títulos teste4 e demais históricos intocados.
6. Revisar advisors atuais. O alerta `cpp_tenant_read/auth_rls_initplan` é tarefa de medição separada; não alterar policy ou grants neste rollout.

## 1. Logística de revenda, somente após aprovação

Artefatos exatos gerados na composição POSPLANOS:

- PRE/metadados: `evidence/review-postplans-2145/logistics/pre-metadata.json` e `raw-current.json`.
- Instalação revisável: `evidence/review-postplans-2145/logistics/install.sql.review`, SHA256 `56631263e6ebfe51e9f02822f72c98f895a728f762d3c0ef62c575e44ee7ec09`.
- Candidato: `candidate.sql.review`, SHA256 `8ad4def8d4ae3c2e86518f2d82bf57f053cee66b0d7e165b84472cb586812c20`.
- POST: `postflight.sql.review`; rollback: `rollback.sql.review`, deny-only.

O auditor deve comparar a captura LIVE com o PRE da composição. Se idêntico e aprovado, instalar em transação, executar POST e confirmar `platform_private.b2b_resale_logistics_gate_v1.enabled=false`. Não habilitar gate como consequência da instalação. Não instalar B4/ponte junto.

## 2. Endpoint público mínimo, gate ainda OFF

Diretório exato: `evidence/review-postplans-2145/os-endpoint/`.

1. Executar `01-pre.sql.readonly` somente depois da logística exata; drift = abortar.
2. Após autorização própria, instalar `02-install.sql.review`, SHA256 `21d40202d32e70dfbb44c7eb2a54a4135ebace840b301c15ab37b910cbfa0ee3`.
3. Executar `03-post.sql.readonly`. Único delta de ACL: `authenticated` recebe EXECUTE no endpoint público. `platform_private.b2b_resale_os_create_v1` permanece sem EXECUTE para authenticated/service_role/PUBLIC/anon; service_role não recebe grant novo no endpoint.
4. Confirmar gate OFF e chamada pública negada por `B2B_RESALE_GATE_CLOSED`, sem OS/ticket/recibo. Helper direto continua negado; não aceitar apenas erro de schema como prova de ACL.

## 3. UI candidata, ainda não montada

Fontes: `ui-candidate/ResaleOsAction.tsx` e `osRequest.ts`. Testes locais novos: 13/13; compatibilidade OS: 73/73; typecheck: exit 0.

Antes de qualquer integração/publicação, revisar e instalar separadamente:

- leitor/capability server-side da carteira canônica que forneça pedido, item, `updated_at` e OS no tenant vendedor;
- disponibilidade derivada desse contrato, nunca booleano local, IDs de URL ou SELECT privado;
- continuidade durável da `request_key` entre remount/reload e reconciliação de resposta incerta;
- montagem na página canônica sem novo writer, rota paralela ou cliente Supabase;
- testes de browser com ACK exato, CAS, replay, troca de ator/tenant/epoch e ausência de efeitos externos.

Até lá a UI permanece fora do runtime. Não publicar o botão como forma de testar o endpoint.

## 4. Ativação restrita e validação autenticada, somente por autorização posterior

Usar fixture sintética aprovada, identificada e preservada, criada pelos fluxos normais pelo auditor/usuário. Nada de contas Auth, vínculos, contabilidade ou configuração criados por SQL de harness. Piloto/gate estritamente no tenant e atores aprovados; nunca `enforced` global.

Executar o roteiro `authenticated-partials-review-40186.md`: OS por endpoint, uma entrega de 1 de 3 com sucesso e pedido ainda aprovado, replay sem delta, restante 2, evento terminal único, concorrência e negativas de comprador/FSF/revogado/feature/pedido não aprovado/contabilidade pendente. FSF não deve escrever em planos; qualquer tentativa operacional negativa exige fixture aprovada e zero efeitos.

Reler por contratos autorizados e medir zero novos recebíveis, NF, alocações, snapshots fiscais, pagamentos, cobranças ou mensagens. Capturas não podem conter JWT, cookies, URLs assinadas ou segredos. Encerrar o gate ao final; resultado local não substitui essa etapa.

## 5. Reversão sem reabrir planos

Em incidente: retirar/indisponibilizar a UI se já montada, fechar gate, executar `os-endpoint/04-rollback-deny.sql.review` e o rollback logístico deny-only aplicável. Confirmar negação de novas chamadas e preservação de OS, estoque, entregas, comprovantes, recibos, ledger e snapshots.

**Não executar rollback de planos nem o rollback combinado antigo como parte desta reversão.** O isolamento `cc1f6cc…` permanece instalado. B4/ponte exigem decisões independentes e continuam fora do rollout.

Estado atual: **PREPARADO / INATIVO / NÃO APROVADO / NOT_RUN_AUTHENTICATED**. Nenhuma etapa acima autoriza o Lovable a operar produção.
