# Evidência do preflight (preenchida por pessoa; o script só valida igualdade exata)
JSON sem chaves repetidas (repetição = DENY):
```json
{"mode":"PROD_READONLY|HOMOLOG_ISOLATED","runtime_url":"https://<host observado>","observed_project_ref":"<ref lido no app em execução>",
 "commit":"<40 hex da versão em execução>",
 "outputs":{"COMMUNICATION_DELIVERY_ENABLED":false,"EMAIL_DELIVERY_ENABLED":false,"WHATSAPP_DELIVERY_ENABLED":false,"COMMUNICATION_INAPP_ADAPTER_ENABLED":false,"WHATSAPP_WEBHOOK_ENABLED":false},
 "automations":{"NF_EMISSION_ENABLED":false,"SEFAZ_TRANSMISSION_ENABLED":false,"BOLETO_EMISSION_ENABLED":false,"AUTO_RECEIVABLE_ENABLED":false},
 "write_prereqs":{"schema_confirmed":false,"synthetic_data_confirmed":false,"automations_verified_blocked":false,"access_confirmed":false},
 "human_check":{"reviewer":"","checked_at":"","statement":""}}
```
- Valores booleanos JSON (`false`, não `"false"`). Chave faltando/extra = BLOCKED; saída/automação `true` = DENY.
- `automations`/`write_prereqs` só valem em HOMOLOG_ISOLATED e só para WRITE_SCENARIOS. Produção: WRITE_SCENARIOS sempre DENY.
- `PREFLIGHT_MODE`, `PREFLIGHT_SCOPE` (READONLY|WRITE_SCENARIOS) e `PREFLIGHT_EVIDENCE` são obrigatórios. Declarar um ref não prova para onde o app aponta; vale apenas o observado registrado pela pessoa.
- Estado atual em homolog: `write_prereqs` não confirmados (sem AR Bio, profiles e partner_users) ⇒ WRITE_SCENARIOS=BLOCKED.
