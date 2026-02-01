import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, RefreshCw, Camera, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CookbookRecipe {
  id: number;
  title: string;
  content: string;
  imagePrompt: string | null;
  createdAt: string;
}

export default function CookbookRecipe() {
  const params = useParams<{ id: string }>();
  const recipeId = parseInt(params.id || "0", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [recipeImageUrl, setRecipeImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  useDocumentTitle("Cookbook Recipe - Sous Chef AI");

  const { data: recipe, isLoading } = useQuery<CookbookRecipe | null>({
    queryKey: ["/api/kitchen/cookbook", recipeId],
    queryFn: async () => {
      const res = await fetch(`/api/kitchen/cookbook/${recipeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: recipeId > 0,
  });

  useEffect(() => {
    if (recipe) {
      setEditedTitle(recipe.title);
      setEditedContent(recipe.content);
    }
  }, [recipe]);

  const updateMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      const res = await apiRequest("PUT", `/api/kitchen/cookbook/${recipeId}`, data);
      return res.json();
    },
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/cookbook", recipeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/cookbook"] });
      toast({
        title: "Recipe updated",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Couldn't save",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const regenerateImage = async (prompt: string) => {
    setIsGeneratingImage(true);
    try {
      const res = await apiRequest("POST", "/api/kitchen/regenerate-image", { prompt });
      const data = await res.json();
      if (data.imageUrl) {
        setRecipeImageUrl(data.imageUrl);
      }
    } catch (error) {
      console.error("Failed to regenerate image:", error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSave = () => {
    if (!editedTitle.trim() || !editedContent.trim()) {
      toast({
        title: "Missing content",
        description: "Please enter a title and recipe content.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ title: editedTitle.trim(), content: editedContent.trim() });
  };

  const handleCancelEdit = () => {
    if (recipe) {
      setEditedTitle(recipe.title);
      setEditedContent(recipe.content);
    }
    setIsEditing(false);
  };

  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => {
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
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen-safe bg-background">
        <header className="px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/cookbook")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Skeleton className="h-6 w-48" />
          </div>
        </header>
        <div className="flex-1 p-4">
          <Skeleton className="h-48 w-full mb-4" />
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="flex flex-col h-screen-safe bg-background">
        <header className="px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/cookbook")} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold">Recipe Not Found</h1>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-muted-foreground">This recipe could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen-safe bg-background">
      <header className="px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/cookbook")} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {isEditing ? (
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="font-semibold text-lg h-9"
                placeholder="Recipe title"
                data-testid="input-recipe-title"
              />
            ) : (
              <h1 className="font-semibold truncate" data-testid="text-recipe-title">{recipe.title}</h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="ghost" size="icon" onClick={handleCancelEdit} data-testid="button-cancel-edit">
                  <X className="h-5 w-5" />
                </Button>
                <Button 
                  size="icon" 
                  onClick={handleSave} 
                  disabled={updateMutation.isPending}
                  data-testid="button-save-recipe"
                >
                  {updateMutation.isPending ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <Save className="h-5 w-5" />
                  )}
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} data-testid="button-edit-recipe">
                <Pencil className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          {recipe.imagePrompt && (
            <div className="aspect-video bg-muted relative">
              {isGeneratingImage ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : recipeImageUrl ? (
                <img 
                  src={recipeImageUrl} 
                  alt={recipe.title}
                  className="w-full h-full object-cover"
                  data-testid="recipe-image"
                />
              ) : (
                <button
                  onClick={() => regenerateImage(recipe.imagePrompt!)}
                  className="absolute inset-0 flex items-center justify-center text-muted-foreground hover-elevate cursor-pointer w-full h-full"
                  data-testid="button-generate-image"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="h-8 w-8" />
                    <span className="text-sm font-medium">Tap to generate photo</span>
                  </div>
                </button>
              )}
            </div>
          )}

          <div className="p-4">
            {isEditing ? (
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                placeholder="Recipe content in markdown format..."
                data-testid="input-recipe-content"
              />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="recipe-content">
                {renderContent(recipe.content)}
              </div>
            )}
          </div>

          <div className="px-4 pb-8">
            <p className="text-xs text-muted-foreground" data-testid="text-recipe-date">
              Saved {new Date(recipe.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
