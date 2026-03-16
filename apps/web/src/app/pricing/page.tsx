"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, Crown, Zap, Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type BillingCycle = "monthly" | "yearly";

type PlanFeatures = {
  explanations: boolean;
  syllabus_structure: boolean;
  basic_analytics: boolean;
  detailed_analytics: boolean;
  ai_insights: boolean;
  ad_free: boolean;
};

function formatPrice(paisa: number): string {
  return `₹${Math.round(paisa / 100)}`;
}

function formatLimit(value: number): string {
  if (value === -1) return "Unlimited";
  return String(value);
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Zap className="text-muted-foreground h-6 w-6" />,
  pro: <Sparkles className="h-6 w-6 text-blue-500" />,
  premium: <Crown className="h-6 w-6 text-amber-500" />,
};

const PLAN_COLORS: Record<string, string> = {
  free: "border-border",
  pro: "border-blue-500 ring-1 ring-blue-500/20",
  premium: "border-amber-500 ring-1 ring-amber-500/20",
};

const FEATURE_LABELS: Record<string, string> = {
  explanations: "Question explanations",
  syllabus_structure: "Structured syllabus",
  basic_analytics: "Basic analytics",
  detailed_analytics: "Detailed analytics",
  ai_insights: "AI-powered insights",
  ad_free: "Ad-free experience",
};

