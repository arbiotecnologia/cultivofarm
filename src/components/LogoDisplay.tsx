import { useSystemConfig } from "@/hooks/useSystemConfig";
import simboloCultivoFarm from "@/assets/simbolo-cultivofarm.png.asset.json";
import { cn } from "@/lib/utils";

interface LogoDisplayProps {
  className?: string;
  imgClassName?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showBackground?: boolean;
}

export function LogoDisplay({ 
  className, 
  imgClassName,
  size = "md",
  showBackground = true 
}: LogoDisplayProps) {
  const { config, defaults } = useSystemConfig();
  
  const logoUrl = config?.logo_url;
  const nomeEmpresa = config?.nome_empresa || defaults.nome_empresa;

  const sizeClasses = {
    sm: "h-8 w-8 rounded-lg",
    md: "h-10 w-10 rounded-xl",
    lg: "h-12 w-12 rounded-xl",
    xl: "h-20 w-20 rounded-2xl",
  };

  return (
    <div className={cn(
      "flex items-center justify-center overflow-hidden shrink-0 transition-colors",
      sizeClasses[size],
      showBackground && (
        logoUrl 
          ? "bg-white dark:bg-white shadow-inner p-1" 
          : "bg-primary dark:bg-primary/20"
      ),
      className
    )}>
      {logoUrl ? (
        <img 
          src={logoUrl} 
          alt={nomeEmpresa} 
          className={cn("h-full w-full object-contain", imgClassName)} 
        />
      ) : (
        <img 
          src={simboloCultivoFarm.url} 
          alt={nomeEmpresa} 
          className={cn("h-full w-full object-contain", size === "xl" ? "p-0" : "p-0.5", imgClassName)} 
        />
      )}
    </div>
  );
}
