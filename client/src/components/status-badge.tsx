import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusType = "active" | "success" | "pending" | "warning" | "paused" | "error" | "inactive" | "new" | "contacted" | "replied" | "booked" | "won" | "lost";

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" },
  success: { label: "Success", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" },
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
  warning: { label: "Warning", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
  paused: { label: "Paused", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" },
  error: { label: "Error", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" },
  inactive: { label: "Inactive", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800" },
  new: { label: "New", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  contacted: { label: "Contacted", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800" },
  replied: { label: "Replied", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800" },
  booked: { label: "Booked", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800" },
  won: { label: "Won", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" },
  lost: { label: "Lost", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800" },
  passed: { label: "Passed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" },
  risky: { label: "Risky", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
  running: { label: "Running", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  done: { label: "Done", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" },
  verified: { label: "Verified", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] || {
    label: status.charAt(0).toUpperCase() + status.slice(1),
    className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800"
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium border", config.className, className)}
      data-testid={`badge-status-${status.toLowerCase()}`}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current"></span>
      {config.label}
    </Badge>
  );
}