export default function PricingPage(): React.ReactElement {
  const { status } = useSession();
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const plansQuery = trpc.payment.getPlans.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const isLoggedIn = status === "authenticated";

  // Fetch the user's actual current subscription to determine which plan they're on
  const currentSubQuery = trpc.payment.getCurrentSubscription.useQuery(undefined, {
    enabled: isLoggedIn,
    staleTime: 60_000,
  });

  const currentPlanName = currentSubQuery.data?.subscription?.planName ?? null;

  const utils = trpc.useUtils();

  const switchPlanMutation = trpc.payment.switchPlan.useMutation({
    onSuccess: (data) => {
      toast.success(`Switched to ${data.planDisplayName} plan!`);
      setLoadingPlan(null);
      // Invalidate cached subscription data so UI updates immediately
      void utils.payment.getCurrentSubscription.invalidate();
      void utils.tutorialAgent.getExamQuota.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
      setLoadingPlan(null);
    },
  });

  const handleSwitchPlan = (planName: string): void => {
    if (status !== "authenticated") {
      router.push("/login" as "/");
      return;
    }
    setLoadingPlan(planName);
    switchPlanMutation.mutate({
      planName: planName as "free" | "pro" | "premium",
    });
  };

  const plans = plansQuery.data ?? [];

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <header className="bg-background/95 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            ExamForge
          </Link>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Login
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm">Sign Up</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Choose your plan</h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
            Start free, upgrade when you need more. All plans include access to tutorials, practice
            exams, and AI-powered learning.
          </p>

          {/* Billing toggle */}
          <div className="bg-muted/50 mt-8 inline-flex items-center gap-3 rounded-full border p-1">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                billingCycle === "monthly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                billingCycle === "yearly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Yearly
              <Badge className="ml-2 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                Save 30%
              </Badge>
            </button>
          </div>
        </div>

        {/* Plans */}
        {plansQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const price = billingCycle === "monthly" ? plan.priceMonthlyInr : plan.priceYearlyInr;
              const monthlyEquivalent =
                billingCycle === "yearly"
                  ? Math.round(plan.priceYearlyInr / 12)
                  : plan.priceMonthlyInr;
              const features = (plan.features ?? {}) as PlanFeatures;
              const isFree = plan.name === "free";
              const isPro = plan.name === "pro";
              const isPremium = plan.name === "premium";
              const isLoading = loadingPlan === plan.name;

              // Determine "Current Plan" by comparing with actual subscription
              const isCurrentPlan =
                isLoggedIn && ((isFree && !currentPlanName) || currentPlanName === plan.name);

              // Can upgrade: user is on a lower plan
              const canUpgrade =
                isLoggedIn &&
                !isCurrentPlan &&
                !isFree &&
                (!currentPlanName || // free user can upgrade to any paid
                  (currentPlanName === "pro" && isPremium)); // pro user can upgrade to premium

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col",
                    PLAN_COLORS[plan.name] ?? "border-border",
                    isPro && "md:scale-105",
                    isCurrentPlan && "ring-primary/50 ring-2",
                  )}
                >
                  {isPro && !isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-blue-500 text-white">Most Popular</Badge>
                    </div>
                  )}
                  {isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">Your Plan</Badge>
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                      {PLAN_ICONS[plan.name]}
                      <CardTitle className="text-xl">{plan.displayName}</CardTitle>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">
                          {isFree ? "Free" : formatPrice(monthlyEquivalent)}
                        </span>
                        {!isFree && <span className="text-muted-foreground">/month</span>}
                      </div>
                      {!isFree && billingCycle === "yearly" && (
                        <p className="text-muted-foreground mt-1 text-sm">
                          Billed {formatPrice(price)} per year
                        </p>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col">
                    {/* Limits */}
                    <div className="mb-6 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Practice Exams</span>
                        <span className="font-medium">
                          {formatLimit(plan.maxMockExams)}
                          {plan.maxMockExams > 0 && plan.maxMockExams !== -1 ? "/month" : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">AI Questions</span>
                        <span className="font-medium">
                          {formatLimit(plan.maxAiQuestions)}
                          {plan.maxAiQuestions > 0 && plan.maxAiQuestions !== -1 ? "/month" : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tutorials</span>
                        <span className="font-medium">
                          {plan.maxTutorialsFree === -1
                            ? "Unlimited"
                            : `${plan.maxTutorialsFree} free`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Credits</span>
                        <span className="font-medium">
                          {plan.creditsPerMonth === -1
                            ? "Unlimited"
                            : `${plan.creditsPerMonth}/month`}
                        </span>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="mb-6 space-y-2.5 border-t pt-4">
                      {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                        const enabled = features[key as keyof PlanFeatures] ?? false;
                        return (
                          <div key={key} className="flex items-center gap-2 text-sm">
                            {enabled ? (
                              <Check className="h-4 w-4 shrink-0 text-green-500" />
                            ) : (
                              <X className="text-muted-foreground/40 h-4 w-4 shrink-0" />
                            )}
                            <span className={cn(!enabled && "text-muted-foreground/60")}>
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* CTA */}
                    <div className="mt-auto">
                      {isCurrentPlan ? (
                        <Button variant="outline" className="w-full" disabled>
                          Current Plan
                        </Button>
                      ) : !isLoggedIn ? (
                        <Link href="/signup">
                          <Button
                            className={cn(
                              "w-full",
                              isPremium && "bg-amber-500 hover:bg-amber-600",
                              isPro && "bg-blue-500 hover:bg-blue-600",
                            )}
                            variant={isFree ? "outline" : "default"}
                          >
                            {isFree ? "Get Started" : "Subscribe"}
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          className={cn(
                            "w-full",
                            canUpgrade && isPremium && "bg-amber-500 hover:bg-amber-600",
                            canUpgrade && isPro && "bg-blue-500 hover:bg-blue-600",
                          )}
                          variant={canUpgrade ? "default" : "outline"}
                          onClick={() => handleSwitchPlan(plan.name)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : canUpgrade ? (
                            "Upgrade"
                          ) : (
                            "Switch Plan"
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* FAQ Section */}
        <div className="mx-auto mt-16 max-w-2xl">
          <h2 className="mb-6 text-center text-2xl font-bold">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">Can I change my plan later?</summary>
              <p className="text-muted-foreground mt-2 text-sm">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the
                start of your next billing cycle.
              </p>
            </details>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">
                What happens when I run out of credits?
              </summary>
              <p className="text-muted-foreground mt-2 text-sm">
                Your credits reset at the start of each month. You can still access your saved notes
                and completed exams, but AI-powered features will be limited until credits refresh.
              </p>
            </details>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">Is there a student discount?</summary>
              <p className="text-muted-foreground mt-2 text-sm">
                We offer special pricing for students. Contact us with a valid student ID for
                discounted rates.
              </p>
            </details>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">
                How do I cancel my subscription?
              </summary>
              <p className="text-muted-foreground mt-2 text-sm">
                You can cancel anytime from your account settings. Your access continues until the
                end of the current billing period.
              </p>
            </details>
          </div>
        </div>
      </main>
    </div>
  );
}
