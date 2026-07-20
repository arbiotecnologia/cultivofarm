import * as React from "react";
import { cn } from "@/lib/utils";
import { formatLiveCase, formatTitleCase } from "@/lib/text-formatters";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoCase?: "title" | "upper" | "lower";
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoCase, onChange, onBlur, ...props }, ref) => {
    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (autoCase === "title") {
        e.target.value = formatTitleCase(e.target.value);
        if (onChange) {
          const event = {
            ...e,
            target: e.target,
            currentTarget: e.target,
          } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
          onChange(event);
        }
      }
      if (onBlur) onBlur(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoCase) {
        e.target.value = formatLiveCase(e.target.value, autoCase);
      }
      if (onChange) onChange(e);
    };

    return (
      <textarea
        className={cn(
          "flex min-h-[100px] sm:min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-3 text-base sm:text-sm leading-6 align-top ring-offset-background placeholder:text-muted-foreground placeholder:leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
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
Textarea.displayName = "Textarea";

export { Textarea };
