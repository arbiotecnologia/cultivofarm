# A+B — contrato de ativação posterior (NÃO executar nesta entrega)

Destino obrigatório swzpzcwiasxmjutrmvkm; validar por ferramenta/configuração, não GUC.

1. Revisar preflight A+B e producer-commercial-read e baseline Auth completo na MESMA transação da instalação; mismatch deve abortar. Não combinar candidatos com lifecycle antigo nem Storage .withdrawn.
2. Instalar candidatos com ACL fechadas; preservar owner postgres. Preflight dos readers verifica quatro hashes/owner/ACL; rollback é contenção, nunca restauração de leitura vulnerável.
3. Contrato mínimo a revisar para etapa posterior: authenticated EXECUTE apenas public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) e o core privado de mesma assinatura (wrapper INVOKER); service_role EXECUTE apenas b2b_finish_provisioning, b2b_prepare_provisioning_compensation e b2b_complete_provisioning_compensation(uuid,uuid,uuid). Não conceder leitura de receipts, Auth, roles ou DML cliente. O overload público de quatro args é legado, não necessário à UI integrada.
4. Para leitores Produtor, somente restaurar authenticated EXECUTE nas quatro get_portal_cliente_b2b_*_secure(uuid) após provas de JWT/RLS reais; helper privado sem EXECUTE cliente. Nunca GRANT isolado na versão legada.
5. Aplicar diff ao create-user existente apenas após revisão: deploy separado da instalação; flags B2B_PROVISIONING_CHANNELS_REVIEWED/EXTERNAL_USER_ACTIVATION_REVIEWED permanecem false. Não ativar Técnico B2B, convite/email ou senha operador.
6. Fixtures Auth AR já autorizadas, mas somente após revisão do pacote e confirmação de hooks/GoTrue/cascatas; nenhum privilégio service como identidade de usuário de teste. Login end-to-end não disponível neste ambiente external_unmanaged; revisão titular usa sessão própria, nunca credenciais enviadas em chat.
7. Rollback: fechar flags e RPCs, aplicar inverso restritivo A+B apenas quando instalado; preservar receipts/contas e limpar somente UUID+receipt comprovados. Compensação completed não apaga Auth; 404 na fase compensating apenas solicita complete SQL que verifica ausência e links exatos. Timeout fica pending, não duplica.

## Bloqueios concretos de abertura
- Pacote candidato ausente hospedado: o after não pode ser exercitado antes da revisão/instalação autorizada.
- Auth fullschema inventariado, porém harness não executa todos bodies e GoTrue real; reserved UUID+metadata e efeitos transitivos exigem validação após revisão.
- Quatro readers SECURITY DEFINER atuais usam vínculo cru; candidato separado corrige revogação/tenant, ainda fechado/não aplicado.
- Portais antigos agrícolas (fazenda/talhão/recomendação/solicitação) ainda precisam matriz completa de cache e mutações; reset do layout contém troca visual, não certifica todos readers.
