import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Analytics() {
  // Mock data for visualization
  const funnelData = [
    { stage: "Imported", count: 1250, percentage: 100, color: "bg-blue-500" },
    { stage: "Verified", count: 1100, percentage: 88, color: "bg-cyan-500" },
    { stage: "Contacted", count: 850, percentage: 68, color: "bg-purple-500" },
    { stage: "Replied", count: 180, percentage: 14.4, color: "bg-indigo-500" },
    { stage: "Booked", count: 45, percentage: 3.6, color: "bg-green-500" },
  ];

  const subjectLines = [
    { subject: "Quick question about {{company}}", opens: 342, rate: 68.4 },
    { subject: "Thought you'd find this interesting", opens: 298, rate: 59.6 },
    { subject: "{{firstName}}, following up", opens: 267, rate: 53.4 },
    { subject: "Re: {{company}} outreach", opens: 245, rate: 49.0 },
    { subject: "Quick win for {{company}}", opens: 223, rate: 44.6 },
  ];

  const templates = [
    { name: "Roofing - Initial Outreach", sent: 450, replied: 68, rate: 15.1 },
    { name: "Dental - Follow-up", sent: 380, replied: 52, rate: 13.7 },
    { name: "Solar - Value Prop", sent: 320, replied: 38, rate: 11.9 },
    { name: "HVAC - Pain Point", sent: 290, replied: 31, rate: 10.7 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyze performance and optimize your outreach campaigns
          </p>
        </div>
        <Button variant="outline" data-testid="button-date-range">
          <Calendar className="h-4 w-4 mr-2" />
          Last 30 Days
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-analytics-overview">Overview</TabsTrigger>
          <TabsTrigger value="subjects" data-testid="tab-analytics-subjects">Subject Lines</TabsTrigger>
          <TabsTrigger value="times" data-testid="tab-analytics-times">Send Times</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-analytics-templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Funnel Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conversion Funnel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {funnelData.map((stage, idx) => (
                  <div key={stage.stage} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {idx + 1}
                        </div>
                        <span className="font-medium">{stage.stage}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{stage.count.toLocaleString()}</span>
                        <Badge variant="outline" className="text-xs">
                          {stage.percentage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="relative">
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${stage.color} transition-all duration-500`}
                          style={{ width: `${stage.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Performance Over Time */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { metric: "Open Rate", value: 42.5, change: 3.2, trend: "up" },
                    { metric: "Reply Rate", value: 12.8, change: 1.5, trend: "up" },
                    { metric: "Booking Rate", value: 3.6, change: -0.3, trend: "down" },
                    { metric: "Bounce Rate", value: 1.2, change: -0.5, trend: "up" },
                  ].map((metric) => (
                    <div key={metric.metric} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{metric.metric}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{metric.value}%</span>
                          <span className={`text-xs ${metric.trend === "up" && metric.metric !== "Bounce Rate" ? "text-green-600" : "text-red-600"}`}>
                            {metric.change > 0 ? "+" : ""}{metric.change}%
                          </span>
                        </div>
                      </div>
                      <Progress value={metric.value * 2} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subjects" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subject Line Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {subjectLines.map((line, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-lg border border-border hover-elevate">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="shrink-0">#{idx + 1}</Badge>
                        <p className="font-mono text-sm truncate">{line.subject}</p>
                      </div>
                      <div className="mt-2">
                        <Progress value={line.rate} className="h-1.5" />
                      </div>
                    </div>
                    <div className="ml-4 text-right shrink-0">
                      <div className="text-lg font-bold">{line.rate}%</div>
                      <div className="text-xs text-muted-foreground">{line.opens} opens</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="times" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send Time Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
                  <div key={day} className="flex items-center gap-3">
                    <div className="w-24 text-sm font-medium">{day}</div>
                    <div className="flex-1 grid grid-cols-12 gap-1">
                      {[...Array(12)].map((_, hour) => {
                        const intensity = Math.random();
                        return (
                          <div
                            key={hour}
                            className="h-8 rounded"
                            style={{
                              backgroundColor: `hsl(221, 83%, ${85 - intensity * 32}%)`,
                            }}
                            title={`${hour + 8}:00 - ${intensity.toFixed(2)}% open rate`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                  <span>8 AM</span>
                  <span>11 AM</span>
                  <span>2 PM</span>
                  <span>5 PM</span>
                  <span>8 PM</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Template Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {templates.map((template, idx) => (
                  <div key={idx} className="p-4 rounded-lg border border-border hover-elevate">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{template.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {template.sent} sent • {template.replied} replies
                        </p>
                      </div>
                      <Badge variant="outline" className={template.rate > 12 ? "border-green-500 text-green-600" : ""}>
                        {template.rate}% reply rate
                      </Badge>
                    </div>
                    <Progress value={template.rate * 5} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
