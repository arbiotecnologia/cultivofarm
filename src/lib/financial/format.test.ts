import { describe, it, expect } from "vitest";
import { brl, addMonths, generateInstallments } from "./format";

describe("financial/format", () => {
  describe("brl", () => {
    it("formats numbers as BRL currency", () => {
      expect(brl(1234.5).replace(/\s/g, " ")).toMatch(/R\$\s?1\.234,50/);
    });
    it("handles null/undefined/zero", () => {
      expect(brl(null).replace(/\s/g, " ")).toMatch(/R\$\s?0,00/);
      expect(brl(undefined).replace(/\s/g, " ")).toMatch(/R\$\s?0,00/);
    });
    it("accepts numeric strings", () => {
      expect(brl("10.5").replace(/\s/g, " ")).toMatch(/R\$\s?10,50/);
    });
  });

  describe("addMonths", () => {
    it("advances months keeping day", () => {
      expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
      expect(addMonths("2026-01-31", 1)).toBe("2026-03-03"); // rollover
      expect(addMonths("2026-06-15", 6)).toBe("2026-12-15");
    });
  });

  describe("generateInstallments", () => {
    it("splits total evenly with rounding adjustment on last installment", () => {
      const rows = generateInstallments(100, 3, "2026-01-10");
      expect(rows).toHaveLength(3);
      const sum = rows.reduce((s, r) => s + r.amount, 0);
      expect(Math.round(sum * 100) / 100).toBe(100);
      expect(rows[0].due_date).toBe("2026-01-10");
      expect(rows[1].due_date).toBe("2026-02-10");
      expect(rows[2].due_date).toBe("2026-03-10");
    });
    it("handles single installment", () => {
      const rows = generateInstallments(250, 1, "2026-06-01");
      expect(rows).toEqual([{ installment_number: 1, due_date: "2026-06-01", amount: 250 }]);
    });
  });
});
