import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { MealPlanCard, EmptyMealPlan } from "@/components/meal-plan-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function MealPlan() {
  useDocumentTitle("Weekly Plan - Sous Chef AI");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: mealPlan, isLoading } = useQuery<MealPlan | null>({
    queryKey: ["/api/kitchen/meal-plan"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/kitchen/generate-meal-plan", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to generate meal plan");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan"] });
      toast({
        title: "Meal plan created!",
        description: "Your weekly dinner plan is ready.",
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
          <div className="max-w-2xl mx-auto px-4 py-6">
            {isLoading ? (
              <MealPlanSkeleton />
            ) : !mealPlan || days.length === 0 ? (
              <EmptyMealPlan onGenerate={() => generateMutation.mutate()} />
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-semibold text-lg">This Week's Dinners</h2>
                    <p className="text-sm text-muted-foreground">
                      Tap a day to modify in chat
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

                <Button
                  className="w-full"
                  onClick={() => generateShoppingListMutation.mutate()}
                  disabled={generateShoppingListMutation.isPending}
                  data-testid="button-generate-shopping-list"
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Generate Shopping List
                </Button>
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
