import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { ChatInput } from "@/components/chat-input";
import { ChatMessage, TypingIndicator } from "@/components/chat-message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ChefHat } from "lucide-react";
import type { KitchenMessage } from "@shared/schema";

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

  const { data: conversation, isLoading } = useQuery<ConversationWithMessages>({
    queryKey: ["/api/kitchen/conversation"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      setIsStreaming(true);
      setStreamingContent("");

      const response = await fetch("/api/kitchen/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

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
            // Ignore parse errors
          }
        }
      }

      return fullContent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/conversation"] });
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
      <Header user={user} title="Sous Chef" />

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
