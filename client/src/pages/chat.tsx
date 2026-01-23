import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { BottomNav } from "@/components/bottom-nav";
import { ChatInput } from "@/components/chat-input";
import { ChatMessage, TypingIndicator } from "@/components/chat-message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChefHat, Plus, History, MessageSquare } from "lucide-react";
import type { KitchenMessage, KitchenConversation } from "@shared/schema";
import { format, parseISO } from "date-fns";

interface ConversationWithMessages {
  id: number;
  title: string;
  messages: KitchenMessage[];
}

export default function Chat() {
  useDocumentTitle("Chat - Sous Chef AI");
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  const conversationQueryKey = activeConversationId 
    ? ["/api/kitchen/conversation", activeConversationId]
    : ["/api/kitchen/conversation"];

  const { data: conversation, isLoading } = useQuery<ConversationWithMessages>({
    queryKey: conversationQueryKey,
    queryFn: async () => {
      const url = activeConversationId 
        ? `/api/kitchen/conversation/${activeConversationId}`
        : "/api/kitchen/conversation";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
  });

  useEffect(() => {
    if (conversation && !activeConversationId) {
      setActiveConversationId(conversation.id);
    }
  }, [conversation, activeConversationId]);

  const { data: allConversations } = useQuery<KitchenConversation[]>({
    queryKey: ["/api/kitchen/conversations"],
  });

  const newChatMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/kitchen/conversation/new");
      return res.json();
    },
    onSuccess: (newConversation) => {
      setActiveConversationId(newConversation.id);
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/conversations"] });
      setSheetOpen(false);
    },
  });

  const selectConversation = (convId: number) => {
    setActiveConversationId(convId);
    setSheetOpen(false);
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!conversation) throw new Error("No active conversation");
      
      setIsStreaming(true);
      setStreamingContent("");

      const response = await fetch("/api/kitchen/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, conversationId: conversation.id }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

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
          if (!line.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              fullContent += data.content;
              setStreamingContent(fullContent);
            }
            if (data.done) {
              setIsStreaming(false);
            }
          } catch {
          }
        }
      }

      return fullContent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/conversations"] });
      setStreamingContent("");
    },
    onError: () => {
      setIsStreaming(false);
      setStreamingContent("");
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages, streamingContent]);

  const messages = conversation?.messages || [];
  const showWelcome = messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <ChefHat className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold" data-testid="chat-title">Sous Chef</h1>
          <p className="text-xs text-muted-foreground truncate">
            {conversation?.title || "Your kitchen assistant"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => newChatMutation.mutate()}
          disabled={newChatMutation.isPending}
          data-testid="button-new-chat"
        >
          <Plus className="h-5 w-5" />
        </Button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-history">
              <History className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Past Conversations</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              {allConversations && allConversations.length > 0 ? (
                allConversations.map((conv) => (
                  <button
                    key={conv.id}
                    className={`w-full text-left p-3 rounded-lg cursor-pointer hover-elevate ${
                      conv.id === conversation?.id ? 'bg-primary/10' : 'bg-muted/50'
                    }`}
                    onClick={() => selectConversation(conv.id)}
                    data-testid={`conversation-${conv.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{conv.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(conv.updatedAt as unknown as string), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground text-sm text-center py-8">
                  No past conversations yet
                </p>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="flex-1 overflow-hidden pb-16">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {isLoading ? (
              <ChatSkeleton />
            ) : showWelcome ? (
              <WelcomeMessage />
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    role={message.role as "user" | "assistant"}
                    content={message.content}
                    user={user}
                  />
                ))}
                {isStreaming && streamingContent && (
                  <ChatMessage
                    role="assistant"
                    content={streamingContent}
                    isStreaming
                  />
                )}
                {isStreaming && !streamingContent && <TypingIndicator />}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="pb-16">
        <ChatInput
          onSend={(msg) => sendMessageMutation.mutate(msg)}
          disabled={isStreaming}
          placeholder={showWelcome ? "What's for dinner tonight?" : "Ask me anything..."}
        />
      </div>

      <BottomNav />
    </div>
  );
}

function WelcomeMessage() {
  const suggestions = [
    "I don't know what to cook tonight",
    "I have chicken, rice, and broccoli",
    "Plan my dinners for the week",
    "Give me something quick and easy",
  ];

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <ChefHat className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Hey! I'm your sous chef.</h2>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Tell me what you have, what you're craving, or ask me to plan your week. 
        I'm here to help with dinner decisions.
      </p>
      <div className="space-y-2 w-full max-w-sm">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-3">
          Try saying...
        </p>
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="w-full text-left px-4 py-3 rounded-lg bg-card border border-card-border text-sm hover-elevate transition-colors"
            onClick={() => {
              const input = document.querySelector<HTMLTextAreaElement>('[data-testid="input-chat-message"]');
              if (input) {
                input.value = suggestion;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.focus();
              }
            }}
            data-testid={`suggestion-${i}`}
          >
            "{suggestion}"
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-16 w-64 rounded-2xl rounded-bl-sm" />
      </div>
      <div className="flex gap-3 items-end flex-row-reverse">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-12 w-48 rounded-2xl rounded-br-sm" />
      </div>
    </div>
  );
}
