import { describe, it, expect } from "vitest";
import {
  TOLERANCIA_MIN_L,
  calcular,
  classify,
  buildBucketPorLinha,
  agregarGlobal,
  emptyBucket,
  type LinhaCalc,
  type LinhaComStatus,
} from "./composicaoCalc";
import type { ProductComposicao } from "@/hooks/useProductProfile";
import type { DisponibilidadeOSData } from "@/hooks/useDisponibilidadeOS";

// -------------------- helpers --------------------

const mkComp = (over: Partial<ProductComposicao>): ProductComposicao => ({
  microrganismo_id: null,
  component_insumo_id: null,
  volume_ml: null,
  proporcao: null,
  microrganismo: null,
  insumo_nome: null,
  ...over,
});

const mkMicro = (id: string, nome: string) => ({
  id,
  nome,
  nome_cientifico: null,
  funcao_agronomica: null,
  tipo: "bactéria",
});

const mkLinha = (over: Partial<LinhaCalc> & { key: string }): LinhaCalc => ({
  microId: null,
  nome: "x",
  tipo: "microrganismo",
  pct: 0,
  volumeL: 0,
  volumeML: 0,
  ...over,
});

const mkLinhaStatus = (l: LinhaCalc, bucket = emptyBucket()): LinhaComStatus => {
  const { status, deltaL, motivo } = classify(l.volumeL, bucket, true);
  return { ...l, bucket, status, deltaL, motivo };
};

// -------------------- calcular --------------------

describe("calcular", () => {
  it("composição vazia → []", () => {
    expect(calcular([], 100)).toEqual([]);
  });

  it("único componente 100% ocupa todo o volume", () => {
    const linhas = calcular(
      [mkComp({ microrganismo_id: "m1", microrganismo: mkMicro("m1", "Trichoderma"), proporcao: 100 })],
      50,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].pct).toBe(100);
    expect(linhas[0].volumeL).toBe(50);
  });

  it("normaliza por proporção quando soma != 100", () => {
    const linhas = calcular(
      [
        mkComp({ microrganismo_id: "m1", microrganismo: mkMicro("m1", "A"), proporcao: 25 }),
        mkComp({ microrganismo_id: "m2", microrganismo: mkMicro("m2", "B"), proporcao: 75 }),
      ],
      100,
    );
    expect(linhas.map((l) => l.pct)).toEqual([25, 75]);
    expect(linhas.map((l) => l.volumeL)).toEqual([25, 75]);
  });

  it("distribui por volume_ml quando não há proporção", () => {
    const linhas = calcular(
      [
        mkComp({ microrganismo_id: "m1", microrganismo: mkMicro("m1", "A"), volume_ml: 200 }),
        mkComp({ microrganismo_id: "m2", microrganismo: mkMicro("m2", "B"), volume_ml: 800 }),
      ],
      100,
    );
    expect(linhas[0].pct).toBeCloseTo(20);
    expect(linhas[1].pct).toBeCloseTo(80);
    expect(linhas[0].volumeL).toBeCloseTo(20);
    expect(linhas[1].volumeL).toBeCloseTo(80);
  });

  it("ajuste de arredondamento cai no último item (soma bate totalL*1000 mL)", () => {
    // 3 componentes com proporções 33/33/34 e volume total 10 L
    const linhas = calcular(
      [
        mkComp({ microrganismo_id: "m1", microrganismo: mkMicro("m1", "A"), proporcao: 33 }),
        mkComp({ microrganismo_id: "m2", microrganismo: mkMicro("m2", "B"), proporcao: 33 }),
        mkComp({ microrganismo_id: "m3", microrganismo: mkMicro("m3", "C"), proporcao: 34 }),
      ],
      10,
    );
    const somaML = linhas.reduce((s, l) => s + Math.round(l.volumeML), 0);
    expect(somaML).toBe(10 * 1000);
  });

  it("identifica insumo (sem microrganismo) corretamente", () => {
    const linhas = calcular(
      [mkComp({ component_insumo_id: "i1", insumo_nome: "Melaço", proporcao: 100 })],
      10,
    );
    expect(linhas[0].tipo).toBe("insumo");
    expect(linhas[0].microId).toBeNull();
    expect(linhas[0].nome).toBe("Melaço");
  });
});

// -------------------- classify: produção < demanda --------------------

