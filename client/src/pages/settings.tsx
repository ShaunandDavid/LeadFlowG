import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/status-badge";
import { Settings as SettingsIcon, CreditCard, Palette, Users, Globe } from "lucide-react";
import { SiGmail, SiStripe, SiTwilio } from "react-icons/si";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account, integrations, and platform preferences
        </p>
      </div>

      <Tabs defaultValue="integrations" className="space-y-6">
        <TabsList>
          <TabsTrigger value="integrations" data-testid="tab-settings-integrations">
            <SettingsIcon className="h-4 w-4 mr-2" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-settings-billing">
            <CreditCard className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="branding" data-testid="tab-settings-branding">
            <Palette className="h-4 w-4 mr-2" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-settings-team">
            <Users className="h-4 w-4 mr-2" />
            Team
          </TabsTrigger>
          <TabsTrigger value="domain" data-testid="tab-settings-domain">
            <Globe className="h-4 w-4 mr-2" />
            Domain
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gmail Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border">
                      <SiGmail className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Gmail</CardTitle>
                      <CardDescription className="text-xs">Email sending & calendar</CardDescription>
                    </div>
                  </div>
                  <StatusBadge status="active" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Connected as</span>
                    <span className="font-medium">user@company.com</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Daily send limit</span>
                    <span className="font-medium">100 emails</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" data-testid="button-gmail-reconnect">
                    Reconnect
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" data-testid="button-gmail-disconnect">
                    Disconnect
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Stripe Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border">
                      <SiStripe className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Stripe</CardTitle>
                      <CardDescription className="text-xs">Payment processing</CardDescription>
                    </div>
                  </div>
                  <StatusBadge status="active" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current plan</span>
                    <span className="font-medium">Pro</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Billing period</span>
                    <span className="font-medium">Monthly</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full" data-testid="button-stripe-portal">
                  Manage Billing
                </Button>
              </CardContent>
            </Card>

            {/* Twilio Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border">
                      <SiTwilio className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Twilio</CardTitle>
                      <CardDescription className="text-xs">SMS messaging</CardDescription>
                    </div>
                  </div>
                  <StatusBadge status="pending" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Connect Twilio to enable SMS sequences
                </p>
                <Button variant="outline" size="sm" className="w-full" data-testid="button-twilio-connect">
                  Connect Twilio
                </Button>
              </CardContent>
            </Card>

            {/* Email Verification */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border">
                      <span className="text-xl">✓</span>
                    </div>
                    <div>
                      <CardTitle className="text-base">NeverBounce</CardTitle>
                      <CardDescription className="text-xs">Email verification</CardDescription>
                    </div>
                  </div>
                  <StatusBadge status="inactive" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Verify email addresses before sending to improve deliverability
                </p>
                <Button variant="outline" size="sm" className="w-full" data-testid="button-neverbounce-connect">
                  Connect Service
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>You're currently on the Pro plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground">Monthly Cost</div>
                  <div className="text-2xl font-bold mt-1">$99</div>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground">Email Limit</div>
                  <div className="text-2xl font-bold mt-1">10,000</div>
                  <div className="text-xs text-muted-foreground mt-1">per month</div>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <div className="text-sm text-muted-foreground">Team Seats</div>
                  <div className="text-2xl font-bold mt-1">5</div>
                  <div className="text-xs text-muted-foreground mt-1">members</div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" data-testid="button-change-plan">Change Plan</Button>
                <Button variant="outline" data-testid="button-billing-portal">View Billing History</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>White-Label Branding</CardTitle>
              <CardDescription>Customize the platform appearance for your brand</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="logo-url">Logo URL</Label>
                  <Input id="logo-url" placeholder="https://example.com/logo.png" data-testid="input-logo-url" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primary-color">Primary Color</Label>
                  <Input id="primary-color" type="color" defaultValue="#3b82f6" data-testid="input-primary-color" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from-name">Email From Name</Label>
                  <Input id="from-name" placeholder="Your Company" data-testid="input-from-name" />
                </div>
              </div>
              <Button data-testid="button-save-branding">Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>Manage access for your team</CardDescription>
                </div>
                <Button data-testid="button-invite-member">Invite Member</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: "John Doe", email: "john@company.com", role: "owner" },
                  { name: "Jane Smith", email: "jane@company.com", role: "admin" },
                  { name: "Bob Johnson", email: "bob@company.com", role: "member" },
                ].map((member, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={member.role} />
                      {member.role !== "owner" && (
                        <Button variant="ghost" size="sm">Remove</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domain" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Custom Email Domain</CardTitle>
              <CardDescription>Configure SPF, DKIM, and DMARC for better deliverability</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain Name</Label>
                  <Input id="domain" placeholder="mail.yourdomain.com" data-testid="input-domain" />
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h4 className="font-medium text-sm">DNS Records</h4>
                  <div className="space-y-2 text-sm font-mono bg-muted p-3 rounded">
                    <div>SPF: v=spf1 include:_spf.google.com ~all</div>
                    <div>DKIM: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSI...</div>
                    <div>DMARC: v=DMARC1; p=quarantine; rua=...</div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                  <span className="text-sm">Domain verification pending</span>
                  <StatusBadge status="pending" />
                </div>
              </div>

              <Button data-testid="button-verify-domain">Verify Domain</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
