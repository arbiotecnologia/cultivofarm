# Roteiro E2E com usuários reais AR Bio / FSF (preparação — NÃO executado)

Pré-requisitos (bloqueantes): `preflight.sh` = PASS; itens MANUAL confirmados; os responsáveis entram com as PRÓPRIAS contas, em navegadores/perfis separados (A = AR Bio, F = FSF Agro). Não coletar senha, token, cookie ou JWT; não criar contas nem conceder acessos.
Produção: somente leitura. Massa sintética: só em ambiente isolado/homologação com envios externos desligados.
Proibido: emitir título real, boleto, NF, e-mail/WhatsApp; simular JWT como prova; contornar o bloqueio fiscal/contábil.

## Parte 1 — E2E até o bloqueio fiscal (validável)
Ver `checklist.json` (IDs S*, A*, F*, X*, B*). Cada item: resultado esperado, evidência sanitizada (print sem dados pessoais/CNPJ; IDs como hash sha256 curto), PASS/FAIL/BLOCKED.

## Parte 2 — Fluxo financeiro completo (NÃO VALIDÁVEL agora)
Título→parcelas Price→pagamento→estorno com dados reais permanece NOT RUN enquanto: contabilidade/fiscal (`C2_ACCOUNTING_PENDING`, Lucro Presumido/CRT1 não validados), NF de origem inexistente, boleto ausente do catálogo de produção, vínculo FSF↔cliente não executado e candidatos `.review` não instalados. Registrar como BLOCKED com o motivo, nunca PASS.

## Rollback / encerramento
Nenhuma escrita prevista em produção. Se algo for gravado por engano: parar, registrar hora/ID (hash) e acionar o auditor; não apagar histórico. Versão publicada anterior fica registrada no preflight.
