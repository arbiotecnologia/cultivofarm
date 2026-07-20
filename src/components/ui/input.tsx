import * as React from "react";
import { cn } from "@/lib/utils";
import { formatLiveCase, formatTitleCase } from "@/lib/text-formatters";

export interface InputProps extends React.ComponentProps<"input"> {
  autoCase?: "title" | "upper" | "lower";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, autoCase, onChange, onBlur, ...props }, ref) => {
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (autoCase === "title") {
        e.target.value = formatTitleCase(e.target.value);
        if (onChange) {
          const event = {
            ...e,
            target: e.target,
            currentTarget: e.target,
          } as unknown as React.ChangeEvent<HTMLInputElement>;
          onChange(event);
        }
      }
      if (onBlur) onBlur(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (autoCase) {
        e.target.value = formatLiveCase(e.target.value, autoCase);
      }
      if (onChange) onChange(e);
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-12 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-6 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground placeholder:leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm transition-colors",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
