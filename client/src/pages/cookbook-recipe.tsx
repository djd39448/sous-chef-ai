import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, RefreshCw, Camera, Pencil, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMMON_UNITS = [
  { value: "cup", label: "cup" },
  { value: "tbsp", label: "tbsp" },
  { value: "tsp", label: "tsp" },
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "each", label: "each" },
  { value: "clove", label: "clove" },
  { value: "slice", label: "slice" },
  { value: "can", label: "can" },
  { value: "package", label: "pkg" },
];

const COMMON_QUANTITIES = ["1/4", "1/3", "1/2", "2/3", "3/4", "1", "1.5", "2", "3", "4"];

interface IngredientHelperProps {
  onInsert: (ingredient: string) => void;
}

function IngredientHelper({ onInsert }: IngredientHelperProps) {
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("cup");
  const [ingredientName, setIngredientName] = useState("");
  
  const { data: suggestions } = useQuery<{ canonical_name: string; display_name: string }[]>({
    queryKey: ["/api/kitchen/ingredient-suggestions"],
    staleTime: 5 * 60 * 1000,
  });

  const handleInsert = () => {
    if (!ingredientName.trim()) return;
    const formatted = `${quantity} ${unit} ${ingredientName.trim()}`;
    onInsert(formatted);
    setIngredientName("");
  };

  const quickAdd = (name: string) => {
    const formatted = `${quantity} ${unit} ${name}`;
    onInsert(formatted);
  };

  return (
    <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Quick Add Ingredient</p>
      <div className="flex gap-2 flex-wrap">
        <Select value={quantity} onValueChange={setQuantity}>
          <SelectTrigger className="w-20" data-testid="select-quantity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_QUANTITIES.map(q => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-24" data-testid="select-unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_UNITS.map(u => (
              <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Input 
          value={ingredientName}
          onChange={e => setIngredientName(e.target.value)}
          placeholder="ingredient name"
          className="flex-1 min-w-[120px]"
          onKeyDown={e => e.key === 'Enter' && handleInsert()}
          data-testid="input-ingredient-name"
        />
        
        <Button 
          size="icon" 
          onClick={handleInsert}
          disabled={!ingredientName.trim()}
          data-testid="button-add-ingredient"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      {suggestions && suggestions.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Quick:</span>
          {suggestions.slice(0, 8).map(s => (
            <Button
              key={s.canonical_name}
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => quickAdd(s.display_name || s.canonical_name)}
              data-testid={`quick-ingredient-${s.canonical_name}`}
            >
              {s.display_name || s.canonical_name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

interface CookbookRecipe {
  id: number;
  title: string;
  content: string;
  imagePrompt: string | null;
  thumbnailUrl: string | null;
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
      const res = await apiRequest("POST", "/api/kitchen/regenerate-image", { 
        prompt,
        cookbookRecipeId: recipeId 
      });
      const data = await res.json();
      if (data.imageUrl) {
        setRecipeImageUrl(data.imageUrl);
        // Invalidate the query to update the cached thumbnailUrl
        queryClient.invalidateQueries({ queryKey: ["/api/kitchen/cookbook", recipeId] });
      }
    } catch (error) {
      console.error("Failed to regenerate image:", error);
    } finally {
      setIsGeneratingImage(false);
    }
  };
  
  // Use saved thumbnail if available
  useEffect(() => {
    if (recipe?.thumbnailUrl && !recipeImageUrl) {
      setRecipeImageUrl(recipe.thumbnailUrl);
    }
  }, [recipe?.thumbnailUrl]);

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
              <div className="space-y-3">
                <IngredientHelper 
                  onInsert={(text) => {
                    setEditedContent(prev => {
                      const lines = prev.split('\n');
                      const ingredientsIdx = lines.findIndex(l => l.toLowerCase().includes('## ingredients'));
                      if (ingredientsIdx >= 0) {
                        const nextSectionIdx = lines.findIndex((l, i) => i > ingredientsIdx && l.startsWith('## '));
                        const insertIdx = nextSectionIdx > 0 ? nextSectionIdx : lines.length;
                        lines.splice(insertIdx, 0, `- ${text}`);
                        return lines.join('\n');
                      }
                      return prev + `\n- ${text}`;
                    });
                  }}
                />
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="Recipe content in markdown format..."
                  data-testid="input-recipe-content"
                />
              </div>
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
