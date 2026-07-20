
/**
 * Utilitários para formatar concentrações científicas (UFC/mL)
 */

export function parseConcentracao(value: number | null | undefined): { mantissa: string, expoente: string } {
  if (value === null || value === undefined) return { mantissa: "", expoente: "" };
  
  const scientific = value.toExponential();
  const [m, e] = scientific.split("e");
  
  // Arredonda mantissa para até 2 casas decimais e remove zeros desnecessários
  const mantissa = parseFloat(parseFloat(m).toFixed(2)).toString().replace(".", ",");
  const expoente = parseInt(e).toString();
  
  return { mantissa, expoente };
}

export function formatConcentracaoValue(mantissa: string, expoente: string): number | null {
  if (!mantissa || !expoente) return null;
  const m = parseFloat(mantissa.replace(",", "."));
  const e = parseInt(expoente);
  if (isNaN(m) || isNaN(e)) return null;
  return m * Math.pow(10, e);
}

export function formatConcentracaoDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const { mantissa, expoente } = parseConcentracao(value);
  return `${mantissa} × 10${toSuperscript(expoente)}`;
}

function toSuperscript(num: string): string {
  const map: Record<string, string> = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻"
  };
  return num.split("").map(char => map[char] || char).join("");
}
