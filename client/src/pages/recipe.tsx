import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat-input";
import { ChatMessage, TypingIndicator } from "@/components/chat-message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check } from "lucide-react";
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
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Recipe() {
  const params = useParams<{ dayId: string }>();
  const dayId = parseInt(params.dayId || "0", 10);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<RecipeMessage[]>([]);
  
  useDocumentTitle("Recipe - Sous Chef AI");

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

  useEffect(() => {
    if (day && messages.length === 0) {
      const initialMessage: RecipeMessage = {
        id: Date.now(),
        role: "assistant",
        content: `Here's your recipe for **${day.mealName}**!\n\n${day.recipeContent || "Ask me for the full recipe, cooking tips, or if you'd like to swap this for something else."}`
      };
      setMessages([initialMessage]);
    }
  }, [day, messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const sendMessage = async (content: string) => {
    if (!day) return;
    
    const userMessage: RecipeMessage = {
      id: Date.now(),
      role: "user",
      content,
    };
    setMessages(prev => [...prev, userMessage]);
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
          dayName 
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
                setMessages(prev => [...prev, assistantMessage]);
                setStreamingContent("");
                setIsStreaming(false);
                
                if (updatedMeal) {
                  queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan-day", dayId] });
                  queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan"] });
                  toast({
                    title: "Meal updated!",
                    description: `${dayName}'s dinner is now ${updatedMeal.mealName}`,
                  });
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
          onClick={() => navigate("/plan")}
          data-testid="button-done"
        >
          <Check className="h-5 w-5" />
        </Button>
      </header>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
          {messages.map((msg) => (
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
      </ScrollArea>

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 safe-area-bottom">
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          placeholder="Ask about this recipe or swap it..."
        />
      </div>
    </div>
  );
}
