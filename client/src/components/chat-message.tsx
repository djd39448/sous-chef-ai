import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChefHat, User } from "lucide-react";
import type { User as AuthUser } from "@shared/models/auth";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  user?: AuthUser | null;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, user, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} items-end`}
      data-testid={`chat-message-${role}`}
    >
      {!isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <ChefHat className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
      
      <div
        className={`max-w-[80%] px-4 py-3 ${
          isUser
            ? "chat-bubble-user"
            : "chat-bubble-assistant"
        }`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse" />
          )}
        </p>
      </div>

      {isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={user?.profileImageUrl || undefined} />
          <AvatarFallback className="bg-secondary">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3 items-end" data-testid="typing-indicator">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground">
          <ChefHat className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="chat-bubble-assistant px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
