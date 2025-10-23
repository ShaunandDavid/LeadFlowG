import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface GuardrailBannerProps {
  type: "info" | "warning" | "error" | "success";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle,
};

const colorMap = {
  info: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-100",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-100",
  error: "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-100",
  success: "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/30 dark:border-green-800 dark:text-green-100",
};

export function GuardrailBanner({ type, message, actionLabel, onAction, dismissible, onDismiss }: GuardrailBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const Icon = iconMap[type];

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <Alert className={cn("mb-6 border-l-4", colorMap[type])} data-testid={`banner-guardrail-${type}`}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <AlertDescription className="text-sm font-medium">
            {message}
          </AlertDescription>
        </div>
        <div className="flex items-center gap-2">
          {actionLabel && onAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAction}
              className="h-8"
              data-testid="button-banner-action"
            >
              {actionLabel}
            </Button>
          )}
          {dismissible && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="h-8 w-8"
              data-testid="button-banner-dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Alert>
  );
}
