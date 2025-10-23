import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowDown, ArrowUp, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: LucideIcon;
  trend?: "up" | "down";
  className?: string;
}

export function MetricCard({ title, value, change, icon: Icon, trend, className }: MetricCardProps) {
  const isPositive = trend === "up" || (change !== undefined && change >= 0);

  return (
    <Card className={cn("hover-elevate", className)} data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {Icon && (
          <Icon className="h-4 w-4 text-muted-foreground" />
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div className="text-2xl font-bold" data-testid={`text-metric-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {value}
          </div>
          {change !== undefined && (
            <div className={cn(
              "flex items-center text-xs font-medium",
              isPositive ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"
            )}>
              {isPositive ? (
                <ArrowUp className="mr-1 h-3 w-3" />
              ) : (
                <ArrowDown className="mr-1 h-3 w-3" />
              )}
              {Math.abs(change)}%
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
