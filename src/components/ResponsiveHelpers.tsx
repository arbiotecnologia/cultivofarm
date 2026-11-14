import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ResponsiveTableProps {
  children: ReactNode;
  mobileCards?: ReactNode;
}

export function ResponsiveTable({ children, mobileCards }: ResponsiveTableProps) {
  const isMobile = useIsMobile();

  if (isMobile && mobileCards) {
    return <div className="space-y-4">{mobileCards}</div>;
  }

  return (
    <div className="min-w-0 w-full max-w-full overflow-x-auto">
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4 sm:mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground break-words leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground break-words">{description}</p>
      </div>
      {action && <div className="min-w-0 max-w-full w-full lg:w-auto flex justify-end flex-wrap gap-1.5 [&>button]:max-w-full [&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>a]:max-w-full [&>a]:h-auto [&>a]:min-h-11 [&>a]:whitespace-normal">{action}</div>}
    </div>
  );
}

interface MobileCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  content: { label: string; value: ReactNode; icon?: ReactNode }[];
  actions?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  variant?: "default" | "compact" | "action";
}
 
export function MobileCard({ title, subtitle, status, content, actions, onClick, ariaLabel, variant = "default" }: MobileCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card 
      className={cn(
        "overflow-hidden active:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        onClick && "cursor-pointer"
      )} 
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      aria-label={ariaLabel}
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-2 justify-between items-start mb-3">
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <div className="font-bold text-base">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          {status && <div className="max-w-full break-words">{status}</div>}
        </div>
        
        <div className={cn(
          "grid gap-y-3 gap-x-4 mb-4",
          variant === "compact" ? "grid-cols-2" : "grid-cols-2 xs:grid-cols-3 sm:grid-cols-2"
        )}>
          {content.map((item, idx) => (
            <div key={idx} className="flex flex-col min-w-0">
              <span className="text-[9px] uppercase break-words text-muted-foreground font-bold flex flex-wrap items-center gap-1 mb-0.5">
                {item.icon} {item.label}
              </span>
              <span className="text-sm font-medium [overflow-wrap:anywhere]">
                {item.value}
              </span>
            </div>
          ))}
        </div>

        {actions && (
          <div className="flex flex-wrap gap-2 pt-3 border-t [&>button]:max-w-full [&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal">
            {actions}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
