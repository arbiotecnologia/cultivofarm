import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number | string | null | undefined;
  onValueChange: (value: number | null) => void;
  currencySymbol?: string;
  /** Quando true, valor vazio é mantido como string vazia e onValueChange recebe null. */
  allowEmpty?: boolean;
}

const formatBRL = (cents: number) => {
  const v = cents / 100;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Input com máscara monetária BRL.
 * Mantém o valor numérico (em unidades, ex.: 1234.56) e exibe formatado (R$ 1.234,56).
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, currencySymbol = "R$", allowEmpty = false, className, ...rest }, ref) => {
    const empty = allowEmpty && isEmpty(value);
    const numericValue = typeof value === "string" ? Number(value) || 0 : Number(value || 0);
    const cents = Math.round(numericValue * 100);
    const display = empty ? "" : formatBRL(cents);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, "");
      if (!digits) {
        onValueChange(allowEmpty ? null : 0);
        return;
      }
      const newCents = Number(digits);
      onValueChange(newCents / 100);
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">
          {currencySymbol}
        </span>
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder={empty ? (rest.placeholder ?? "0,00") : rest.placeholder}
          className={cn("pl-10 text-right font-mono", className)}
          {...rest}
        />
      </div>
    );
  }
);
MoneyInput.displayName = "MoneyInput";
