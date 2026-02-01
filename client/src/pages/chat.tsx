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
import { cn } from "@/lib/utils";
import { ChefHat, Plus, MessageSquare, PanelLeftClose, PanelLeft } from "lucide-react";
import type { KitchenMessage, KitchenConversation } from "@shared/schema";
import { parseISO, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [pendingMessage, setPendingMessage] = useState("");

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
      setSidebarOpen(false);
    },
  });

  const selectConversation = (convId: number) => {
    setActiveConversationId(convId);
    setSidebarOpen(false);
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
            if (data.error) {
              console.error("Stream error:", data.error);
              setIsStreaming(false);
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
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/shopping-lists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/cookbook"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/meal-plan"] });
      setStreamingContent("");
    },
    onError: (error) => {
      setIsStreaming(false);
      setStreamingContent("");
      console.error("Chat error:", error);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages, streamingContent]);

  const messages = conversation?.messages || [];
  const showWelcome = messages.length === 0 && !isStreaming;

  const groupedConversations = groupConversationsByDate(allConversations || []);

  return (
    <div className="flex h-screen-safe bg-background">
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <aside className={cn(
        "fixed md:relative z-40 h-full w-72 bg-muted/50 border-r border-border flex flex-col transition-transform duration-200",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-3 border-b border-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => newChatMutation.mutate()}
            disabled={newChatMutation.isPending}
            data-testid="button-new-chat"
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2">
            {Object.entries(groupedConversations).map(([group, convs]) => (
              convs.length > 0 && (
                <div key={group} className="mb-4">
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {group}
                  </p>
                  {convs.map((conv) => (
                    <button
                      key={conv.id}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 hover-elevate transition-colors",
                        conv.id === conversation?.id 
                          ? "bg-background border border-border" 
                          : "hover:bg-background/50"
                      )}
                      onClick={() => selectConversation(conv.id)}
                      data-testid={`conversation-${conv.id}`}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{conv.title}</span>
                    </button>
                  ))}
                </div>
              )
            ))}
            {(!allConversations || allConversations.length === 0) && (
              <p className="text-center text-muted-foreground text-sm py-8">
                No conversations yet
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border md:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose className="h-4 w-4" />
            Close sidebar
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-toggle-sidebar"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <ChefHat className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate" data-testid="chat-title">
                {conversation?.title || "New chat"}
              </h1>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden pb-16">
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="max-w-3xl mx-auto px-4 py-6">
              {isLoading ? (
                <ChatSkeleton />
              ) : showWelcome ? (
                <WelcomeMessage onSuggestionClick={setPendingMessage} />
              ) : (
                <div className="space-y-6">
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
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="pb-16">
          <ChatInput
            onSend={(msg) => sendMessageMutation.mutate(msg)}
            disabled={isStreaming}
            placeholder={showWelcome ? "Message Sous Chef..." : "Message..."}
            externalMessage={pendingMessage}
            onExternalMessageClear={() => setPendingMessage("")}
          />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function groupConversationsByDate(conversations: KitchenConversation[]) {
  const groups: Record<string, KitchenConversation[]> = {
    "Today": [],
    "Yesterday": [],
    "This Week": [],
    "This Month": [],
    "Older": [],
  };

  for (const conv of conversations) {
    const date = parseISO(conv.updatedAt as unknown as string);
    if (isToday(date)) {
      groups["Today"].push(conv);
    } else if (isYesterday(date)) {
      groups["Yesterday"].push(conv);
    } else if (isThisWeek(date)) {
      groups["This Week"].push(conv);
    } else if (isThisMonth(date)) {
      groups["This Month"].push(conv);
    } else {
      groups["Older"].push(conv);
    }
  }

  return groups;
}

function WelcomeMessage({ onSuggestionClick }: { onSuggestionClick: (message: string) => void }) {
  const suggestions = [
    "What can I make with what's in my fridge?",
    "Plan my dinners for the week",
    "Something quick and easy tonight",
    "I want to try something new",
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <ChefHat className="h-10 w-10 text-primary" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        I'm your AI kitchen assistant. Tell me what you have, what you're craving, or ask me to plan your meals.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="text-left p-4 rounded-xl bg-card border border-card-border hover-elevate transition-all"
            onClick={() => onSuggestionClick(suggestion)}
            data-testid={`suggestion-${i}`}
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground mb-2" />
            <span className="text-sm">{suggestion}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <Skeleton className="h-20 flex-1 max-w-md rounded-xl" />
      </div>
      <div className="flex gap-3 justify-end">
        <Skeleton className="h-12 w-48 rounded-xl" />
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      </div>
    </div>
  );
}
