import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { IngredientMemory, CookbookRecipe } from "@shared/schema";

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SOUS_CHEF_SYSTEM_PROMPT = `You are a friendly, helpful kitchen sous-chef AI assistant. Your job is to help users with dinner decisions, meal planning, recipes, and shopping lists.

Key personality traits:
- Warm and supportive - never judgmental about cooking skills or food choices
- Quick and practical - give helpful suggestions without overexplaining
- Trusting - if the user says they have an ingredient, believe them
- Family-friendly - default to crowd-pleasing meals unless told otherwise
- Time-aware - consider cooking time and suggest faster options when needed

You have access to the user's ingredient memory. When they mention having ingredients, remember them. Use known ingredients to suggest relevant meals.

CANONICAL FOOD OBJECT (CFO) FORMAT (use for all food items):

When calling update_ingredients or create_shopping_list, use this format:
- canonical_name: lowercase, singular, generic (e.g., "milk" not "Whole Milk", "chicken breast" not "Chicken Breasts")
- display_name: human-readable for UI (e.g., "Whole Milk", "Boneless Chicken Breast")
- quantity: object with { amount: number, unit: string } (e.g., { amount: 2, unit: "lb" })
- category: one of produce, dairy, meat, seafood, pantry, frozen, bakery, beverages, other
- status (for ingredients): "confirmed" if user explicitly said they have it, "likely" if inferred, "out" if they're out

RECIPE FORMAT (when generating full recipes):
# Recipe Name
[1-2 sentence appetizing description]

**Prep Time:** X minutes | **Cook Time:** X minutes | **Serves:** X

## Ingredients
- [quantity] [ingredient]

## Instructions
1. [Step]
2. [Step]

## Tips (optional)
- [Tip]

IMPORTANT - WHEN TO USE YOUR TOOLS:

1. UPDATE INGREDIENTS: When user says they have or bought ingredients, ALWAYS call update_ingredients immediately. Normalize ingredient names to lowercase singular form.

2. CREATE MEAL PLAN: You MUST call create_meal_plan when:
   - User asks for a "weekly plan" or "meal plan"
   - User says "make me a plan" or "plan my week"
   - User picks favorites from your suggestions and wants them scheduled
   - User says anything like "use those for my week" or "make a plan with those"
   
   When calling create_meal_plan, use the specific meals the user chose or mentioned, not generic defaults.

3. CREATE SHOPPING LIST: Call create_shopping_list when user asks for a shopping list or to "make a list". Use standard categories and lowercase ingredient names.

When suggesting meals:
- Prioritize ingredients the user has mentioned
- Default to 30-minute or less recipes unless asked otherwise
- Keep instructions clear and simple
- Suggest family-friendly options by default

For meal planning:
- Create balanced, varied weekly plans
- Consider ingredient overlap for efficiency
- Include a mix of quick and slightly more elaborate meals
- ALWAYS call the create_meal_plan function when user wants a plan created

For shopping lists:
- Group items by category (produce, meat, dairy, pantry, etc.)
- Include reasonable quantities
- Don't include ingredients the user already has

Remember: You're here to make dinner decisions FASTER than thinking. Be helpful, not smart. Never argue about what's in their fridge.`;

