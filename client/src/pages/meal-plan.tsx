import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { MealPlanCard, EmptyMealPlan } from "@/components/meal-plan-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
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
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/kitchen/generate-meal-plan", { weekStartDate });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/week", weekStartDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/calendar"] });
      toast({
        title: "Meal plan created!",
        description: `Your dinner plan for the week of ${format(currentWeek, "MMM d")} is ready.`,
      });
    },
    onError: () => {
      toast({
        title: "Couldn't generate plan",
        description: "Please try again or ask in the chat.",
        variant: "destructive",
      });
    },
  });

  const generateShoppingListMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/kitchen/generate-shopping-list", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to generate shopping list");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-list"] });
      toast({
        title: "Shopping list created!",
        description: "Based on your meal plan.",
      });
      navigate("/shopping");
    },
    onError: () => {
      toast({
        title: "Couldn't generate list",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

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
                data-testid="button-prev-week"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              
              <div className="flex-1 text-center">
                <p className="font-medium" data-testid="week-label">{weekLabel}</p>
                {!isCurrentWeek && (
                  <button
                    onClick={goToThisWeek}
                    className="text-xs text-primary hover:underline"
                    data-testid="button-this-week"
                  >
                    Back to this week
                  </button>
                )}
                {isCurrentWeek && (
                  <p className="text-xs text-muted-foreground">This week</p>
                )}
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateWeek("next")}
                data-testid="button-next-week"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {isLoading ? (
              <MealPlanSkeleton />
            ) : !mealPlan || days.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                  <RefreshCw className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No meals planned</h3>
                <p className="text-muted-foreground text-sm max-w-xs mb-6">
                  {isCurrentWeek 
                    ? "Let's create a meal plan for this week!"
                    : `Create a meal plan for the week of ${format(currentWeek, "MMM d")}.`}
                </p>
                <Button 
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  size="lg"
                  data-testid="button-create-plan"
                >
                  {generateMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Creating plan...
                    </>
                  ) : (
                    "Create Meal Plan"
                  )}
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
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    data-testid="button-regenerate-plan"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${generateMutation.isPending ? "animate-spin" : ""}`} />
                    New Plan
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

                {isCurrentWeek && (
                  <Button
                    className="w-full"
                    onClick={() => generateShoppingListMutation.mutate()}
                    disabled={generateShoppingListMutation.isPending}
                    data-testid="button-generate-shopping-list"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Generate Shopping List
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

function MealPlanSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(7)].map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
