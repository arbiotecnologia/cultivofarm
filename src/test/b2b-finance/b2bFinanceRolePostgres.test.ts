import { pgBatteryTestTimeout, runPgBattery } from "@/test/helpers/pgBatterySlot";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { expect, it } from "vitest";
const DIR = "scripts/b2b-financeiro-role-20261117";
it("pacote SQL é regenerado dos corpos LIVE pinados sem drift", async () => {
  const before = readFileSync(`${DIR}/02b-install.sql.review`, "utf8");
  const { stdout } = await promisify(execFile)("python3", [`${DIR}/build.py`], { encoding: "utf8" });
  expect(stdout).toMatch(/^OK /);
  expect(readFileSync(`${DIR}/02b-install.sql.review`, "utf8")).toBe(before);
  expect(before).not.toMatch(/GRANT [^;]* TO anon/);
  expect(readFileSync("supabase/functions/create-user/index.ts", "utf8")).not.toContain("parceiro_b2b_financeiro");
}, 30_000);
it("Financeiro B2B em PostgreSQL descartável/Auth sintética: isolamento, negativos, sem escrita, regressão gestor e reversão", async () => {
  const { stdout } = await runPgBattery("python3", [`${DIR}/test_local_pg.py`], { encoding: "utf8" });
  for (const name of ["financeiro_le_obrigacoes_proprias", "financeiro_nega_parceiro_irmao", "financeiro_nega_outro_tenant", "tecnico_obrigacoes_negadas",
    "revogado_obrigacoes_negadas", "perfil_inativo_obrigacoes_negadas", "sem_vinculo_obrigacoes_negadas", "misto_financeiro_tecnico_obrigacoes_negadas",
    "financeiro_nao_cria_pedido", "financeiro_links_diretos_fechados", "gestor_regressao_le_proprio", "token_anterior_a_epoca_negado",
    "cadastro_financeiro_exclusivo", "credito_proprio_disponivel", "credito_irmao_isolado", "credito_outro_tenant_isolado", "financeiro_nao_usa_calculadora_de_pedido", "nucleo_credito_sem_execute", "contadores_mensagens_fechados_financeiro", "contadores_gestor_regressao", "revogacao_retira_credito", "rollback_restaura_fn_b2b_credit_exposure", "rollback_restaura_rpc_partner_message_counters", "provisao_financeiro_grava_vinculo", "rollback_restaura_b2b_own_obligations_owner"])
    expect(stdout).toContain(`PASS ${name}\n`);
  expect(stdout).toContain("TOTAL 105 PASS");
}, pgBatteryTestTimeout(120_000));
