import * as React from "react";
import { useMask, format } from "@react-input/mask";
import { cn } from "@/lib/utils";
import { formatLiveCase, formatTitleCase } from "@/lib/text-formatters";
import { resolveIEMaskForUF } from "@/lib/fiscal/ie";

export interface MaskedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mask: "cpf" | "cnpj" | "cpf-cnpj" | "telefone" | "cep" | "ie" | "moeda" | string;
  autoCase?: "title" | "upper" | "lower";
  /** UF (2 letras) — usada apenas com mask="ie" para escolher a máscara oficial do Estado. */
  uf?: string | null;
}

const replacement = { _: /\d/ };

function resolveMaskPattern(mask: string, rawValue: string, uf?: string | null): string {
  const clean = rawValue.replace(/\D/g, "");
  switch (mask) {
    case "cpf":
      return "___.___.___-__";
    case "cnpj":
      return "__.___.___/____-__";
    case "auto":
    case "cpf-cnpj":
      return clean.length > 11 ? "__.___.___/____-__" : "___.___.___-__";
    case "telefone":
      return clean.length >= 10 ? "(__) _____-____" : "(__) ____-____";
    case "cep":
      return "_____-___";
    case "ie": {
      const perUF = resolveIEMaskForUF(uf ?? null, rawValue);
      // Fallback genérico (retrocompatível) quando UF não informada.
      return perUF ?? "_______________";
    }
    default:
      return mask;
  }
}

function safeFormat(value: string, pattern: string): string {
  if (!value || !pattern) return value ?? "";
  try {
    return format(value, { mask: pattern, replacement });
  } catch {
    const maxDigits = pattern.replace(/[^_]/g, "").length;
    return value.replace(/\D/g, "").slice(0, maxDigits);
  }
}

const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ className, mask, autoCase, uf, onChange, onBlur, value, defaultValue, ...props }, ref) => {
    const isControlled = value !== undefined;
    const sourceValue = String((isControlled ? value : defaultValue) ?? "");
    const maskPattern = resolveMaskPattern(mask, sourceValue, uf);

    const inputRef = useMask({
      mask: maskPattern,
      replacement,
      showMask: false,
    });

    const combinedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [inputRef, ref]
    );

    // Uncontrolled: sincroniza o valor inicial/atualizado do defaultValue ao DOM já formatado.
    const lastDefaultRef = React.useRef<string | null>(null);
    React.useEffect(() => {
      if (isControlled) return;
      const node = (inputRef as React.MutableRefObject<HTMLInputElement | null>).current;
      if (!node) return;
      const incoming = String(defaultValue ?? "");
      if (incoming === lastDefaultRef.current) return;
      lastDefaultRef.current = incoming;
      const formatted = safeFormat(incoming, resolveMaskPattern(mask, incoming, uf));
      if (node.value !== formatted) {
        node.value = formatted;
      }
    }, [defaultValue, isControlled, mask, inputRef, uf]);

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (autoCase === "title") {
        e.target.value = formatTitleCase(e.target.value);
        if (onChange) {
          onChange({
            ...e,
            target: e.target,
            currentTarget: e.target,
          } as unknown as React.ChangeEvent<HTMLInputElement>);
        }
      }
      onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (autoCase) {
        e.target.value = formatLiveCase(e.target.value, autoCase);
      }
      onChange?.(e);
    };

    const commonProps = {
      className: cn(
        "flex h-12 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm transition-colors",
        className
      ),
      ref: combinedRef,
      onChange: handleChange,
      onBlur: handleBlur,
      ...props,
    };

    if (isControlled) {
      return <input {...commonProps} value={safeFormat(sourceValue, maskPattern)} />;
    }

    return <input {...commonProps} defaultValue={safeFormat(sourceValue, maskPattern)} />;
  }
);

MaskedInput.displayName = "MaskedInput";

export { MaskedInput };
