// Gera DPS sintéticas (homologação) pelo builder real; sem rede.
import { buildDpsXml, type DpsInput } from "../../supabase/functions/_shared/nfse/dps";
import { writeFileSync } from "node:fs";
const base: DpsInput = {
  environment: "HOMOLOGATION", issueDateTime: "2026-11-13T10:00:00-03:00", competence: "2026-11-13", series: "1", number: 21,
  emitter: { cnpj: "00000000000191", municipalityIbge: "9999901", municipalRegistration: "QA123", phone: "0000000000", email: "prest@example.invalid", regime: { opSimpNac: "1", regEspTrib: "0" } },
  taker: { cnpjCpf: "11222333000181", name: "Tomador Sintético PJ", municipalRegistration: "IM99", phone: "000000000", email: "toma@example.invalid" },
  service: { nationalTaxCode: "010101", description: "Serviço sintético", locationIbge: "9999902", incidenceMunicipalityIbge: "9999901", nbsCode: "012345678" },
  values: { serviceAmount: 1000, issRate: 2, issWithheld: false, pisCofins: { cst: "01", pAliqPis: 0.65, pAliqCofins: 3, retType: "2" }, federalRetentions: { cpRate: 11, irrfRate: 1.5, csllRate: 1 }, totTrib: { mode: "PERCENT", fed: 10, est: 0, mun: 2 } },
};
const cases: Record<string, DpsInput> = {
  "lucro-presumido-pj-completa": base,
  "nao-optante-cpf-minima": { ...base, number: 22, emitter: { ...base.emitter, phone: null, email: null, municipalRegistration: null }, taker: { cnpjCpf: "11144477735", name: "Pessoa Sintética" }, service: { ...base.service, nbsCode: null }, values: { serviceAmount: 150, issRate: 3, issWithheld: true, totTrib: { mode: "IND" } } },
  "simples-nacional-ptottribsn": { ...base, number: 23, emitter: { ...base.emitter, regime: { opSimpNac: "3", regApTribSN: "1", regEspTrib: "0" } }, values: { serviceAmount: 500, issRate: 2, issWithheld: false, totTrib: { mode: "SN", sn: 6 } } },
  "mei-piscofins-sem-aliquota": { ...base, number: 24, emitter: { ...base.emitter, regime: { opSimpNac: "2", regEspTrib: "0" } }, values: { serviceAmount: 80, issWithheld: false, pisCofins: { cst: "07" }, totTrib: { mode: "IND" } } },
};
for (const [k, v] of Object.entries(cases)) {
  writeFileSync(`${import.meta.dir}/evidence/homolog-dps-${k}.xml`, buildDpsXml(v));
  writeFileSync(`${import.meta.dir}/evidence/producao-dps-${k}.xml`, buildDpsXml({ ...v, environment: "PRODUCTION" }));
}
console.log(Object.keys(cases).join(","));
