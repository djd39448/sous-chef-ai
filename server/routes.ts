import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { storage } from "./storage";
import { openai, buildMessages, streamChatCompletion, tools } from "./openai";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup auth first
  await setupAuth(app);
  registerAuthRoutes(app);

  // =============== KITCHEN CONVERSATION ===============
  app.get("/api/kitchen/conversation", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const conversation = await storage.getOrCreateConversation(userId);
      res.json(conversation);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/kitchen/message", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { content } = req.body;
      if (!content) return res.status(400).json({ error: "Message content required" });

      // Get or create conversation
      const conversation = await storage.getOrCreateConversation(userId);

      // Save user message
      await storage.addMessage({
        conversationId: conversation.id,
        role: "user",
        content,
      });

      // Get user's ingredients
      const ingredients = await storage.getIngredients(userId);

      // Get conversation history
      const messages = await storage.getMessages(conversation.id);
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      // Build messages for OpenAI
      const chatMessages = buildMessages(content, history.slice(0, -1), ingredients);

      // Setup SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";

      // Handle tool calls
      const handleToolCall = async (name: string, args: unknown): Promise<string> => {
        try {
          if (name === "update_ingredients") {
            const { ingredients: updates } = args as { ingredients: Array<{ name: string; quantity?: string; action: string }> };
            for (const update of updates) {
              if (update.action === "add") {
                await storage.upsertIngredient({
                  userId,
                  name: update.name,
                  quantity: update.quantity || null,
                  confidence: 1.0,
                  lastMentioned: new Date(),
                });
              } else if (update.action === "remove") {
                const userIngredients = await storage.getIngredients(userId);
                const toRemove = userIngredients.find(i => i.name.toLowerCase() === update.name.toLowerCase());
                if (toRemove) {
                  await storage.deleteIngredient(toRemove.id);
                }
              }
            }
            return `Updated ${updates.length} ingredients`;
          }

          if (name === "create_meal_plan") {
            const { meals } = args as { meals: Array<{ dayOfWeek: number; mealName: string; notes?: string }> };
            const plan = await storage.createMealPlan({
              userId,
              weekStartDate: getWeekStartDate(),
            });
            for (const meal of meals) {
              await storage.addMealPlanDay({
                mealPlanId: plan.id,
                dayOfWeek: meal.dayOfWeek,
                mealName: meal.mealName,
                notes: meal.notes || null,
              });
            }
            return `Created meal plan with ${meals.length} meals`;
          }

          if (name === "create_shopping_list") {
            const { items } = args as { items: Array<{ name: string; quantity?: string; category: string }> };
            const list = await storage.createShoppingList({
              userId,
              name: "Shopping List",
            });
            for (const item of items) {
              await storage.addShoppingListItem({
                shoppingListId: list.id,
                name: item.name,
                quantity: item.quantity || null,
                category: item.category,
                checked: 0,
              });
            }
            return `Created shopping list with ${items.length} items`;
          }

          return "Unknown function";
        } catch (error) {
          console.error("Tool call error:", error);
          return "Error processing request";
        }
      };

      // Stream response
      for await (const chunk of streamChatCompletion(chatMessages, handleToolCall)) {
        if (chunk.type === "content") {
          fullResponse += chunk.content;
          res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        } else if (chunk.type === "done") {
          // Save assistant message
          if (fullResponse) {
            await storage.addMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: fullResponse,
            });
          }
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error processing message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to process message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process message" });
      }
    }
  });

  // =============== MEAL PLAN ===============
  app.get("/api/kitchen/meal-plan", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const mealPlan = await storage.getMealPlan(userId);
      res.json(mealPlan);
    } catch (error) {
      console.error("Error fetching meal plan:", error);
      res.status(500).json({ error: "Failed to fetch meal plan" });
    }
  });

  app.post("/api/kitchen/generate-meal-plan", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const ingredients = await storage.getIngredients(userId);
      const ingredientList = ingredients.map(i => i.name).join(", ") || "common pantry items";

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: "You are a helpful meal planning assistant. Generate a diverse, family-friendly weekly dinner plan. Use the ingredients provided when possible."
          },
          {
            role: "user",
            content: `Create a weekly dinner plan (Monday through Sunday). Available ingredients: ${ingredientList}. Return ONLY a JSON array with format: [{"dayOfWeek": 1, "mealName": "...", "notes": "..."}] where dayOfWeek is 0=Sunday, 1=Monday, etc.`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content || "{}";
      let meals;
      try {
        const parsed = JSON.parse(content);
        meals = parsed.meals || parsed;
      } catch {
        meals = [];
      }

      if (!Array.isArray(meals) || meals.length === 0) {
        // Default plan
        meals = [
          { dayOfWeek: 1, mealName: "Grilled Chicken with Roasted Vegetables", notes: "30 min" },
          { dayOfWeek: 2, mealName: "Pasta with Marinara Sauce", notes: "20 min" },
          { dayOfWeek: 3, mealName: "Beef Stir-Fry with Rice", notes: "25 min" },
          { dayOfWeek: 4, mealName: "Fish Tacos with Coleslaw", notes: "25 min" },
          { dayOfWeek: 5, mealName: "Homemade Pizza Night", notes: "45 min" },
          { dayOfWeek: 6, mealName: "BBQ Pulled Pork Sandwiches", notes: "Slow cooker" },
          { dayOfWeek: 0, mealName: "Roast Chicken with Mashed Potatoes", notes: "1 hour" },
        ];
      }

      const plan = await storage.createMealPlan({
        userId,
        weekStartDate: getWeekStartDate(),
      });

      for (const meal of meals) {
        await storage.addMealPlanDay({
          mealPlanId: plan.id,
          dayOfWeek: meal.dayOfWeek,
          mealName: meal.mealName,
          notes: meal.notes || null,
        });
      }

      const fullPlan = await storage.getMealPlan(userId);
      res.json(fullPlan);
    } catch (error) {
      console.error("Error generating meal plan:", error);
      res.status(500).json({ error: "Failed to generate meal plan" });
    }
  });

  app.get("/api/kitchen/meal-plan-day/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const dayId = parseInt(req.params.id, 10);
      if (isNaN(dayId)) return res.status(400).json({ error: "Invalid day ID" });

      const day = await storage.getMealPlanDayWithOwner(dayId);
      if (!day) return res.status(404).json({ error: "Day not found" });
      if (day.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      res.json(day);
    } catch (error) {
      console.error("Error fetching meal plan day:", error);
      res.status(500).json({ error: "Failed to fetch meal plan day" });
    }
  });

  app.post("/api/kitchen/recipe-message", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { content, dayId, mealName, dayName } = req.body;
      if (!content || !dayId) return res.status(400).json({ error: "Content and dayId required" });

      const day = await storage.getMealPlanDayWithOwner(dayId);
      if (!day) return res.status(404).json({ error: "Day not found" });
      if (day.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const systemPrompt = `You are a helpful sous chef assistant focused on a specific recipe: ${mealName} for ${dayName}.

Your capabilities:
1. Provide the full recipe with ingredients and step-by-step instructions
2. Answer questions about cooking techniques, substitutions, and tips
3. Replace this meal with a different one if the user asks

When providing a recipe, format it nicely with:
- A brief description
- Prep and cook time
- Ingredients list (with quantities)
- Numbered instructions

If the user wants to swap this meal for something else, call the update_meal function.

Keep responses friendly and practical. Default to family-friendly, 30-minute meals unless asked otherwise.`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content }
      ];

      let fullResponse = "";
      let updatedMeal = null;

      const recipeTools: any[] = [
        {
          type: "function",
          function: {
            name: "update_meal",
            description: "Update this day's meal to a different dish. Call when the user wants to swap or replace the current meal.",
            parameters: {
              type: "object",
              properties: {
                mealName: { type: "string", description: "The new meal name" },
                notes: { type: "string", description: "Brief notes about the meal (cook time, etc.)" }
              },
              required: ["mealName"]
            }
          }
        }
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages,
        tools: recipeTools,
        stream: true,
      });

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          fullResponse += delta.content;
          res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name === "update_meal") {
              try {
                const argsStr = tc.function.arguments || "";
                const args = JSON.parse(argsStr);
                await storage.updateMealPlanDay(dayId, {
                  mealName: args.mealName,
                  notes: args.notes || null,
                });
                updatedMeal = { mealName: args.mealName, notes: args.notes };
              } catch {}
            }
          }
        }
      }

      res.write(`data: ${JSON.stringify({ done: true, updatedMeal })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error processing recipe message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to process message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process message" });
      }
    }
  });

  // =============== SHOPPING LIST ===============
  app.get("/api/kitchen/shopping-list", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const shoppingList = await storage.getShoppingList(userId);
      res.json(shoppingList);
    } catch (error) {
      console.error("Error fetching shopping list:", error);
      res.status(500).json({ error: "Failed to fetch shopping list" });
    }
  });

  app.post("/api/kitchen/generate-shopping-list", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const mealPlan = await storage.getMealPlan(userId);
      const ingredients = await storage.getIngredients(userId);
      
      const mealNames = mealPlan?.days.map(d => d.mealName).join(", ") || "general weekly meals";
      const existingIngredients = ingredients.map(i => i.name).join(", ") || "none";

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: "You are a helpful shopping list assistant. Generate a comprehensive shopping list for the given meals. Group items by category. Don't include items the user already has."
          },
          {
            role: "user",
            content: `Create a shopping list for these meals: ${mealNames}. User already has: ${existingIngredients}. Return ONLY a JSON object with format: {"items": [{"name": "...", "quantity": "...", "category": "produce|meat|dairy|bakery|frozen|pantry|beverages|other"}]}`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content || "{}";
      let items;
      try {
        const parsed = JSON.parse(content);
        items = parsed.items || [];
      } catch {
        items = [];
      }

      if (!Array.isArray(items) || items.length === 0) {
        // Default items
        items = [
          { name: "Chicken breasts", quantity: "2 lbs", category: "meat" },
          { name: "Ground beef", quantity: "1 lb", category: "meat" },
          { name: "Onions", quantity: "3", category: "produce" },
          { name: "Garlic", quantity: "1 head", category: "produce" },
          { name: "Tomatoes", quantity: "4", category: "produce" },
          { name: "Pasta", quantity: "1 box", category: "pantry" },
          { name: "Rice", quantity: "2 lbs", category: "pantry" },
          { name: "Olive oil", quantity: "1 bottle", category: "pantry" },
        ];
      }

      const list = await storage.createShoppingList({
        userId,
        name: "Weekly Shopping",
      });

      for (const item of items) {
        await storage.addShoppingListItem({
          shoppingListId: list.id,
          name: item.name,
          quantity: item.quantity || null,
          category: item.category || "other",
          checked: 0,
        });
      }

      const fullList = await storage.getShoppingList(userId);
      res.json(fullList);
    } catch (error) {
      console.error("Error generating shopping list:", error);
      res.status(500).json({ error: "Failed to generate shopping list" });
    }
  });

  app.patch("/api/kitchen/shopping-item/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { checked } = req.body;

      const item = await storage.updateShoppingListItem(id, { checked: checked ? 1 : 0 });
      res.json(item);
    } catch (error) {
      console.error("Error updating shopping item:", error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  app.delete("/api/kitchen/shopping-items/checked", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const list = await storage.getShoppingList(userId);
      if (list) {
        await storage.deleteCheckedItems(list.id);
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing checked items:", error);
      res.status(500).json({ error: "Failed to clear items" });
    }
  });

  // =============== INGREDIENTS ===============
  app.get("/api/kitchen/ingredients", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const ingredients = await storage.getIngredients(userId);
      res.json(ingredients);
    } catch (error) {
      console.error("Error fetching ingredients:", error);
      res.status(500).json({ error: "Failed to fetch ingredients" });
    }
  });

  return httpServer;
}

function getWeekStartDate(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  return new Date(now.setDate(diff));
}
