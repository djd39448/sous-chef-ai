import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronLeft, ChevronRight, UtensilsCrossed, ShoppingCart, Grid3X3, List, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  format, 
  addDays, 
  addWeeks, 
  subWeeks, 
  addMonths, 
  subMonths, 
  startOfWeek, 
  startOfMonth, 
  endOfMonth, 
  eachWeekOfInterval, 
  parseISO, 
  isSameWeek, 
  isSameMonth,
  isSameDay
} from "date-fns";

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

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getWeekStartDate(date: Date): string {
  const d = startOfWeek(date, { weekStartsOn: 1 });
  return format(d, "yyyy-MM-dd");
}

type ViewMode = "week" | "month";

export default function Calendar() {
  useDocumentTitle("Calendar - Sous Chef AI");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  
  const weekStartDate = getWeekStartDate(currentWeek);
  const weekEndDate = format(addDays(currentWeek, 6), "MMM d");
  const weekLabel = `${format(currentWeek, "MMM d")} - ${weekEndDate}`;
  const isCurrentWeek = isSameWeek(currentWeek, new Date(), { weekStartsOn: 1 });
  const isCurrentMonth = isSameMonth(currentMonth, new Date());

  const { data: calendarData } = useQuery<CalendarData>({
    queryKey: ["/api/kitchen/calendar"],
  });

  const { data: weekData, isLoading: weekLoading } = useQuery<WeekData>({
    queryKey: ["/api/kitchen/week", weekStartDate],
    queryFn: async () => {
      const res = await fetch(`/api/kitchen/week/${weekStartDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: viewMode === "week",
  });

  const generateMutation = useMutation({
    mutationFn: async (targetWeekStartDate: string) => {
      const response = await apiRequest("POST", "/api/kitchen/generate-meal-plan", { weekStartDate: targetWeekStartDate });
      return response.json();
    },
    onSuccess: (_, targetWeekStartDate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/week", targetWeekStartDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/calendar"] });
      toast({
        title: "Meal plan created!",
        description: "Your weekly dinner plan is ready.",
      });
    },
    onError: () => {
      toast({
        title: "Couldn't generate plan",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const weeksWithPlans = new Set(calendarData?.mealPlans?.map(p => p.weekStartDate) || []);
  const weeksWithLists = new Set(calendarData?.shoppingLists?.map(l => l.weekStartDate).filter((d): d is string => d !== null) || []);
  
  const navigateWeek = (direction: "prev" | "next") => {
    if (direction === "prev") {
      setCurrentWeek(subWeeks(currentWeek, 1));
    } else {
      setCurrentWeek(addWeeks(currentWeek, 1));
    }
  };

  const navigateMonth = (direction: "prev" | "next") => {
    if (direction === "prev") {
      setCurrentMonth(subMonths(currentMonth, 1));
    } else {
      setCurrentMonth(addMonths(currentMonth, 1));
    }
  };

  const goToThisWeek = () => {
    setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setCurrentMonth(startOfMonth(new Date()));
  };

  const selectWeek = (weekStart: Date) => {
    setCurrentWeek(weekStart);
    setViewMode("week");
  };

  const getMonthWeeks = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="px-4 py-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
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
          
          <div className="flex gap-1">
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("week")}
              data-testid="button-view-week"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("month")}
              data-testid="button-view-month"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => viewMode === "week" ? navigateWeek("prev") : navigateMonth("prev")}
            data-testid="button-prev"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex-1 text-center">
            {viewMode === "week" ? (
              <>
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
              </>
            ) : (
              <>
                <p className="font-medium" data-testid="month-label">{format(currentMonth, "MMMM yyyy")}</p>
                {!isCurrentMonth && (
                  <button
                    onClick={goToThisWeek}
                    className="text-xs text-primary hover:underline"
                    data-testid="button-this-month"
                  >
                    Back to this month
                  </button>
                )}
                {isCurrentMonth && (
                  <p className="text-xs text-muted-foreground">This month</p>
                )}
              </>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => viewMode === "week" ? navigateWeek("next") : navigateMonth("next")}
            data-testid="button-next"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
          {viewMode === "month" ? (
            <MonthView 
              currentMonth={currentMonth}
              weeks={getMonthWeeks()}
              weeksWithPlans={weeksWithPlans}
              weeksWithLists={weeksWithLists}
              onSelectWeek={selectWeek}
              onViewList={(weekDateStr) => navigate(`/shopping?week=${weekDateStr}`)}
              onCreatePlan={(weekStart) => generateMutation.mutate(getWeekStartDate(weekStart))}
              isGenerating={generateMutation.isPending}
            />
          ) : weekLoading ? (
            <div className="space-y-4">
              <Card className="p-4">
                <Skeleton className="h-6 w-32 mb-4" />
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              </Card>
            </div>
          ) : weekData?.mealPlan ? (
            <WeekView 
              weekData={weekData}
              currentWeek={currentWeek}
              navigate={navigate}
            />
          ) : (
            <EmptyWeekState 
              isCurrentWeek={isCurrentWeek}
              currentWeek={currentWeek}
              onCreatePlan={() => generateMutation.mutate(weekStartDate)}
              isGenerating={generateMutation.isPending}
              navigate={navigate}
            />
          )}
        </div>
      </ScrollArea>

      <BottomNav />
    </div>
  );
}

interface MonthViewProps {
  currentMonth: Date;
  weeks: Date[];
  weeksWithPlans: Set<string>;
  weeksWithLists: Set<string>;
  onSelectWeek: (weekStart: Date) => void;
  onViewList: (weekStartDate: string) => void;
  onCreatePlan: (weekStart: Date) => void;
  isGenerating: boolean;
}

function MonthView({ currentMonth, weeks, weeksWithPlans, weeksWithLists, onSelectWeek, onViewList, onCreatePlan, isGenerating }: MonthViewProps) {
  const today = new Date();
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="py-2 font-medium">{day}</div>
        ))}
      </div>
      
      {weeks.map((weekStart) => {
        const weekDateStr = getWeekStartDate(weekStart);
        const hasPlan = weeksWithPlans.has(weekDateStr);
        const hasList = weeksWithLists.has(weekDateStr);
        const isThisWeek = isSameWeek(weekStart, today, { weekStartsOn: 1 });
        
        return (
          <div 
            key={weekDateStr}
            className={`rounded-lg border ${isThisWeek ? 'border-primary' : 'border-border'} overflow-hidden`}
          >
            <div className="grid grid-cols-7 gap-px bg-muted/30">
              {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
                const day = addDays(weekStart, dayOffset);
                const isToday = isSameDay(day, today);
                const isInMonth = isSameMonth(day, currentMonth);
                
                return (
                  <div
                    key={dayOffset}
                    className={`
                      p-2 text-center min-h-[50px] flex flex-col items-center justify-center
                      ${isInMonth ? 'bg-background' : 'bg-muted/20'}
                      ${isToday ? 'bg-primary/10' : ''}
                    `}
                  >
                    <span className={`
                      text-sm 
                      ${isToday ? 'font-bold text-primary' : ''} 
                      ${!isInMonth ? 'text-muted-foreground/50' : ''}
                    `}>
                      {format(day, "d")}
                    </span>
                    {hasPlan && isInMonth && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />
                    )}
                  </div>
                );
              })}
            </div>
            
            <div 
              className={`
                flex items-center justify-between px-3 py-2 cursor-pointer
                ${hasPlan ? 'bg-primary/5 hover-elevate' : 'bg-muted/10'}
              `}
              onClick={() => hasPlan ? onSelectWeek(weekStart) : null}
              data-testid={`week-row-${weekDateStr}`}
            >
              <span className="text-xs text-muted-foreground">
                Week of {format(weekStart, "MMM d")}
              </span>
              <div className="flex gap-2">
                {hasList && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onViewList(weekDateStr); }}
                    data-testid={`view-list-${weekDateStr}`}
                  >
                    View List
                  </Button>
                )}
                {hasPlan ? (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onSelectWeek(weekStart); }}
                    data-testid={`view-plan-${weekDateStr}`}
                  >
                    View Plan
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onCreatePlan(weekStart); }}
                    disabled={isGenerating}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Create
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface WeekViewProps {
  weekData: WeekData;
  currentWeek: Date;
  navigate: (path: string) => void;
}

function WeekView({ weekData, currentWeek, navigate }: WeekViewProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <UtensilsCrossed className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Meal Plan</h2>
        </div>
        
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 0].map((dayOfWeek, index) => {
            const meal = weekData.mealPlan?.days.find(d => d.dayOfWeek === dayOfWeek);
            const dayDate = addDays(currentWeek, index);
            const dayName = FULL_DAY_NAMES[dayOfWeek];
            const shortDayName = DAY_NAMES_SHORT[dayOfWeek];
            
            return (
              <div
                key={dayOfWeek}
                className={`flex items-center gap-3 p-2 rounded-md ${meal ? 'bg-muted/50 cursor-pointer hover-elevate' : ''}`}
                onClick={() => meal && navigate(`/recipe/${meal.id}`)}
                data-testid={`calendar-day-${dayOfWeek}`}
              >
                <div className="w-12 text-center">
                  <p className="text-xs text-muted-foreground">{shortDayName}</p>
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
  );
}

interface EmptyWeekStateProps {
  isCurrentWeek: boolean;
  currentWeek: Date;
  onCreatePlan: () => void;
  isGenerating: boolean;
  navigate: (path: string) => void;
}

function EmptyWeekState({ isCurrentWeek, currentWeek, onCreatePlan, isGenerating, navigate }: EmptyWeekStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold mb-2">No meals planned</h3>
      <p className="text-muted-foreground text-sm max-w-xs mb-4">
        {isCurrentWeek 
          ? "Create a meal plan for this week to get started."
          : `No meal plan for the week of ${format(currentWeek, "MMM d")}.`}
      </p>
      <Button 
        onClick={onCreatePlan} 
        disabled={isGenerating}
        data-testid="button-create-plan"
      >
        {isGenerating ? "Creating..." : "Create Meal Plan"}
      </Button>
    </div>
  );
}
