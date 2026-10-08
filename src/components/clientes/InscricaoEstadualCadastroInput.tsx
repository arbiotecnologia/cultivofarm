import { forwardRef, useState } from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { inscricaoEstadualCadastroWarning } from "@/lib/schemas/inscricaoEstadualCadastro";

interface Props extends Omit<InputProps, "value"> {
  value: string;
  uf?: string | null;
}

export const InscricaoEstadualCadastroInput = forwardRef<HTMLInputElement, Props>(
  ({ value, uf, onBlur, onChange, ...props }, ref) => {
    const [reviewed, setReviewed] = useState(false);
    const warning = reviewed ? inscricaoEstadualCadastroWarning(uf, value) : null;
    return <>
      <Input {...props} ref={ref} value={value} maxLength={20} autoCapitalize="characters"
        placeholder="Inscrição estadual ou ISENTO" aria-label="Inscrição Estadual"
        onChange={(event) => { setReviewed(false); onChange?.(event); }}
        onBlur={(event) => { setReviewed(true); onBlur?.(event); }} />
      {warning && <p className="text-xs text-muted-foreground" role="status">{warning}</p>}
    </>;
  },
);
InscricaoEstadualCadastroInput.displayName = "InscricaoEstadualCadastroInput";