export const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "update_ingredients",
      description: "Update the user's ingredient inventory when they mention having ingredients. Uses CFO format. Call when the user says things like 'I have chicken' or 'I bought tomatoes'.",
      parameters: {
        type: "object",
        properties: {
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                canonical_name: { type: "string", description: "Lowercase, singular, generic name (e.g., 'milk' not 'Whole Milk')" },
                display_name: { type: "string", description: "Human-readable name for UI (e.g., 'Whole Milk')" },
                quantity: { 
                  type: "object",
                  properties: {
                    amount: { type: "number", description: "Numeric quantity" },
                    unit: { type: "string", description: "Unit (e.g., 'lb', 'gallon', 'each')" }
                  }
                },
                category: { type: "string", enum: ["produce", "dairy", "meat", "seafood", "pantry", "frozen", "bakery", "beverages", "other"] },
                status: { type: "string", enum: ["confirmed", "likely", "out"], description: "Inventory status - 'confirmed' if user explicitly said they have it, 'likely' if inferred, 'out' if user said they're out" },
                action: { type: "string", enum: ["add", "remove"], description: "Whether to add or remove from inventory" }
              },
              required: ["canonical_name", "category", "action"]
            }
          }
        },
        required: ["ingredients"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_meal_plan",
      description: "Create a weekly meal plan for the user. Call this when they ask to plan their week or want dinner ideas for multiple days.",
      parameters: {
        type: "object",
        properties: {
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dayOfWeek: { type: "integer", description: "Day of week (0=Sunday, 1=Monday, etc.)" },
                mealName: { type: "string", description: "Name of the meal" },
                notes: { type: "string", description: "Brief notes about the meal (optional)" }
              },
              required: ["dayOfWeek", "mealName"]
            }
          }
        },
        required: ["meals"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_shopping_list",
      description: "Create a shopping list using CFO format. Items will be derived views of canonical food objects.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                canonical_name: { type: "string", description: "Lowercase, singular, generic name (e.g., 'chicken breast')" },
                display_name: { type: "string", description: "Human-readable name for UI (e.g., 'Boneless Chicken Breast')" },
                quantity: { 
                  type: "object",
                  properties: {
                    amount: { type: "number", description: "Numeric quantity" },
                    unit: { type: "string", description: "Unit (e.g., 'lb', 'each', 'oz')" }
                  }
                },
                category: { type: "string", enum: ["produce", "meat", "dairy", "seafood", "bakery", "frozen", "pantry", "beverages", "other"] },
                substitution_allowed: { type: "boolean", description: "Whether substitutes are acceptable", "default": true },
                generic_ok: { type: "boolean", description: "Whether store brand is acceptable", "default": true }
              },
              required: ["canonical_name", "category"]
            }
          }
        },
        required: ["items"]
      }
    }
  }
];

export function buildMessages(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  ingredients: IngredientMemory[],
  cookbookRecipes?: CookbookRecipe[]
): ChatCompletionMessageParam[] {
  const ingredientContext = ingredients.length > 0
    ? `\n\nUser's current ingredients on hand:\n${ingredients.map(i => `- ${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join('\n')}`
    : '\n\nUser has not mentioned any ingredients yet.';

  let cookbookContext = '';
  if (cookbookRecipes && cookbookRecipes.length > 0) {
    // Include titles and first ~200 chars of content for better RAG context
    const recipeDetails = cookbookRecipes.slice(0, 15).map(r => {
      const contentPreview = r.content.slice(0, 200).replace(/\n/g, ' ').trim();
      return `- ${r.title}: ${contentPreview}...`;
    }).join('\n');
    cookbookContext = `\n\nUser's saved cookbook (prefer these for consistency):\n${recipeDetails}\n\nIMPORTANT: When the user asks for a recipe that matches one in their cookbook, use the EXACT recipe from their cookbook to maintain consistency. Don't create new versions of saved recipes.`;
  }

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SOUS_CHEF_SYSTEM_PROMPT + ingredientContext + cookbookContext
    }
  ];

  // Add recent conversation history (last 10 messages for context)
  const recentHistory = conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content
    });
  }

  // Add current user message
  messages.push({
    role: "user",
    content: userMessage
  });

  return messages;
}

export async function* streamChatCompletion(
  messages: ChatCompletionMessageParam[],
  onToolCall?: (name: string, args: unknown) => Promise<string>
) {
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages,
    tools,
    tool_choice: "auto",
    stream: true,
    max_completion_tokens: 2048,
  });

  let fullContent = "";
  let toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  let currentToolCall: { id: string; name: string; arguments: string } | null = null;

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;

    if (delta?.content) {
      fullContent += delta.content;
      yield { type: "content" as const, content: delta.content };
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.id) {
          if (currentToolCall) {
            toolCalls.push(currentToolCall);
          }
          currentToolCall = { id: tc.id, name: tc.function?.name || "", arguments: "" };
        }
        if (tc.function?.arguments && currentToolCall) {
          currentToolCall.arguments += tc.function.arguments;
        }
      }
    }
  }

  if (currentToolCall) {
    toolCalls.push(currentToolCall);
  }

  // Process tool calls if any
  if (toolCalls.length > 0 && onToolCall) {
    for (const tc of toolCalls) {
      try {
        const args = JSON.parse(tc.arguments);
        const result = await onToolCall(tc.name, args);
        yield { type: "tool_result" as const, name: tc.name, result };
      } catch (e) {
        console.error("Tool call error:", e);
        yield { type: "error" as const, message: "Error processing request" };
      }
    }
  }

  // If no content was generated but tool calls were made, add a confirmation
  if (!fullContent && toolCalls.length > 0) {
    fullContent = "Done! I've updated that for you.";
    yield { type: "content" as const, content: fullContent };
  }

  yield { type: "done" as const, fullContent };
}
