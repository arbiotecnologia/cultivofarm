import { describe, expect, it } from "vitest";
import {
  dadosSuficientesParaRisco,
  existeLeituraNoMesmoHorario,
  formatDataHoraSaoPaulo,
  formatMetrica,
  horasDesde,
  mediaOuNulo,
  motivoDadosInsuficientes,
  numeroOuNulo,
  resumirClima,
  rotuloFrescor,
  somaOuNulo,
  validarCoordenadas,
  validarLeituraManual,
  type FormClimaManual,
} from "@/lib/previsao/clima";

const formVazio: FormClimaManual = {
  data_hora: "",
  temperatura: "",
  umidade: "",
  chuva_mm: "",
  vento_kmh: "",
  radiacao_solar: "",
};

describe("numeroOuNulo", () => {
  it("preserva zero como valor válido", () => {
    expect(numeroOuNulo(0)).toBe(0);
    expect(numeroOuNulo("0")).toBe(0);
  });
  it("trata ausência e lixo como nulo", () => {
    expect(numeroOuNulo("")).toBeNull();
    expect(numeroOuNulo(null)).toBeNull();
    expect(numeroOuNulo("abc")).toBeNull();
  });
  it("aceita vírgula decimal", () => {
    expect(numeroOuNulo("12,5")).toBe(12.5);
  });
});

describe("agregações", () => {
  it("retorna nulo quando não há leitura", () => {
    expect(mediaOuNulo([null, null])).toBeNull();
    expect(somaOuNulo([])).toBeNull();
  });
  it("ignora ausências sem contá-las como zero", () => {
    expect(mediaOuNulo([20, null, 30])).toBe(25);
    expect(somaOuNulo([1, null, 2])).toBe(3);
  });
  it("formata ausência como travessão", () => {
    expect(formatMetrica(null, 1, "°C")).toBe("—");
    expect(formatMetrica(0, 1, " mm")).toBe("0.0 mm");
  });
});

describe("datas em America/Sao_Paulo", () => {
  it("converte timestamp UTC para o horário de São Paulo", () => {
    expect(formatDataHoraSaoPaulo("2026-09-13T01:30:00Z")).toBe("12/09/2026 22:30");
  });
  it("trata valores inválidos", () => {
    expect(formatDataHoraSaoPaulo("banana")).toBe("—");
    expect(formatDataHoraSaoPaulo(null)).toBe("—");
  });
  it("calcula e rotula frescor", () => {
    const agora = new Date("2026-09-13T12:00:00Z");
    expect(horasDesde("2026-09-13T09:00:00Z", agora)).toBe(3);
    expect(rotuloFrescor(horasDesde("2026-09-13T09:00:00Z", agora))).toBe("atualizado há 3 h");
    expect(rotuloFrescor(null)).toBe("sem leitura");
  });
});

describe("validarCoordenadas", () => {
  it("bloqueia coordenadas ausentes", () => {
    expect(validarCoordenadas(null, null).ok).toBe(false);
    expect(validarCoordenadas("", -45).ok).toBe(false);
  });
  it("bloqueia fora de faixa e (0,0)", () => {
    expect(validarCoordenadas(120, 10).ok).toBe(false);
    expect(validarCoordenadas(-20, 200).ok).toBe(false);
    expect(validarCoordenadas(0, 0).ok).toBe(false);
  });
  it("aceita coordenadas válidas", () => {
    const r = validarCoordenadas("-15.6", "-47.8");
    expect(r).toEqual({ ok: true, lat: -15.6, lng: -47.8 });
  });
});

describe("validarLeituraManual", () => {
  const agora = new Date("2026-09-13T12:00:00Z");

  it("exige ao menos uma medição", () => {
    const r = validarLeituraManual(formVazio, agora);
    expect(r.ok).toBe(false);
  });
  it("rejeita umidade fora de 0–100", () => {
    const r = validarLeituraManual({ ...formVazio, umidade: "150" }, agora);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.erro).toContain("Umidade");
  });
  it("rejeita chuva negativa", () => {
    const r = validarLeituraManual({ ...formVazio, chuva_mm: "-3" }, agora);
    expect(r.ok).toBe(false);
  });
  it("rejeita valor não numérico", () => {
    const r = validarLeituraManual({ ...formVazio, temperatura: "quente" }, agora);
    expect(r.ok).toBe(false);
  });
  it("rejeita data futura", () => {
    const r = validarLeituraManual(
      { ...formVazio, temperatura: "25", data_hora: "2026-09-20T10:00" },
      agora
    );
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.erro).toContain("futuro");
  });
  it("aceita leitura válida e preserva zero", () => {
    const r = validarLeituraManual({ ...formVazio, temperatura: "25", chuva_mm: "0" }, agora);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.leitura.chuva_mm).toBe(0);
      expect(r.leitura.umidade).toBeNull();
      expect(r.leitura.data_hora).toBe(agora.toISOString());
    }
  });
});

describe("existeLeituraNoMesmoHorario", () => {
  it("detecta duplicidade no mesmo minuto", () => {
    const regs = [{ data_hora: "2026-09-13T12:00:10Z" }];
    expect(existeLeituraNoMesmoHorario(regs, "2026-09-13T12:00:00Z")).toBe(true);
    expect(existeLeituraNoMesmoHorario(regs, "2026-09-13T15:00:00Z")).toBe(false);
  });
});

describe("resumirClima", () => {
  const agora = new Date("2026-09-13T12:00:00Z");

  it("retorna vazio sem registros", () => {
    const r = resumirClima([], agora);
    expect(r.leituras).toBe(0);
    expect(r.temperatura).toBeNull();
    expect(dadosSuficientesParaRisco(r)).toBe(false);
    expect(motivoDadosInsuficientes(r)).toContain("Sem leituras");
  });

  it("usa a leitura mais recente independentemente da ordem de entrada", () => {
    const r = resumirClima(
      [
        { data_hora: "2026-09-11T12:00:00Z", temperatura: 20, umidade: 60, chuva_mm: 0 },
        { data_hora: "2026-09-13T09:00:00Z", temperatura: 31, umidade: 85, chuva_mm: 10 },
      ],
      agora
    );
    expect(r.temperatura).toBe(31);
    expect(r.chuva_acumulada_3d).toBe(10);
    expect(r.ultimaLeitura).toBe("2026-09-13T09:00:00Z");
    expect(dadosSuficientesParaRisco(r)).toBe(true);
  });

  it("bloqueia risco quando falta umidade na leitura mais recente", () => {
    const r = resumirClima([{ data_hora: "2026-09-13T09:00:00Z", temperatura: 28, umidade: null }], agora);
    expect(dadosSuficientesParaRisco(r)).toBe(false);
    expect(motivoDadosInsuficientes(r)).toContain("umidade");
  });

  it("conta dias sem chuva apenas nas leituras observadas", () => {
    const r = resumirClima(
      [
        { data_hora: "2026-09-13T09:00:00Z", temperatura: 30, umidade: 40, chuva_mm: 0 },
        { data_hora: "2026-09-12T09:00:00Z", temperatura: 30, umidade: 40, chuva_mm: 0 },
        { data_hora: "2026-09-11T09:00:00Z", temperatura: 30, umidade: 40, chuva_mm: 12 },
      ],
      agora
    );
    expect(r.dias_sem_chuva).toBe(2);
  });
});
