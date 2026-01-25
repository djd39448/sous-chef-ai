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
    <div className="flex gap-3 items-center" data-testid="typing-indicator">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <ChefHat className="h-5 w-5 text-primary animate-spin" />
      </div>
      <span className="text-sm text-muted-foreground">Thinking...</span>
    </div>
  );
}
