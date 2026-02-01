import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
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
import { Check, Trash2, ArrowLeft, ShoppingCart, Calendar } from "lucide-react";
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

interface ShoppingListSummary {
  id: number;
  name: string;
  weekStartDate: string | null;
  createdAt: string;
}

export default function Shopping() {
  useDocumentTitle("Shopping List - Sous Chef AI");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const listParam = searchParams.get("list");
  
  const [selectedListId, setSelectedListId] = useState<string | null>(listParam);

  const { data: allLists, isLoading: listsLoading } = useQuery<ShoppingListSummary[]>({
    queryKey: ["/api/kitchen/shopping-lists"],
  });

  const { data: selectedList, isLoading: listLoading } = useQuery<ShoppingList | null>({
    queryKey: ["/api/kitchen/shopping-list", selectedListId],
    queryFn: async () => {
      if (!selectedListId) return null;
      const res = await fetch(`/api/kitchen/shopping-list/${selectedListId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedListId,
  });

  const toggleItemMutation = useMutation({
    mutationFn: async ({ id, checked }: { id: number; checked: boolean }) => {
      return apiRequest("PATCH", `/api/kitchen/shopping-item/${id}`, { checked });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-list", selectedListId] });
    },
  });

  const clearCheckedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/kitchen/shopping-items/checked");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-list", selectedListId] });
      toast({
        title: "Checked items cleared",
        description: "Your list has been updated.",
      });
    },
  });

  const handleBack = () => {
    setSelectedListId(null);
    navigate("/shopping");
  };

  const handleSelectList = (list: ShoppingListSummary) => {
    const identifier = list.weekStartDate || String(list.id);
    setSelectedListId(identifier);
    navigate(`/shopping?list=${identifier}`);
  };

  const items = selectedList?.items || [];
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

  const categoryOrder = ["produce", "meat", "dairy", "bakery", "frozen", "pantry", "beverages", "other"];
  const sortedCategories = Object.keys(groupedItems).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  const totalItems = items.length;
  const checkedItems = items.filter((i) => i.checked === 1).length;
  const hasCheckedItems = checkedItems > 0;

  const handleToggle = (id: number, checked: boolean) => {
    toggleItemMutation.mutate({ id, checked });
  };

  if (selectedListId) {
    return (
      <div className="flex flex-col h-screen-safe bg-background">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate" data-testid="list-title">
              {selectedList?.name || "Shopping List"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {selectedList?.weekStartDate 
                ? `Week of ${format(parseISO(selectedList.weekStartDate), "MMM d, yyyy")}`
                : "General shopping"}
            </p>
          </div>
          {hasCheckedItems && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearCheckedMutation.mutate()}
              disabled={clearCheckedMutation.isPending}
              data-testid="button-clear-checked"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Done
            </Button>
          )}
        </header>

        <div className="flex-1 overflow-hidden pb-16">
          <ScrollArea className="h-full">
            {listLoading ? (
              <ShoppingSkeleton />
            ) : !selectedList || items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No items yet</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Generate a shopping list from your meal plan to add items.
                </p>
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
                  <div className="flex items-center justify-between max-w-2xl mx-auto">
                    <p className="text-sm text-muted-foreground">
                      {checkedItems} of {totalItems} items
                    </p>
                  </div>
                </div>

                <div className="max-w-2xl mx-auto">
                  {sortedCategories.map((category) => (
                    <ShoppingCategory
                      key={category}
                      category={category}
                      items={groupedItems[category]}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>

                {checkedItems === totalItems && totalItems > 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mb-4">
                      <Check className="h-8 w-8 text-accent" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">All done!</h3>
                    <p className="text-muted-foreground text-sm">
                      You've checked off everything on your list.
                    </p>
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        </div>

        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen-safe bg-background">
      <Header user={user} title="Shopping List" />

      <div className="flex-1 overflow-hidden pb-16">
        <ScrollArea className="h-full">
          <div className="max-w-2xl mx-auto px-4 py-4">
            {listsLoading ? (
              <ShoppingSkeleton />
            ) : !allLists || allLists.length === 0 ? (
              <EmptyShoppingList />
            ) : (
              <div className="space-y-3">
                <h2 className="font-semibold text-lg mb-4">Weekly Shopping Lists</h2>
                {allLists.map((list) => (
                  <Card
                    key={list.id}
                    className="p-4 cursor-pointer hover-elevate"
                    onClick={() => handleSelectList(list)}
                    data-testid={`shopping-list-${list.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{list.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {list.weekStartDate 
                            ? `Week of ${format(parseISO(list.weekStartDate), "MMM d, yyyy")}`
                            : format(parseISO(list.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <BottomNav />
    </div>
  );
}

function ShoppingSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-6 w-32" />
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
