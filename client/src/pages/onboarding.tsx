import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Check, Upload, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiGmail } from "react-icons/si";
import { useLocation } from "wouter";
import { auth } from "@/lib/firebase";

const STEPS = [
  { id: 1, title: "Connect Gmail", description: "Authorize email sending" },
  { id: 2, title: "Select Plan", description: "Choose your subscription" },
  { id: 3, title: "Configure Domain", description: "Set up email domain (optional)" },
  { id: 4, title: "Import Leads", description: "Upload your first list" },
  { id: 5, title: "Preview", description: "Review and launch" },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    features: ["100 emails/day", "1,000 verifications/month", "2 seats", "Basic analytics"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    features: ["1,000 emails/day", "10,000 verifications/month", "5 seats", "Advanced analytics", "Custom domain"],
  },
  {
    id: "agency",
    name: "Agency",
    price: 299,
    features: ["10,000 emails/day", "Unlimited verifications", "Unlimited seats", "White-label", "Priority support"],
  },
];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [, setLocation] = useLocation();

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  const handleNext = async () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete onboarding - provision tenant
      try {
        const user = auth.currentUser;
        if (!user) {
          console.error("No authenticated user");
          return;
        }

        const token = await user.getIdToken();
        const response = await fetch('/api/auth/provision', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan: selectedPlan }),
        });

        if (response.ok) {
          // Force token refresh to get new custom claims
          await user.getIdToken(true);
          // Redirect to dashboard
          setLocation("/dashboard");
        } else {
          console.error("Failed to provision tenant");
        }
      } catch (error) {
        console.error("Onboarding completion error:", error);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                      currentStep > step.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : currentStep === step.id
                        ? "border-primary bg-background text-primary"
                        : "border-muted bg-background text-muted-foreground"
                    )}
                  >
                    {currentStep > step.id ? <Check className="h-5 w-5" /> : step.id}
                  </div>
                  <div className="mt-2 text-center hidden md:block">
                    <div className="text-xs font-medium">{step.title}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 w-12 md:w-24 mx-2 transition-colors",
                      currentStep > step.id ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Content */}
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
            <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Connect Gmail */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white border mb-4">
                    <SiGmail className="h-8 w-8 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Connect your Gmail account</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    We'll use your Gmail to send emails and access your calendar for meeting scheduling
                  </p>
                </div>
                <Button className="w-full h-12" data-testid="button-onboarding-connect-gmail">
                  <SiGmail className="h-5 w-5 mr-2" />
                  Authorize Gmail Access
                </Button>
              </div>
            )}

            {/* Step 2: Select Plan */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <RadioGroup value={selectedPlan} onValueChange={setSelectedPlan}>
                  <div className="grid grid-cols-1 gap-4">
                    {PLANS.map((plan) => (
                      <label
                        key={plan.id}
                        className={cn(
                          "relative flex cursor-pointer rounded-lg border-2 p-6 transition-all hover-elevate",
                          selectedPlan === plan.id ? "border-primary bg-primary/5" : "border-border"
                        )}
                        data-testid={`radio-plan-${plan.id}`}
                      >
                        <RadioGroupItem value={plan.id} className="sr-only" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-lg font-semibold">{plan.name}</h4>
                            <div className="text-right">
                              <div className="text-2xl font-bold">${plan.price}</div>
                              <div className="text-xs text-muted-foreground">/month</div>
                            </div>
                          </div>
                          <ul className="space-y-2">
                            {plan.features.map((feature, idx) => (
                              <li key={idx} className="flex items-center text-sm">
                                <Check className="h-4 w-4 mr-2 text-primary shrink-0" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </label>
                    ))}
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Step 3: Configure Domain */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <p className="font-medium mb-2">Optional: Custom Email Domain</p>
                  <p className="text-muted-foreground">
                    Configure a custom domain for better deliverability and branding. You can skip this step and set it up later.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain Name</Label>
                  <Input id="domain" placeholder="mail.yourdomain.com" data-testid="input-onboarding-domain" />
                </div>
                <div className="text-xs text-muted-foreground">
                  DNS instructions will be provided after setup
                </div>
              </div>
            )}

            {/* Step 4: Import Leads */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover-elevate cursor-pointer" data-testid="dropzone-import-leads">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Upload CSV File</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Drag and drop your leads file or click to browse
                  </p>
                  <Button variant="outline" data-testid="button-browse-file">
                    Browse Files
                  </Button>
                </div>
                <div className="text-center">
                  <Button variant="link" size="sm" data-testid="button-download-template">
                    Download CSV Template
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: Preview */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-6 text-center">
                  <Check className="h-12 w-12 mx-auto mb-4 text-green-600" />
                  <h3 className="text-lg font-semibold mb-2">You're all set!</h3>
                  <p className="text-sm text-muted-foreground">
                    Your account is configured and ready to start sending outreach campaigns
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <span className="text-sm font-medium">Gmail Connected</span>
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <span className="text-sm font-medium">Plan: {selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}</span>
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <span className="text-sm font-medium">Daily Limit: 25 emails</span>
                    <span className="text-xs text-muted-foreground">(Warmup stage 1)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t border-border">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
                data-testid="button-onboarding-back"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                {currentStep === 3 && (
                  <Button variant="ghost" onClick={handleSkip} data-testid="button-onboarding-skip">
                    Skip
                  </Button>
                )}
                <Button onClick={handleNext} data-testid="button-onboarding-next">
                  {currentStep === STEPS.length ? (
                    "Complete Setup"
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
