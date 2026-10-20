import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CQComparativoTable, evaluateCQ, referenceComplete, type MedidoInput } from "/tmp/cq-review-validation/CQComparativoTable";
import type { CQReferencia } from "/tmp/cq-review-validation/useCQReferencia";

const ref: CQReferencia = { id:"ref",produto_id:"produto",microrganismo_id:"micro",ativo:true,
  ph_min:6,ph_max:8,concentracao_min_ufc_ml:100000000,aparencia_esperada:"Normal",
  odor_esperado:"Caracteristico",contaminacao_esperada:"Ausente",observacoes:null };
const measured: MedidoInput = { ph:"7",concentracao_mantissa:"1",concentracao_expoente:"8",
  aparencia:"Normal",odor:"Caracteristico",contaminacao:"Ausente" };
afterEach(cleanup);
describe("CQ comparison follows canonical core without writes", () => {
  it("complete active reference and exact measurements pass", () => {
    expect(evaluateCQ(ref, measured).approved).toBe(true);
  });
  for (const field of ["ph_min","ph_max","concentracao_min_ufc_ml","aparencia_esperada","odor_esperado","contaminacao_esperada"] as const)
    it(`missing reference ${field} cannot approve`, () => {
      const r = {...ref,[field]:null};
      expect(referenceComplete(r)).toBe(false);
      expect(evaluateCQ(r, measured).approved).toBe(false);
    });
  for (const field of Object.keys(measured) as (keyof MedidoInput)[])
    it(`empty measurement ${field} cannot approve`, () => {
      expect(evaluateCQ(ref, {...measured,[field]:""}).approved).toBe(false);
    });
  for (const field of ["aparencia","odor","contaminacao"] as const)
    it(`${field} case mismatch fails rather than warns`, () => {
      const a = evaluateCQ(ref, {...measured,[field]:measured[field].toLowerCase()});
      expect(a.failures).toBe(1); expect(a.approved).toBe(false);
    });
  it("trims only SQL btrim spaces, preserving case and tabs", () => {
    expect(evaluateCQ(ref,{...measured,aparencia:" Normal "}).approved).toBe(true);
    expect(evaluateCQ(ref,{...measured,aparencia:"\tNormal\t"}).approved).toBe(false);
  });
  for (const patch of [{ativo:false},{ph_min:9},{ph_max:15},{ph_min:NaN},{ph_max:Infinity},
    {concentracao_min_ufc_ml:-1},{odor_esperado:"   "}])
    it(`invalid reference ${JSON.stringify(patch)} cannot approve`, () => {
      expect(evaluateCQ({...ref,...patch},measured).approved).toBe(false);
    });
  for (const patch of [{ph:"Infinity"},{ph:"15"},{concentracao_mantissa:"1junk"},
    {concentracao_expoente:"8junk"},{concentracao_expoente:"8.5"},{concentracao_expoente:"400"},
    {concentracao_mantissa:"-1"},{concentracao_expoente:"31"},{odor:"x".repeat(201)}])
    it(`invalid measurement ${JSON.stringify(patch)} cannot approve`, () => {
      expect(evaluateCQ(ref,{...measured,...patch}).approved).toBe(false);
    });
  it("inclusive pH limits and minimum concentration agree with core", () => {
    expect(evaluateCQ(ref,{...measured,ph:"6"}).approved).toBe(true);
    expect(evaluateCQ(ref,{...measured,ph:"8"}).approved).toBe(true);
    expect(evaluateCQ(ref,{...measured,ph:"8.01"}).approved).toBe(false);
    expect(evaluateCQ(ref,{...measured,concentracao_mantissa:"0.99"}).approved).toBe(false);
  });
  it("real table renders an incomplete-reference diagnosis and cannot offer mutation", () => {
    render(<MemoryRouter><CQComparativoTable referencia={{...ref,ph_min:null}} medido={measured} canEdit={false}/></MemoryRouter>);
    expect(screen.getByText(/REFERÊNCIA INCOMPLETA OU INVÁLIDA/)).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});