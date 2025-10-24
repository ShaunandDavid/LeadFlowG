import { MetricCard } from "@/components/metric-card";
import { GuardrailBanner } from "@/components/guardrail-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, TrendingUp, MessageSquare, Calendar, AlertTriangle, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function Dashboard() {
  // Fetch dashboard metrics
  const [, setLocation] = useLocation();
  const { data: metrics, isLoading } = useQuery<{
    emailsSent: number;
    openRate: number;
    replyRate: number;
    bookingRate: number;
    bounceRate: number;
    verificationPassRate: number;
    dailyCapacity: number;
    dailyUsage: number;
  }>({
    queryKey: ['/api/dashboard/metrics'],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const showBounceWarning = (metrics?.bounceRate || 0) > 3;
  const showCapacityWarning = (metrics?.dailyUsage || 0) / (metrics?.dailyCapacity || 1) > 0.8;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor your outreach performance and deliverability health
        </p>
      </div>

      {showBounceWarning && (
        <GuardrailBanner
          type="error"
          message={`Bounce rate at ${metrics?.bounceRate.toFixed(1)}% - sending paused to protect deliverability. Run email verification on your list.`}
          actionLabel="Clean List"
          onAction={() => setLocation("/suppressions")}
          dismissible
        />
      )}

      {showCapacityWarning && !showBounceWarning && (
        <GuardrailBanner
          type="warning"
          message={`Daily sending capacity at ${Math.round((metrics?.dailyUsage || 0) / (metrics?.dailyCapacity || 1) * 100)}%. Upgrade your plan for higher limits.`}
          actionLabel="View Plans"
          onAction={() => setLocation("/settings")}
          dismissible
        />
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Emails Sent"
          value={metrics?.emailsSent.toLocaleString() || "0"}
          change={12}
          icon={Mail}
          trend="up"
        />
        <MetricCard
          title="Open Rate"
          value={`${(metrics?.openRate || 0).toFixed(1)}%`}
          change={3.2}
          icon={TrendingUp}
          trend="up"
        />
        <MetricCard
          title="Reply Rate"
          value={`${(metrics?.replyRate || 0).toFixed(1)}%`}
          change={1.8}
          icon={MessageSquare}
          trend="up"
        />
        <MetricCard
          title="Meetings Booked"
          value={(metrics?.bookingRate || 0).toFixed(1)}
          change={-0.5}
          icon={Calendar}
          trend="down"
        />
      </div>

      {/* Funnel & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead Funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { stage: "Imported", count: 1250, width: 100 },
              { stage: "Verified", count: 1100, width: 88 },
              { stage: "Contacted", count: 850, width: 68 },
              { stage: "Replied", count: 180, width: 14.4 },
              { stage: "Booked", count: 45, width: 3.6 },
            ].map((item) => (
              <div key={item.stage} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.stage}</span>
                  <span className="text-muted-foreground">{item.count.toLocaleString()}</span>
                </div>
                <Progress value={item.width} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { type: "reply", text: "John Doe replied to your email", time: "2 min ago" },
                { type: "book", text: "Meeting booked with Jane Smith", time: "15 min ago" },
                { type: "send", text: "Sent 50 emails from Dental Sequence", time: "1 hour ago" },
                { type: "verify", text: "Verified 200 leads", time: "2 hours ago" },
              ].map((activity, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{activity.text}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guardrail Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {(metrics?.bounceRate || 0) < 3 ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              )}
              Bounce Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.bounceRate || 0).toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Target: Below 3%</p>
            <Progress
              value={(metrics?.bounceRate || 0) * 33.33}
              className={`h-2 mt-3 ${(metrics?.bounceRate || 0) < 3 ? "bg-green-100" : "bg-red-100"}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {(metrics?.verificationPassRate || 0) > 85 ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              )}
              Verification Pass Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.verificationPassRate || 0).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Target: Above 85%</p>
            <Progress value={metrics?.verificationPassRate || 0} className="h-2 mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              Daily Sending Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.dailyUsage || 0}/{metrics?.dailyCapacity || 100}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((metrics?.dailyUsage || 0) / (metrics?.dailyCapacity || 1) * 100).toFixed(0)}% used today
            </p>
            <Progress
              value={((metrics?.dailyUsage || 0) / (metrics?.dailyCapacity || 1)) * 100}
              className="h-2 mt-3"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
