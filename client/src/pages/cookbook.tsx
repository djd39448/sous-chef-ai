import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ChefHat, Trash2, RefreshCw, BookOpen } from "lucide-react";
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
  const [expandedRecipe, setExpandedRecipe] = useState<number | null>(null);
  const [loadingImage, setLoadingImage] = useState<number | null>(null);
  const [recipeImages, setRecipeImages] = useState<Record<number, string>>({});

  const { data: recipes, isLoading } = useQuery<CookbookRecipe[]>({
    queryKey: ["/api/kitchen/cookbook"],
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

  const loadImage = async (recipe: CookbookRecipe) => {
    if (!recipe.imagePrompt || recipeImages[recipe.id]) return;
    
    setLoadingImage(recipe.id);
    try {
      const res = await apiRequest("POST", "/api/kitchen/regenerate-image", { 
        prompt: recipe.imagePrompt 
      });
      const data = await res.json();
      if (data.imageUrl) {
        setRecipeImages(prev => ({ ...prev, [recipe.id]: data.imageUrl }));
      }
    } catch (error) {
      console.error("Failed to load image:", error);
    } finally {
      setLoadingImage(null);
    }
  };

  const toggleExpand = (recipe: CookbookRecipe) => {
    if (expandedRecipe === recipe.id) {
      setExpandedRecipe(null);
    } else {
      setExpandedRecipe(recipe.id);
      if (recipe.imagePrompt && !recipeImages[recipe.id]) {
        loadImage(recipe);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="px-4 py-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
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
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </Card>
              ))}
            </div>
          ) : recipes && recipes.length > 0 ? (
            <div className="space-y-4">
              {recipes.map((recipe) => (
                <Card key={recipe.id} className="overflow-hidden">
                  <div 
                    className="p-4 cursor-pointer hover-elevate"
                    onClick={() => toggleExpand(recipe)}
                    data-testid={`cookbook-recipe-${recipe.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{recipe.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          Saved {new Date(recipe.createdAt).toLocaleDateString()}
                        </p>
                      </div>
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
                    </div>
                  </div>
                  
                  {expandedRecipe === recipe.id && (
                    <div className="border-t border-border">
                      {recipe.imagePrompt && (
                        <div className="aspect-video bg-muted relative">
                          {loadingImage === recipe.id ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : recipeImages[recipe.id] ? (
                            <img 
                              src={recipeImages[recipe.id]} 
                              alt={recipe.title}
                              className="w-full h-full object-cover"
                              data-testid={`recipe-image-${recipe.id}`}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                              <ChefHat className="h-12 w-12" />
                            </div>
                          )}
                        </div>
                      )}
                      <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
                        {recipe.content.split('\n').map((line, i) => {
                          if (line.startsWith('# ')) {
                            return <h1 key={i} className="text-xl font-bold mt-0 mb-2">{line.slice(2)}</h1>;
                          }
                          if (line.startsWith('## ')) {
                            return <h2 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(3)}</h2>;
                          }
                          if (line.startsWith('### ')) {
                            return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.slice(4)}</h3>;
                          }
                          if (line.startsWith('- ')) {
                            return <li key={i} className="ml-4">{line.slice(2)}</li>;
                          }
                          if (line.match(/^\d+\./)) {
                            return <li key={i} className="ml-4 list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>;
                          }
                          if (line.startsWith('**') && line.endsWith('**')) {
                            return <p key={i} className="font-semibold my-1">{line.slice(2, -2)}</p>;
                          }
                          if (line.trim() === '') {
                            return <br key={i} />;
                          }
                          return <p key={i} className="my-1">{line}</p>;
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
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
      </ScrollArea>

      <BottomNav />
    </div>
  );
}
