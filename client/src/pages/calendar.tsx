import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronLeft, ChevronRight, UtensilsCrossed, ShoppingCart } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, parseISO, isSameWeek } from "date-fns";

interface MealPlan {
  id: number;
  weekStartDate: string;
  createdAt: string;
}

interface ShoppingList {
  id: number;
  weekStartDate: string | null;
  name: string;
  createdAt: string;
}

interface CalendarData {
  mealPlans: MealPlan[];
  shoppingLists: ShoppingList[];
}

interface MealPlanDay {
  id: number;
  dayOfWeek: number;
  mealName: string;
  notes?: string | null;
}

interface WeekData {
  mealPlan: { id: number; days: MealPlanDay[] } | null;
  shoppingList: { id: number; name: string; items: { name: string; checked: number }[] } | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getWeekStartDate(date: Date): string {
  const d = startOfWeek(date, { weekStartsOn: 1 });
  return format(d, "yyyy-MM-dd");
}

export default function Calendar() {
  useDocumentTitle("Calendar - Sous Chef AI");
  const [, navigate] = useLocation();
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  
  const weekStartDate = getWeekStartDate(currentWeek);
  const weekEndDate = format(addWeeks(currentWeek, 1), "MMM d");
  const weekLabel = `${format(currentWeek, "MMM d")} - ${weekEndDate}`;
  const isCurrentWeek = isSameWeek(currentWeek, new Date(), { weekStartsOn: 1 });

  const { data: calendarData } = useQuery<CalendarData>({
    queryKey: ["/api/kitchen/calendar"],
  });

  const { data: weekData, isLoading } = useQuery<WeekData>({
    queryKey: ["/api/kitchen/week", weekStartDate],
    queryFn: async () => {
      const res = await fetch(`/api/kitchen/week/${weekStartDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const weeksWithPlans = calendarData?.mealPlans?.map(p => p.weekStartDate) || [];
  
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

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="px-4 py-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold" data-testid="calendar-title">Meal Calendar</h1>
            <p className="text-xs text-muted-foreground">
              Plan ahead, remember the past
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
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
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
          {isLoading ? (
            <div className="space-y-4">
              <Card className="p-4">
                <Skeleton className="h-6 w-32 mb-4" />
                <div className="grid grid-cols-7 gap-1">
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              </Card>
            </div>
          ) : weekData?.mealPlan ? (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <UtensilsCrossed className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">Meal Plan</h2>
                </div>
                
                <div className="space-y-2">
                  {FULL_DAY_NAMES.map((dayName, dayOfWeek) => {
                    const adjustedIndex = dayOfWeek === 0 ? 0 : dayOfWeek;
                    const meal = weekData.mealPlan?.days.find(d => d.dayOfWeek === adjustedIndex);
                    const dayDate = addWeeks(currentWeek, 0);
                    dayDate.setDate(currentWeek.getDate() + (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                    
                    return (
                      <div
                        key={dayOfWeek}
                        className={`flex items-center gap-3 p-2 rounded-md ${meal ? 'bg-muted/50 cursor-pointer hover-elevate' : ''}`}
                        onClick={() => meal && navigate(`/recipe/${meal.id}`)}
                        data-testid={`calendar-day-${dayOfWeek}`}
                      >
                        <div className="w-12 text-center">
                          <p className="text-xs text-muted-foreground">{DAY_NAMES[dayOfWeek]}</p>
                          <p className="font-medium">{format(dayDate, "d")}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          {meal ? (
                            <p className="truncate">{meal.mealName}</p>
                          ) : (
                            <p className="text-muted-foreground text-sm">No meal planned</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {weekData.shoppingList && weekData.shoppingList.items.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold">Shopping List</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {weekData.shoppingList.items.filter(i => i.checked).length} of{" "}
                    {weekData.shoppingList.items.length} items checked
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate("/shopping")}
                    data-testid="button-view-shopping"
                  >
                    View Full List
                  </Button>
                </Card>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <CalendarDays className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No meals planned</h3>
              <p className="text-muted-foreground text-sm max-w-xs mb-4">
                {isCurrentWeek 
                  ? "Head to the Plan tab to create this week's meal plan."
                  : "No meal plan was created for this week."}
              </p>
              {isCurrentWeek && (
                <Button onClick={() => navigate("/plan")} data-testid="button-go-to-plan">
                  Create Meal Plan
                </Button>
              )}
            </div>
          )}

          {weeksWithPlans.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Weeks with meal plans</h3>
              <div className="flex flex-wrap gap-2">
                {weeksWithPlans.slice(0, 8).map((weekDate) => {
                  const date = parseISO(weekDate);
                  const isSelected = weekDate === weekStartDate;
                  return (
                    <Button
                      key={weekDate}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentWeek(date)}
                      data-testid={`week-button-${weekDate}`}
                    >
                      {format(date, "MMM d")}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <BottomNav />
    </div>
  );
}
