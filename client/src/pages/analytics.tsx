import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Download, TrendingUp, Mail, MousePointerClick, MessageSquare, Calendar } from 'lucide-react';

interface AnalyticsData {
  date: string;
  send_ok?: number;
  open?: number;
  click?: number;
  reply?: number;
  booked?: number;
  bounce?: number;
  unsubscribe?: number;
}

export default function Analytics() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  // Calculate date range
  const getDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (dateRange) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const formatDate = (d: Date) => {
      return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    };

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    };
  };

  const { startDate, endDate } = getDateRange();

  const { data: analytics = [], isLoading } = useQuery<AnalyticsData[]>({
    queryKey: ['/api/analytics', { startDate, endDate }],
  });

  // Aggregate totals
  const totals = analytics.reduce(
    (acc, day) => ({
      sends: acc.sends + (day.send_ok || 0),
      opens: acc.opens + (day.open || 0),
      clicks: acc.clicks + (day.click || 0),
      replies: acc.replies + (day.reply || 0),
      bookings: acc.bookings + (day.booked || 0),
      bounces: acc.bounces + (day.bounce || 0),
      unsubscribes: acc.unsubscribes + (day.unsubscribe || 0),
    }),
    { sends: 0, opens: 0, clicks: 0, replies: 0, bookings: 0, bounces: 0, unsubscribes: 0 }
  );

  // Calculate rates (P1: Fix clickRate formula - should be clicks/opens not clicks/sends)
  const openRate = totals.sends > 0 ? (totals.opens / totals.sends) * 100 : 0;
  const clickRate = totals.opens > 0 ? (totals.clicks / totals.opens) * 100 : 0; // Correct: clicks/opens
  const replyRate = totals.sends > 0 ? (totals.replies / totals.sends) * 100 : 0;
  const bookingRate = totals.sends > 0 ? (totals.bookings / totals.sends) * 100 : 0;

  // P2: Add loading state, error handling, and disabled state for export
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/analytics/export?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) {
        throw new Error(`Export failed: ${res.statusText}`);
      }
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${startDate}-${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: "Your analytics data has been downloaded.",
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export analytics data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-analytics-title">Campaign Analytics</h1>
          <p className="text-muted-foreground">
            Track your outreach performance and optimize campaigns
          </p>
        </div>
        <div className="flex gap-3">
          <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
            <SelectTrigger className="w-32" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            onClick={handleExport} 
            disabled={isExporting}
            data-testid="button-export-analytics"
            aria-label="Export analytics as CSV"
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="card-kpi-sends">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="metric-sends">{totals.sends.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {totals.bounces} bounced, {totals.unsubscribes} unsubscribed
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-kpi-open-rate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="metric-open-rate">{openRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  {totals.opens.toLocaleString()} opens
                </p>
                <p className="text-xs text-muted-foreground mt-1 opacity-70">
                  Note: Opens may be inflated by Apple Mail Privacy Protection
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-kpi-click-rate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
                <MousePointerClick className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="metric-click-rate">{clickRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  {totals.clicks.toLocaleString()} clicks
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-kpi-reply-rate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Reply Rate</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="metric-reply-rate">{replyRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  {totals.replies.toLocaleString()} replies
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="card-booking-conversion">
              <CardHeader>
                <CardTitle>Booking Conversion</CardTitle>
                <CardDescription>Meetings booked from outreach</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl font-bold" data-testid="metric-bookings">{totals.bookings.toLocaleString()}</div>
                    <p className="text-sm text-muted-foreground mt-1">Total bookings</p>
                  </div>
                  <Calendar className="h-12 w-12 text-muted-foreground opacity-20" aria-hidden="true" />
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-primary" data-testid="metric-booking-rate">{bookingRate.toFixed(2)}%</span>
                  <span className="text-sm text-muted-foreground">booking rate</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-engagement-funnel">
              <CardHeader>
                <CardTitle>Engagement Funnel</CardTitle>
                <CardDescription>Track your lead progression</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between" data-testid="funnel-stage-sent">
                  <span className="text-sm text-muted-foreground">Sent</span>
                  <span className="font-medium">{totals.sends.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between" data-testid="funnel-stage-opened">
                  <span className="text-sm text-muted-foreground">Opened</span>
                  <span className="font-medium">{totals.opens.toLocaleString()} ({openRate.toFixed(1)}%)</span>
                </div>
                <div className="flex items-center justify-between" data-testid="funnel-stage-clicked">
                  <span className="text-sm text-muted-foreground">Clicked</span>
                  <span className="font-medium">{totals.clicks.toLocaleString()} ({clickRate.toFixed(1)}%)</span>
                </div>
                <div className="flex items-center justify-between" data-testid="funnel-stage-replied">
                  <span className="text-sm text-muted-foreground">Replied</span>
                  <span className="font-medium">{totals.replies.toLocaleString()} ({replyRate.toFixed(1)}%)</span>
                </div>
                <div className="flex items-center justify-between border-t pt-3" data-testid="funnel-stage-booked">
                  <span className="text-sm font-medium">Booked</span>
                  <span className="font-bold text-primary">{totals.bookings.toLocaleString()} ({bookingRate.toFixed(2)}%)</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {analytics.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                <p className="text-muted-foreground text-center">
                  No analytics data available for the selected period.
                  <br />
                  Start sending campaigns to see your performance metrics.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