describe("classify — produção menor que demanda", () => {
  it("falta parcial: envasado 60 L, planejado 100 L → falta com delta -40", () => {
    const r = classify(
      100,
      { envasadoL: 60, reservadoL: 0, disponivelL: 60, vencidoL: 0 },
      true,
    );
    expect(r.status).toBe("falta");
    expect(r.deltaL).toBeCloseTo(-40);
  });

  it("todo estoque reservado (disponível 0, reservado > 0) → sem_estoque", () => {
    const r = classify(
      50,
      { envasadoL: 50, reservadoL: 50, disponivelL: 0, vencidoL: 0 },
      true,
    );
    expect(r.status).toBe("sem_estoque");
    expect(r.motivo).toContain("reservado");
  });

  it("diferença dentro da tolerância (≤ 2% e ≥ 50 mL) → ok", () => {
    // 100 L planejados, tolerância = max(2 L, 0.05 L) = 2 L
    const r = classify(
      100,
      { envasadoL: 100, reservadoL: 0, disponivelL: 98.5, vencidoL: 0 },
      true,
    );
    expect(r.status).toBe("ok");
  });

  it("volume minúsculo: usa piso de 50 mL como tolerância", () => {
    // 1 L planejado; 2% = 20 mL, mas piso = 50 mL. 0.96 L → delta -40 mL → ok
    const r = classify(
      1,
      { envasadoL: 1, reservadoL: 0, disponivelL: 0.96, vencidoL: 0 },
      true,
    );
    expect(r.status).toBe("ok");
    // 0.94 L → delta -60 mL > 50 mL → falta
    const r2 = classify(
      1,
      { envasadoL: 1, reservadoL: 0, disponivelL: 0.94, vencidoL: 0 },
      true,
    );
    expect(r2.status).toBe("falta");
  });
});

// -------------------- classify: vencimento parcial --------------------

describe("classify — vencimento parcial", () => {
  it("vencido consome parte do envasado e resulta em falta", () => {
    // envasado 100, vencido 30, disp 70, planejado 80 → delta -10 → falta
    const r = classify(
      80,
      { envasadoL: 100, reservadoL: 0, disponivelL: 70, vencidoL: 30 },
      true,
    );
    expect(r.status).toBe("falta");
    expect(r.deltaL).toBeCloseTo(-10);
    expect(r.motivo).toContain("vencido 30,00 L");
  });

  it("todo o envasado venceu → sem_estoque (disp 0, vencido > 0)", () => {
    const r = classify(
      50,
      { envasadoL: 100, reservadoL: 0, disponivelL: 0, vencidoL: 100 },
      true,
    );
    expect(r.status).toBe("sem_estoque");
  });

  it("vencimento parcial mas ainda dentro da tolerância → ok", () => {
    // planejado 100, disp 99, vencido 1 → delta -1 (< 2 L) → ok
    const r = classify(
      100,
      { envasadoL: 100, reservadoL: 0, disponivelL: 99, vencidoL: 1 },
      true,
    );
    expect(r.status).toBe("ok");
  });
});

// -------------------- classify: sem lote / aguardando --------------------

describe("classify — sem produção e aguardando envase", () => {
  it("sem lote vinculado → sem_producao", () => {
    const r = classify(50, emptyBucket(), false);
    expect(r.status).toBe("sem_producao");
    expect(r.motivo).toMatch(/nenhum lote/);
  });

  it("com lote mas envasado ≈ 0 → aguardando_envase", () => {
    const r = classify(
      50,
      { envasadoL: 0, reservadoL: 0, disponivelL: 0, vencidoL: 0 },
      true,
    );
    expect(r.status).toBe("aguardando_envase");
  });
});

// -------------------- classify: excedente --------------------

describe("classify — excedente", () => {
  it("disponível supera planejado além da tolerância → excedente", () => {
    const r = classify(
      100,
      { envasadoL: 150, reservadoL: 0, disponivelL: 150, vencidoL: 0 },
      true,
    );
    expect(r.status).toBe("excedente");
    expect(r.deltaL).toBeCloseTo(50);
    expect(r.motivo).toContain("sobra");
  });
});

// -------------------- buildBucketPorLinha --------------------

describe("buildBucketPorLinha — múltiplos lotes por microrganismo", () => {
  it("bucket agregado por micro (o hook já soma vários lotes) é usado sem duplicação", () => {
    // Simula 3 lotes do mesmo micro já somados pelo hook em porMicrorganismo
    const linhas = [
      mkLinha({ key: "m1", microId: "m1", pct: 100, volumeL: 100 }),
    ];
    const disp: Pick<
      DisponibilidadeOSData,
      "porMicrorganismo" | "consolidadoSemMicro" | "temLoteConsolidado"
    > = {
      porMicrorganismo: {
        m1: { envasadoL: 300, reservadoL: 50, disponivelL: 250, vencidoL: 0 },
      },
      consolidadoSemMicro: emptyBucket(),
      temLoteConsolidado: false,
    };
    const [b] = buildBucketPorLinha(linhas, disp);
    expect(b.envasadoL).toBe(300);
    expect(b.reservadoL).toBe(50);
    expect(b.disponivelL).toBe(250);
    expect(b.vencidoL).toBe(0);
  });
});

