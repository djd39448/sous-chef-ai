import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat-input";
import { ChatMessage, TypingIndicator } from "@/components/chat-message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, BookPlus, Check, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RecipeMessage {
  id: number;
  role: string;
  content: string;
}

interface MealPlanDay {
  id: number;
  dayOfWeek: number;
  mealName: string;
  notes?: string | null;
  recipeContent?: string | null;
  recipeImagePrompt?: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Recipe() {
  const params = useParams<{ dayId: string }>();
  const dayId = parseInt(params.dayId || "0", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [recipeContent, setRecipeContent] = useState("");
  const [recipeImageUrl, setRecipeImageUrl] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [recipeGenerated, setRecipeGenerated] = useState(false);
  const [savedToCookbook, setSavedToCookbook] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<RecipeMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  
  useDocumentTitle("Recipe - Sous Chef AI");

  const saveToCookbookMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; imagePrompt: string | null }) => {
      const res = await apiRequest("POST", "/api/kitchen/cookbook", data);
      return res.json();
    },
    onSuccess: () => {
      setSavedToCookbook(true);
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/cookbook"] });
      toast({
        title: "Saved to Cookbook",
        description: "This recipe has been added to your cookbook.",
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

  const { data: day, isLoading } = useQuery<MealPlanDay | null>({
    queryKey: ["/api/kitchen/meal-plan-day", dayId],
    queryFn: async () => {
      const res = await fetch(`/api/kitchen/meal-plan-day/${dayId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: dayId > 0,
  });

  const dayName = day ? DAY_NAMES[day.dayOfWeek] : "";

  // Regenerate image from saved prompt
  const regenerateImageFromPrompt = async (prompt: string) => {
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

  // Auto-generate recipe when page loads (but not the image)
  useEffect(() => {
    if (day && !recipeGenerated && !isGeneratingRecipe) {
      if (day.recipeContent) {
        // Already have recipe cached
        setRecipeContent(day.recipeContent);
        setRecipeGenerated(true);
        // Save the image prompt but don't auto-generate
        if (day.recipeImagePrompt) {
          setImagePrompt(day.recipeImagePrompt);
        }
      } else {
        // Generate new recipe (but not image)
        generateRecipe();
      }
    }
  }, [day, recipeGenerated, isGeneratingRecipe]);

  const generateRecipe = async () => {
    if (!day || isGeneratingRecipe) return;
    
    setIsGeneratingRecipe(true);
    setRecipeContent("");
    setRecipeImageUrl(null);
    setIsGeneratingImage(false);

    try {
      const response = await fetch(`/api/kitchen/generate-recipe/${dayId}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to generate recipe");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                setRecipeContent(fullContent);
              }
              if (data.generatingImage) {
                setIsGeneratingImage(true);
              }
              if (data.imageUrl) {
                setRecipeImageUrl(data.imageUrl);
                setIsGeneratingImage(false);
              }
              if (data.imagePrompt) {
                setImagePrompt(data.imagePrompt);
              }
              if (data.done) {
                setRecipeGenerated(true);
                setIsGeneratingRecipe(false);
                setIsGeneratingImage(false);
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      setIsGeneratingRecipe(false);
      setIsGeneratingImage(false);
      toast({
        title: "Couldn't load recipe",
        description: "Please try refreshing.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, streamingContent]);

  const sendMessage = async (content: string) => {
    if (!day) return;
    
    const userMessage: RecipeMessage = {
      id: Date.now(),
      role: "user",
      content,
    };
    setChatMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const response = await fetch("/api/kitchen/recipe-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content, 
          dayId: day.id,
          mealName: day.mealName,
          dayName,
          currentRecipe: recipeContent
        }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullContent = "";
      let updatedMeal = null;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                setStreamingContent(fullContent);
              }
              if (data.updatedMeal) {
                updatedMeal = data.updatedMeal;
              }
              if (data.done) {
                const assistantMessage: RecipeMessage = {
                  id: Date.now() + 1,
                  role: "assistant",
                  content: fullContent,
                };
                setChatMessages(prev => [...prev, assistantMessage]);
                setStreamingContent("");
                setIsStreaming(false);
                
                if (updatedMeal) {
                  // Meal was swapped - need to regenerate recipe
                  queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan-day", dayId] });
                  queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan"] });
                  toast({
                    title: "Meal updated!",
                    description: `${dayName}'s dinner is now ${updatedMeal.mealName}`,
                  });
                  // Reset and regenerate
                  setRecipeContent("");
                  setRecipeGenerated(false);
                  setChatMessages([]);
                }
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      setIsStreaming(false);
      toast({
        title: "Something went wrong",
        description: "Couldn't get a response. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-6 w-32" />
        </header>
        <div className="flex-1 p-4">
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!day) {
    return (
      <div className="flex flex-col h-screen bg-background items-center justify-center">
        <p className="text-muted-foreground mb-4">Recipe not found</p>
        <Button onClick={() => navigate("/plan")}>Back to Plan</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate("/plan")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate" data-testid="recipe-title">{day.mealName}</h1>
          <p className="text-xs text-muted-foreground">{dayName}'s Dinner</p>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => {
            if (!recipeContent || !day) return;
            saveToCookbookMutation.mutate({
              title: day.mealName,
              content: recipeContent,
              imagePrompt: imagePrompt,
            });
          }}
          disabled={!recipeContent || saveToCookbookMutation.isPending || savedToCookbook}
          data-testid="button-save-cookbook"
        >
          {savedToCookbook ? (
            <Check className="h-5 w-5 text-green-600" />
          ) : (
            <BookPlus className="h-5 w-5" />
          )}
        </Button>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => {
            setRecipeContent("");
            setRecipeImageUrl(null);
            setImagePrompt(null);
            setRecipeGenerated(false);
            setChatMessages([]);
            setSavedToCookbook(false);
          }}
          disabled={isGeneratingRecipe}
          data-testid="button-regenerate"
        >
          <RefreshCw className={`h-5 w-5 ${isGeneratingRecipe ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      {/* Scrollable content */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-2xl mx-auto px-4 py-4 pb-32">
          {/* Recipe Image */}
          {(recipeImageUrl || isGeneratingImage || imagePrompt) && (
            <Card className="mb-4 overflow-hidden">
              {isGeneratingImage && !recipeImageUrl ? (
                <div className="aspect-video bg-muted flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                    <span className="text-sm">Creating photo...</span>
                  </div>
                </div>
              ) : recipeImageUrl ? (
                <img 
                  src={recipeImageUrl} 
                  alt={day.mealName}
                  className="w-full aspect-video object-cover"
                  data-testid="recipe-image"
                />
              ) : imagePrompt ? (
                <button
                  onClick={() => regenerateImageFromPrompt(imagePrompt)}
                  className="w-full aspect-video bg-muted flex items-center justify-center hover-elevate cursor-pointer transition-colors"
                  data-testid="button-generate-image"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Camera className="h-8 w-8" />
                    <span className="text-sm font-medium">Tap to generate photo</span>
                  </div>
                </button>
              ) : null}
            </Card>
          )}

          {/* Recipe Display */}
          <Card className="p-4 mb-4">
            {isGeneratingRecipe && !recipeContent && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Generating recipe...</span>
              </div>
            )}
            {recipeContent && (
              <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="recipe-content">
                <RecipeContent content={recipeContent} />
              </div>
            )}
          </Card>

          {/* Chat Messages */}
          {chatMessages.length > 0 && (
            <div className="border-t border-border pt-4 mt-4">
              <p className="text-xs text-muted-foreground mb-3">Questions & Changes</p>
              {chatMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as "user" | "assistant"}
                  content={msg.content}
                />
              ))}
              {isStreaming && streamingContent && (
                <ChatMessage role="assistant" content={streamingContent} />
              )}
              {isStreaming && !streamingContent && <TypingIndicator />}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Chat Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 safe-area-bottom">
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming || isGeneratingRecipe}
          placeholder="Make substitutions or swap this meal..."
        />
      </div>
    </div>
  );
}

function RecipeContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let currentList: { type: 'ol' | 'ul'; items: string[] } | null = null;
  let listKey = 0;
  
  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ol') {
        elements.push(
          <ol key={`list-${listKey++}`} className="list-decimal ml-6 my-2 space-y-1">
            {currentList.items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`list-${listKey++}`} className="list-disc ml-6 my-2 space-y-1">
            {currentList.items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        );
      }
      currentList = null;
    }
  };
  
  lines.forEach((line, i) => {
    if (line.startsWith('# ')) {
      flushList();
      elements.push(<h1 key={i} className="text-xl font-bold mt-0 mb-2">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      if (currentList?.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(line.slice(2));
    } else if (line.match(/^\d+\./)) {
      if (currentList?.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(line.replace(/^\d+\.\s*/, ''));
    } else if (line.startsWith('**') && line.endsWith('**')) {
      flushList();
      elements.push(<p key={i} className="font-semibold my-1">{line.slice(2, -2)}</p>);
    } else if (line.trim() === '') {
      flushList();
      elements.push(<br key={i} />);
    } else {
      flushList();
      elements.push(<p key={i} className="my-1">{line}</p>);
    }
  });
  
  flushList();
  
  return <>{elements}</>;
}
