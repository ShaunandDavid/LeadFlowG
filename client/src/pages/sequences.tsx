import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Play, Pause, Edit, Copy, Trash2, Mail, MessageSquare, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { Sequence } from "@shared/schema";

export default function Sequences() {
  const { data: sequences, isLoading } = useQuery<Sequence[]>({
    queryKey: ['/api/sequences'],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sequences</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage multi-step outreach campaigns
          </p>
        </div>
        <Button data-testid="button-new-sequence">
          <Plus className="h-4 w-4 mr-2" />
          New Sequence
        </Button>
      </div>

      {!sequences || sequences.length === 0 ? (
        <EmptyState
          icon={Play}
          title="No sequences yet"
          description="Create your first automated outreach sequence with email and SMS steps"
          actionLabel="Create Sequence"
          onAction={() => {}}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sequences.map((sequence) => (
            <Card key={sequence.id} className="hover-elevate" data-testid={`card-sequence-${sequence.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{sequence.name}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {sequence.description || "No description"}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0" data-testid={`button-sequence-menu-${sequence.id}`}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <StatusBadge status={sequence.active ? "active" : "inactive"} />
                  <span className="text-xs text-muted-foreground">{sequence.steps.length} steps</span>
                </div>

                <div className="space-y-2">
                  {sequence.steps.slice(0, 3).map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-2 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {idx + 1}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        {step.type === "email" && <Mail className="h-3.5 w-3.5" />}
                        {step.type === "sms" && <MessageSquare className="h-3.5 w-3.5" />}
                        {step.type === "wait" && <Clock className="h-3.5 w-3.5" />}
                        <span className="text-xs">
                          {step.type === "wait" ? `Wait ${step.waitHours}h` : step.type.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                  {sequence.steps.length > 3 && (
                    <div className="text-xs text-muted-foreground text-center">
                      +{sequence.steps.length - 3} more steps
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border">
                  <Button
                    variant={sequence.active ? "outline" : "default"}
                    className="w-full"
                    data-testid={`button-toggle-sequence-${sequence.id}`}
                  >
                    {sequence.active ? (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Activate
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
