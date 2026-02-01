import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, BookOpen, Search, X, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface CookbookRecipe {
  id: number;
  title: string;
  content: string;
  imagePrompt: string | null;
  createdAt: string;
}

export default function Cookbook() {
  useDocumentTitle("My Cookbook - Sous Chef AI");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: recipes, isLoading } = useQuery<CookbookRecipe[]>({
    queryKey: ["/api/kitchen/cookbook"],
  });

  const filteredRecipes = recipes?.filter(recipe => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return recipe.title.toLowerCase().includes(query) || 
           recipe.content.toLowerCase().includes(query);
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/kitchen/cookbook/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/cookbook"] });
      toast({
        title: "Recipe deleted",
        description: "The recipe has been removed from your cookbook.",
      });
    },
  });

  return (
    <div className="flex flex-col h-screen-safe bg-background">
      <header className="px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold" data-testid="cookbook-title">My Cookbook</h1>
            <p className="text-xs text-muted-foreground">
              {recipes?.length || 0} saved recipe{recipes?.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {recipes && recipes.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
              data-testid="input-search-cookbook"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </Card>
              ))}
            </div>
          ) : filteredRecipes && filteredRecipes.length > 0 ? (
            <div className="space-y-3">
              {filteredRecipes.map((recipe) => (
                <Card 
                  key={recipe.id} 
                  className="overflow-hidden hover-elevate cursor-pointer"
                  onClick={() => navigate(`/cookbook/${recipe.id}`)}
                  data-testid={`cookbook-recipe-${recipe.id}`}
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{recipe.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          Saved {new Date(recipe.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(recipe.id);
                          }}
                          disabled={deleteMutation.isPending}
                          data-testid={`delete-recipe-${recipe.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : searchQuery && recipes && recipes.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No matching recipes</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Try a different search term or clear the search.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No recipes yet</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Save recipes from your weekly meal plan to build your personal cookbook.
              </p>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
