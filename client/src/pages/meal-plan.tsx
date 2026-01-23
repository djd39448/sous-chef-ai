import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { MealPlanCard } from "@/components/meal-plan-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, ShoppingCart, ChevronLeft, ChevronRight, Check, Loader2, ChefHat, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addWeeks, subWeeks, startOfWeek, isSameWeek, addDays } from "date-fns";

interface MealPlanDay {
  id: number;
  dayOfWeek: number;
  mealName: string;
  notes?: string | null;
}

interface MealPlan {
  id: number;
  weekStartDate: string;
  days: MealPlanDay[];
}

interface WeekData {
  mealPlan: MealPlan | null;
  shoppingList: { id: number; name: string; items: { name: string; checked: number }[] } | null;
}

interface PlanItProgress {
  step: string;
  status: string;
  meals?: string[];
  mealName?: string;
  index?: number;
  total?: number;
  itemCount?: number;
  weekStartDate?: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getWeekStartDate(date: Date): string {
  const d = startOfWeek(date, { weekStartsOn: 1 });
  return format(d, "yyyy-MM-dd");
}

export default function MealPlan() {
  useDocumentTitle("Weekly Plan - Sous Chef AI");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [planItProgress, setPlanItProgress] = useState<PlanItProgress | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  
  const weekStartDate = getWeekStartDate(currentWeek);
  const isCurrentWeek = isSameWeek(currentWeek, new Date(), { weekStartsOn: 1 });
  const weekLabel = `${format(currentWeek, "MMM d")} - ${format(addDays(currentWeek, 6), "MMM d")}`;

  const { data: weekData, isLoading } = useQuery<WeekData>({
    queryKey: ["/api/kitchen/week", weekStartDate],
    queryFn: async () => {
      const res = await fetch(`/api/kitchen/week/${weekStartDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !isPlanning,
  });

  const executePlanIt = useCallback(async () => {
    setIsPlanning(true);
    setPlanItProgress({ step: "starting", status: "pending" });

    try {
      const response = await fetch("/api/kitchen/plan-it", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ weekStartDate }),
      });

      if (!response.ok) {
        throw new Error("Failed to start Plan It workflow");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              setPlanItProgress(data);

              if (data.step === "done" && data.status === "completed") {
                queryClient.invalidateQueries({ queryKey: ["/api/kitchen/week", weekStartDate] });
                queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan"] });
                queryClient.invalidateQueries({ queryKey: ["/api/kitchen/calendar"] });
                queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-lists"] });
                toast({
                  title: "Week planned!",
                  description: "Meal plan, recipes, and shopping list are ready.",
                });
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      console.error("Plan It error:", error);
      toast({
        title: "Planning failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPlanning(false);
      setPlanItProgress(null);
    }
  }, [weekStartDate, toast]);

  const navigateWeek = (direction: "prev" | "next") => {
    if (direction === "prev") {
      setCurrentWeek(subWeeks(currentWeek, 1));
    } else {
      setCurrentWeek(addWeeks(currentWeek, 1));
    }
  };

  const goToThisWeek = () => {
    setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  const mealPlan = weekData?.mealPlan;
  const shoppingList = weekData?.shoppingList;
  const days = mealPlan?.days || [];
  const sortedDays = [...days].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek);
  });

  const handleDayClick = (dayId: number) => {
    navigate(`/recipe/${dayId}`);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header user={user} title="Weekly Plan" />

      <div className="flex-1 overflow-hidden pb-16">
        <ScrollArea className="h-full">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-2 mb-4 p-2 rounded-lg bg-muted/30">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateWeek("prev")}
                disabled={isPlanning}
                data-testid="button-prev-week"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              
              <div className="flex-1 text-center">
                <p className="font-medium" data-testid="week-label">{weekLabel}</p>
                {!isCurrentWeek && !isPlanning && (
                  <button
                    onClick={goToThisWeek}
                    className="text-xs text-primary hover:underline"
                    data-testid="button-this-week"
                  >
                    Back to this week
                  </button>
                )}
                {isCurrentWeek && !isPlanning && (
                  <p className="text-xs text-muted-foreground">This week</p>
                )}
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateWeek("next")}
                disabled={isPlanning}
                data-testid="button-next-week"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {isPlanning ? (
              <PlanItProgressUI progress={planItProgress} />
            ) : isLoading ? (
              <MealPlanSkeleton />
            ) : !mealPlan || days.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <ChefHat className="h-10 w-10 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No meals planned</h3>
                <p className="text-muted-foreground text-sm max-w-xs mb-6">
                  {isCurrentWeek 
                    ? "Let me plan your whole week with recipes and a shopping list!"
                    : `Plan the week of ${format(currentWeek, "MMM d")} with one tap.`}
                </p>
                <Button 
                  onClick={executePlanIt}
                  disabled={isPlanning}
                  size="lg"
                  data-testid="button-plan-it"
                >
                  Plan It
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-lg">
                      {isCurrentWeek ? "This Week's Dinners" : `Week of ${format(currentWeek, "MMM d")}`}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Tap a day to view recipe
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={executePlanIt}
                    disabled={isPlanning}
                    data-testid="button-replan"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-Plan
                  </Button>
                </div>

                <div className="space-y-3 mb-6">
                  {sortedDays.map((day) => (
                    <MealPlanCard
                      key={day.id}
                      day={DAY_NAMES[day.dayOfWeek]}
                      mealName={day.mealName}
                      notes={day.notes}
                      onClick={() => handleDayClick(day.id)}
                    />
                  ))}
                </div>

                {shoppingList && shoppingList.items.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/shopping")}
                    data-testid="button-view-shopping"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    View Shopping List ({shoppingList.items.length} items)
                  </Button>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      <BottomNav />
    </div>
  );
}

interface PlanItProgressUIProps {
  progress: PlanItProgress | null;
}

function PlanItProgressUI({ progress }: PlanItProgressUIProps) {
  const getStepStatus = (step: string) => {
    if (!progress) return "pending";
    
    const stepOrder = ["meal_plan", "recipes", "shopping_list", "done"];
    const currentIndex = stepOrder.indexOf(progress.step);
    const stepIndex = stepOrder.indexOf(step);
    
    if (progress.step === step) {
      return progress.status === "completed" ? "completed" : "active";
    }
    if (stepIndex < currentIndex) return "completed";
    return "pending";
  };

  const steps = [
    { id: "meal_plan", label: "Creating meal plan", icon: ClipboardList },
    { id: "recipes", label: "Generating recipes", icon: ChefHat },
    { id: "shopping_list", label: "Building shopping list", icon: ShoppingCart },
  ];

  return (
    <Card className="p-6">
      <h3 className="font-semibold text-lg mb-6 text-center">Planning your week...</h3>
      
      <div className="space-y-4">
        {steps.map((step) => {
          const status = getStepStatus(step.id);
          const Icon = step.icon;
          
          return (
            <div key={step.id} className="flex items-center gap-4">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                ${status === "completed" ? "bg-primary text-primary-foreground" : ""}
                ${status === "active" ? "bg-primary/20 text-primary" : ""}
                ${status === "pending" ? "bg-muted text-muted-foreground" : ""}
              `}>
                {status === "completed" ? (
                  <Check className="h-5 w-5" />
                ) : status === "active" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <p className={`font-medium ${status === "pending" ? "text-muted-foreground" : ""}`}>
                  {step.label}
                </p>
                {status === "active" && progress?.step === "recipes" && progress?.mealName && (
                  <p className="text-sm text-muted-foreground">
                    {progress.mealName}...
                  </p>
                )}
                {status === "active" && progress?.step === "meal_plan" && progress?.meals && (
                  <p className="text-sm text-muted-foreground">
                    {progress.meals.length} meals ready
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {progress?.step === "done" && (
        <div className="mt-6 p-4 bg-primary/10 rounded-lg text-center">
          <Check className="h-8 w-8 text-primary mx-auto mb-2" />
          <p className="font-semibold">All done!</p>
          <p className="text-sm text-muted-foreground">
            {progress.itemCount} items on your shopping list
          </p>
        </div>
      )}
    </Card>
  );
}

function MealPlanSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(7)].map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
