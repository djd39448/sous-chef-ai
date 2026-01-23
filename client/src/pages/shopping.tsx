import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { ShoppingCategory, EmptyShoppingList } from "@/components/shopping-list-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Check, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  items: ShoppingListItem[];
}

export default function Shopping() {
  useDocumentTitle("Shopping List - Sous Chef AI");
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: shoppingList, isLoading } = useQuery<ShoppingList | null>({
    queryKey: ["/api/kitchen/shopping-list"],
  });

  const toggleItemMutation = useMutation({
    mutationFn: async ({ id, checked }: { id: number; checked: boolean }) => {
      return apiRequest("PATCH", `/api/kitchen/shopping-item/${id}`, { checked });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-list"] });
    },
  });

  const clearCheckedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/kitchen/shopping-items/checked");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-list"] });
      toast({
        title: "Checked items cleared",
        description: "Your list has been updated.",
      });
    },
  });

  const items = shoppingList?.items || [];
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

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header user={user} title="Shopping List" />

      <div className="flex-1 overflow-hidden pb-16">
        <ScrollArea className="h-full">
          {isLoading ? (
            <ShoppingSkeleton />
          ) : !shoppingList || items.length === 0 ? (
            <EmptyShoppingList />
          ) : (
            <>
              <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                  <div>
                    <h2 className="font-semibold">{shoppingList.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {checkedItems} of {totalItems} items
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

function ShoppingSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-6 w-32" />
      {[...Array(8)].map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