describe("buildBucketPorLinha — lote consolidado", () => {
  const linhas: LinhaCalc[] = [
    mkLinha({ key: "m1", microId: "m1", pct: 40, volumeL: 40 }),
    mkLinha({ key: "m2", microId: "m2", pct: 60, volumeL: 60 }),
    mkLinha({ key: "i1", microId: null, tipo: "insumo", pct: 0, volumeL: 0, nome: "Melaço" }),
  ];

  it("rateia consolidado proporcional ao pct de cada micro; insumo fica zerado", () => {
    const disp = {
      porMicrorganismo: {},
      consolidadoSemMicro: {
        envasadoL: 100,
        reservadoL: 20,
        disponivelL: 80,
        vencidoL: 0,
      },
      temLoteConsolidado: true,
    };
    const [bm1, bm2, bi1] = buildBucketPorLinha(linhas, disp);
    expect(bm1.envasadoL).toBeCloseTo(40); // 40% de 100
    expect(bm2.envasadoL).toBeCloseTo(60); // 60% de 100
    expect(bm1.disponivelL).toBeCloseTo(32);
    expect(bm2.disponivelL).toBeCloseTo(48);
    expect(bi1).toEqual(emptyBucket());
  });

  it("combina micro-específico + fatia do consolidado", () => {
    const disp = {
      porMicrorganismo: {
        m1: { envasadoL: 10, reservadoL: 0, disponivelL: 10, vencidoL: 0 },
      },
      consolidadoSemMicro: {
        envasadoL: 100,
        reservadoL: 0,
        disponivelL: 100,
        vencidoL: 0,
      },
      temLoteConsolidado: true,
    };
    const [bm1, bm2] = buildBucketPorLinha(linhas, disp);
    // m1: 10 (próprio) + 40% de 100 = 50
    expect(bm1.envasadoL).toBeCloseTo(50);
    // m2: 60% de 100 = 60
    expect(bm2.envasadoL).toBeCloseTo(60);
  });
});

// -------------------- agregarGlobal --------------------

describe("agregarGlobal", () => {
  const linha = (over: Partial<LinhaCalc> & { key: string }, bucket = emptyBucket()) =>
    mkLinhaStatus(mkLinha(over), bucket);

  it("sem lote → sem_producao independente das linhas", () => {
    const l = mkLinhaStatus(mkLinha({ key: "a", volumeL: 10 }));
    const r = agregarGlobal([l], false);
    expect(r.globalStatus).toBe("sem_producao");
  });

  it("falta domina sobre excedente e aguardando", () => {
    const ok = linha({ key: "a", volumeL: 10 }, { envasadoL: 10, reservadoL: 0, disponivelL: 10, vencidoL: 0 });
    const falta = linha({ key: "b", volumeL: 10 }, { envasadoL: 5, reservadoL: 0, disponivelL: 5, vencidoL: 0 });
    const exced = linha({ key: "c", volumeL: 10 }, { envasadoL: 30, reservadoL: 0, disponivelL: 30, vencidoL: 0 });
    const r = agregarGlobal([ok, falta, exced], true);
    expect(r.globalStatus).toBe("falta");
    expect(r.countFalta).toBe(1);
    expect(r.countExced).toBe(1);
  });

  it("aguardando só domina quando totalEnv ≈ 0", () => {
    const l = linha({ key: "a", volumeL: 10 }, emptyBucket());
    const r = agregarGlobal([l], true);
    expect(r.globalStatus).toBe("aguardando");
    expect(r.countAguard).toBe(1);
    expect(r.totalEnv).toBe(0);
  });

  it("excedente vence quando não há falta nem aguardando puro", () => {
    const exced = linha({ key: "a", volumeL: 10 }, { envasadoL: 30, reservadoL: 0, disponivelL: 30, vencidoL: 0 });
    const r = agregarGlobal([exced], true);
    expect(r.globalStatus).toBe("excedente");
    expect(r.totalDelta).toBeCloseTo(20);
  });

  it("tudo ok → ok e totais consistentes", () => {
    const a = linha({ key: "a", volumeL: 10 }, { envasadoL: 10, reservadoL: 2, disponivelL: 10, vencidoL: 0 });
    const b = linha({ key: "b", volumeL: 20 }, { envasadoL: 20, reservadoL: 5, disponivelL: 20, vencidoL: 0 });
    const r = agregarGlobal([a, b], true);
    expect(r.globalStatus).toBe("ok");
    expect(r.totalPlan).toBe(30);
    expect(r.totalEnv).toBe(30);
    expect(r.totalRes).toBe(7);
    expect(r.totalDisp).toBe(30);
    expect(r.totalDelta).toBe(0);
  });
});

describe("constantes exportadas", () => {
  it("TOLERANCIA_MIN_L = 50 mL", () => {
    expect(TOLERANCIA_MIN_L).toBe(0.05);
  });
});
