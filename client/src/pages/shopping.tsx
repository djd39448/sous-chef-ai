import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { ShoppingCategory, EmptyShoppingList } from "@/components/shopping-list-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Trash2, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface ShoppingListItem {
  id: number;
  name: string;
  quantity?: string | null;
  category: string;
  checked: number;
}

interface ShoppingList {
  id: number;
  name: string;
  weekStartDate: string | null;
  items: ShoppingListItem[];
}

export default function Shopping() {
  useDocumentTitle("Shopping Lists - Sous Chef AI");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([0]));

  const { data: shoppingLists, isLoading } = useQuery<ShoppingList[]>({
    queryKey: ["/api/kitchen/shopping-lists"],
  });

  const toggleItemMutation = useMutation({
    mutationFn: async ({ id, checked }: { id: number; checked: boolean }) => {
      return apiRequest("PATCH", `/api/kitchen/shopping-item/${id}`, { checked });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-lists"] });
    },
  });

  const clearCheckedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/kitchen/shopping-items/checked");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-lists"] });
      toast({
        title: "Checked items cleared",
        description: "Your list has been updated.",
      });
    },
  });

  const toggleWeekExpanded = (index: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleToggle = (id: number, checked: boolean) => {
    toggleItemMutation.mutate({ id, checked });
  };

  const hasAnyLists = shoppingLists && shoppingLists.length > 0;
  const hasAnyItems = shoppingLists?.some(list => list.items.length > 0);

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header user={user} title="Shopping Lists" />

      <div className="flex-1 overflow-hidden pb-16">
        <ScrollArea className="h-full">
          {isLoading ? (
            <ShoppingSkeleton />
          ) : !hasAnyLists || !hasAnyItems ? (
            <EmptyShoppingListState navigate={navigate} />
          ) : (
            <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
              {shoppingLists?.map((list, index) => {
                if (list.items.length === 0) return null;
                
                const isExpanded = expandedWeeks.has(index);
                const checkedCount = list.items.filter(i => i.checked === 1).length;
                const totalCount = list.items.length;
                const weekLabel = list.weekStartDate 
                  ? `Week of ${format(parseISO(list.weekStartDate), "MMM d")}`
                  : list.name || "Shopping List";

                return (
                  <WeekShoppingList
                    key={list.id}
                    list={list}
                    weekLabel={weekLabel}
                    checkedCount={checkedCount}
                    totalCount={totalCount}
                    isExpanded={isExpanded}
                    onToggleExpand={() => toggleWeekExpanded(index)}
                    onToggleItem={handleToggle}
                  />
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      <BottomNav />
    </div>
  );
}

interface WeekShoppingListProps {
  list: ShoppingList;
  weekLabel: string;
  checkedCount: number;
  totalCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleItem: (id: number, checked: boolean) => void;
}

function WeekShoppingList({ 
  list, 
  weekLabel, 
  checkedCount, 
  totalCount, 
  isExpanded, 
  onToggleExpand,
  onToggleItem 
}: WeekShoppingListProps) {
  const items = list.items;
  const groupedItems = items.reduce(
    (acc, item) => {
      const cat = item.category.toLowerCase();
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        checked: item.checked === 1,
      });
      return acc;
    },
    {} as Record<string, Array<{ id: number; name: string; quantity?: string | null; checked: boolean }>>
  );

  const categoryOrder = ["produce", "meat", "seafood", "dairy", "bakery", "frozen", "pantry", "beverages", "other"];
  const sortedCategories = Object.keys(groupedItems).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  const allDone = checkedCount === totalCount;

  return (
    <Card className="overflow-hidden">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover-elevate"
        onClick={onToggleExpand}
        data-testid={`week-list-header-${list.id}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${allDone ? 'bg-primary/20' : 'bg-muted'}`}>
            {allDone ? (
              <Check className="h-5 w-5 text-primary" />
            ) : (
              <Calendar className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <h3 className="font-medium">{weekLabel}</h3>
            <p className="text-sm text-muted-foreground">
              {checkedCount} of {totalCount} items
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon">
          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="border-t border-border">
          {sortedCategories.map((category) => (
            <ShoppingCategory
              key={category}
              category={category}
              items={groupedItems[category]}
              onToggle={onToggleItem}
            />
          ))}

          {allDone && (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">All done!</h4>
              <p className="text-muted-foreground text-sm">
                You've checked everything off this list.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

interface EmptyShoppingListStateProps {
  navigate: (path: string) => void;
}

function EmptyShoppingListState({ navigate }: EmptyShoppingListStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <Calendar className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-2">No shopping lists yet</h3>
      <p className="text-muted-foreground text-sm max-w-xs mb-6">
        Create a meal plan to automatically generate your shopping list with all the ingredients you need.
      </p>
      <Button onClick={() => navigate("/plan")} data-testid="button-go-to-plan">
        Go to Meal Plan
      </Button>
    </div>
  );
}

function ShoppingSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}
