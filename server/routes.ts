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

  app.get("/api/kitchen/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const conversations = await storage.getAllConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.post("/api/kitchen/conversation/new", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const conversation = await storage.createNewConversation(userId, "Kitchen Chat");
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.get("/api/kitchen/conversation/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const conversationId = parseInt(req.params.id as string);
      if (isNaN(conversationId)) return res.status(400).json({ error: "Invalid conversation ID" });

      const conversation = await storage.getConversationById(conversationId, userId);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });

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

      const { content, conversationId } = req.body;
      if (!content) return res.status(400).json({ error: "Message content required" });

      // Get the specified conversation or fallback to default
      let conversation;
      if (conversationId) {
        const specificConv = await storage.getConversationById(conversationId, userId);
        if (!specificConv) return res.status(404).json({ error: "Conversation not found" });
        conversation = specificConv;
      } else {
        conversation = await storage.getOrCreateConversation(userId);
      }

      // Save user message
      await storage.addMessage({
        conversationId: conversation.id,
        role: "user",
        content,
      });

      // Get user's ingredients
      const ingredients = await storage.getIngredients(userId);

      // Get user's cookbook recipes for RAG context
      const cookbookRecipes = await storage.getCookbookRecipes(userId);

      // Get conversation history
      const messages = await storage.getMessages(conversation.id);
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      // Build messages for OpenAI with cookbook context
      const chatMessages = buildMessages(content, history.slice(0, -1), ingredients, cookbookRecipes);

      // Setup SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";

      // Handle tool calls - using CFO format
      const handleToolCall = async (name: string, args: unknown): Promise<string> => {
        try {
          if (name === "update_ingredients") {
            interface CFOIngredientUpdate {
              canonical_name: string;
              display_name?: string;
              quantity?: { amount: number; unit: string };
              category: string;
              status?: string;
              action: string;
            }
            const { ingredients: updates } = args as { ingredients: CFOIngredientUpdate[] };
            
            for (const update of updates) {
              if (update.action === "add") {
                // Create CFO for inventory
                await storage.upsertFoodItem({
                  userId,
                  canonicalName: update.canonical_name.toLowerCase(),
                  displayName: update.display_name || update.canonical_name,
                  quantity: update.quantity || null,
                  category: { primary: update.category as any, secondary: undefined },
                  usageContext: {
                    role: "inventory",
                    required: false,
                    recipe_ids: [],
                  },
                  inventoryState: {
                    status: (update.status || "confirmed") as any,
                    on_hand_amount: update.quantity?.amount || null,
                    last_confirmed: new Date().toISOString(),
                  },
                  metadata: {
                    created_by: "ai",
                    confidence: update.status === "confirmed" ? 1.0 : 0.8,
                  },
                });
                
                // Also update legacy ingredient memory for backward compatibility
                await storage.upsertIngredient({
                  userId,
                  name: update.canonical_name,
                  quantity: update.quantity ? `${update.quantity.amount} ${update.quantity.unit}` : null,
                  confidence: update.status === "confirmed" ? 1.0 : 0.8,
                  lastMentioned: new Date(),
                });
              } else if (update.action === "remove") {
                // Mark as out in CFO - specifically for inventory role
                const existing = await storage.getFoodItemByCanonicalNameAndRole(userId, update.canonical_name, "inventory");
                if (existing) {
                  await storage.updateFoodItem(existing.id, {
                    inventoryState: {
                      status: "out",
                      on_hand_amount: 0,
                      last_confirmed: new Date().toISOString(),
                    },
                  });
                }
                
                // Also remove from legacy ingredient memory
                const userIngredients = await storage.getIngredients(userId);
                const toRemove = userIngredients.find(i => i.name.toLowerCase() === update.canonical_name.toLowerCase());
                if (toRemove) {
                  await storage.deleteIngredient(toRemove.id);
                }
              }
            }
            return `Updated ${updates.length} ingredients`;
          }

          if (name === "create_meal_plan") {
            const { meals } = args as { meals: Array<{ dayOfWeek: number; mealName: string; notes?: string }> };
            const plan = await storage.createMealPlanForWeek({
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
            interface CFOShoppingItem {
              canonical_name: string;
              display_name?: string;
              quantity?: { amount: number; unit: string };
              category: string;
              substitution_allowed?: boolean;
              generic_ok?: boolean;
            }
            const { items } = args as { items: CFOShoppingItem[] };
            
            const weekStartDate = getWeekStartDate();
            const mealPlan = await storage.getMealPlanByWeek(userId, weekStartDate);
            
            const list = await storage.createShoppingList({
              userId,
              name: "Shopping List",
              weekStartDate,
              mealPlanId: mealPlan?.id || null,
            });
            
            for (const item of items) {
              // Create CFO for shopping
              await storage.upsertFoodItem({
                userId,
                canonicalName: item.canonical_name.toLowerCase(),
                displayName: item.display_name || item.canonical_name,
                quantity: item.quantity || null,
                category: { primary: item.category as any, secondary: undefined },
                flexibility: {
                  substitution_allowed: item.substitution_allowed !== false,
                  acceptable_variants: [],
                  strict: false,
                },
                usageContext: {
                  role: "shopping",
                  required: true,
                  recipe_ids: [],
                  shopping_list_id: list.id,
                },
                sourcing: {
                  store_affinity: null,
                  bulk_allowed: true,
                  generic_ok: item.generic_ok !== false,
                },
                metadata: {
                  created_by: "ai",
                  confidence: 0.9,
                },
              });
              
              // Also add to legacy shopping list for backward compatibility
              await storage.addShoppingListItem({
                shoppingListId: list.id,
                name: item.display_name || item.canonical_name,
                quantity: item.quantity ? `${item.quantity.amount} ${item.quantity.unit}` : null,
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

  // Calendar endpoints for viewing history and future plans
  app.get("/api/kitchen/calendar", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const mealPlans = await storage.getAllMealPlans(userId);
      const shoppingLists = await storage.getAllShoppingLists(userId);
      
      res.json({ mealPlans, shoppingLists });
    } catch (error) {
      console.error("Error fetching calendar:", error);
      res.status(500).json({ error: "Failed to fetch calendar" });
    }
  });

  app.get("/api/kitchen/week/:weekStartDate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const weekStartDate = req.params.weekStartDate as string;
      const mealPlan = await storage.getMealPlanByWeek(userId, weekStartDate);
      const shoppingList = await storage.getShoppingListByWeek(userId, weekStartDate);
      
      res.json({ mealPlan, shoppingList });
    } catch (error) {
      console.error("Error fetching week data:", error);
      res.status(500).json({ error: "Failed to fetch week data" });
    }
  });

  app.post("/api/kitchen/generate-meal-plan", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      // Accept weekStartDate from request body for creating future/past week plans
      const targetWeekStartDate = req.body.weekStartDate || getWeekStartDate();

      const ingredients = await storage.getIngredients(userId);
      const ingredientList = ingredients.map(i => i.name).join(", ") || "common pantry items";

      const cookbookRecipes = await storage.getCookbookRecipes(userId);
      const cookbookContext = cookbookRecipes.length > 0 
        ? `User's saved cookbook recipes (prefer these for consistency): ${cookbookRecipes.slice(0, 20).map(r => r.title).join(", ")}.` 
        : "";

      const cuisineStyles = ["Italian", "Mexican", "Asian", "American comfort", "Mediterranean", "Southern", "Tex-Mex", "Greek", "Indian-inspired", "French bistro"];
      const randomCuisine = cuisineStyles[Math.floor(Math.random() * cuisineStyles.length)];
      const seasonalFocus = new Date().getMonth() >= 9 || new Date().getMonth() <= 2 ? "hearty, warming" : "fresh, lighter";
      
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: `You are a creative meal planning assistant. Generate a diverse, family-friendly weekly dinner plan. Be creative and suggest different meals each time! ${cookbookContext}
            
IMPORTANT: You MUST respond with valid JSON containing a "meals" array.`
          },
          {
            role: "user",
            content: `Create a UNIQUE weekly dinner plan (Monday through Sunday). This week, lean toward ${randomCuisine} influences with ${seasonalFocus} dishes. Available ingredients: ${ingredientList}. 

Be creative! Suggest interesting, varied meals - not the same standard options every time. Mix cuisines and try new flavor combinations.

Return JSON in this exact format:
{
  "meals": [
    {"dayOfWeek": 1, "mealName": "Monday meal name", "notes": "cooking time"},
    {"dayOfWeek": 2, "mealName": "Tuesday meal name", "notes": "cooking time"},
    {"dayOfWeek": 3, "mealName": "Wednesday meal name", "notes": "cooking time"},
    {"dayOfWeek": 4, "mealName": "Thursday meal name", "notes": "cooking time"},
    {"dayOfWeek": 5, "mealName": "Friday meal name", "notes": "cooking time"},
    {"dayOfWeek": 6, "mealName": "Saturday meal name", "notes": "cooking time"},
    {"dayOfWeek": 0, "mealName": "Sunday meal name", "notes": "cooking time"}
  ]
}

Where dayOfWeek is: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content || "{}";
      let meals: { dayOfWeek: number; mealName: string; notes?: string }[] = [];
      try {
        const parsed = JSON.parse(content);
        // Handle various possible response formats
        if (Array.isArray(parsed)) {
          meals = parsed;
        } else if (parsed.meals && Array.isArray(parsed.meals)) {
          meals = parsed.meals;
        } else if (parsed.mealPlan && Array.isArray(parsed.mealPlan)) {
          meals = parsed.mealPlan;
        } else if (parsed.plan && Array.isArray(parsed.plan)) {
          meals = parsed.plan;
        }
      } catch (e) {
        console.error("Failed to parse meal plan response:", e, content);
        meals = [];
      }

      // Validate meals have required fields
      meals = meals.filter(m => typeof m.dayOfWeek === 'number' && typeof m.mealName === 'string');

      if (meals.length === 0) {
        // Generate variety with random selection instead of always the same meals
        const mealOptions = [
          ["Grilled Chicken Salad", "Honey Garlic Chicken", "Lemon Herb Roasted Chicken", "Chicken Stir-Fry"],
          ["Spaghetti Carbonara", "Pasta Primavera", "Creamy Mushroom Pasta", "Penne Arrabiata"],
          ["Beef Tacos", "Beef Stir-Fry with Broccoli", "Shepherd's Pie", "Beef and Vegetable Soup"],
          ["Grilled Salmon", "Fish Tacos", "Baked Cod with Lemon", "Shrimp Scampi"],
          ["Homemade Pizza", "Veggie Burgers", "Loaded Nachos", "Quesadillas"],
          ["BBQ Ribs", "Pulled Pork Sandwiches", "Slow Cooker Pot Roast", "Grilled Steak"],
          ["Sunday Roast Chicken", "Lasagna", "Baked Ham", "Roast Beef with Vegetables"],
        ];
        const notes = ["25 min", "30 min", "35 min", "40 min", "45 min", "1 hour", "Slow cooker"];
        meals = [1, 2, 3, 4, 5, 6, 0].map((day, idx) => ({
          dayOfWeek: day,
          mealName: mealOptions[idx][Math.floor(Math.random() * mealOptions[idx].length)],
          notes: notes[idx],
        }));
      }

      const plan = await storage.createMealPlanForWeek({
        userId,
        weekStartDate: targetWeekStartDate,
      });

      for (const meal of meals) {
        await storage.addMealPlanDay({
          mealPlanId: plan.id,
          dayOfWeek: meal.dayOfWeek,
          mealName: meal.mealName,
          notes: meal.notes || null,
        });
      }

      // Return the newly created plan for the target week
      const fullPlan = await storage.getMealPlanByWeek(userId, targetWeekStartDate);
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

      const dayId = parseInt(req.params.id as string, 10);
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

  // Auto-generate full recipe for a meal
  app.post("/api/kitchen/generate-recipe/:dayId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const dayId = parseInt(req.params.dayId as string, 10);
      if (isNaN(dayId)) return res.status(400).json({ error: "Invalid day ID" });

      const day = await storage.getMealPlanDayWithOwner(dayId);
      if (!day) return res.status(404).json({ error: "Day not found" });
      if (day.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = DAY_NAMES[day.dayOfWeek];

      // Check cookbook for existing recipe first
      const cookbookRecipes = await storage.getCookbookRecipes(userId);
      const existingRecipe = cookbookRecipes.find(r => 
        r.title.toLowerCase().trim() === day.mealName.toLowerCase().trim()
      );

      // If recipe exists in cookbook, return it directly without regenerating
      if (existingRecipe && existingRecipe.content) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        
        // Stream the existing recipe
        res.write(`data: ${JSON.stringify({ content: existingRecipe.content })}\n\n`);
        
        // Update the meal plan day with the cookbook recipe
        await storage.updateMealPlanDay(dayId, { 
          recipeContent: existingRecipe.content, 
          recipeImagePrompt: existingRecipe.imagePrompt 
        });
        
        res.write(`data: ${JSON.stringify({ imagePrompt: existingRecipe.imagePrompt, done: true })}\n\n`);
        res.end();
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const systemPrompt = `You are a helpful sous chef. Generate a complete, easy-to-follow recipe for: ${day.mealName}

Use this EXACT format:

# ${day.mealName}
[1-2 sentence appetizing description]

**Prep Time:** X minutes | **Cook Time:** X minutes | **Serves:** X

## Ingredients
- [quantity] [ingredient in lowercase singular form]

## Instructions
1. [Step with specific temperatures and times]
2. [Step]

## Tips
- [Optional helpful tip]

Keep it family-friendly and aim for 30 minutes or less. Use lowercase singular ingredient names (e.g., "chicken breast" not "Chicken Breasts").`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Please give me the full recipe for ${day.mealName}.` }
        ],
        stream: true,
      });

      let fullRecipe = "";

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullRecipe += delta.content;
          res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
        }
      }

      // Save recipe to database with image prompt (but don't generate image yet)
      const imagePrompt = `Professional food photography of ${day.mealName}. Photorealistic, appetizing presentation, warm lighting, shallow depth of field, garnished beautifully, served on a nice plate, restaurant quality presentation.`;
      await storage.updateMealPlanDay(dayId, { recipeContent: fullRecipe, recipeImagePrompt: imagePrompt });

      // Auto-save to cookbook if not already there
      try {
        const existingCookbook = await storage.getCookbookRecipes(userId);
        const alreadySaved = existingCookbook.some(r => 
          r.title.toLowerCase().trim() === day.mealName.toLowerCase().trim()
        );
        if (!alreadySaved) {
          await storage.addToCookbook({
            userId,
            title: day.mealName,
            content: fullRecipe,
            imagePrompt,
          });
        }
      } catch (cookbookError) {
        console.error("Failed to auto-save recipe to cookbook:", cookbookError);
        // Don't fail the whole request if cookbook save fails
      }

      // Send the image prompt so client can generate on demand
      res.write(`data: ${JSON.stringify({ imagePrompt, done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error generating recipe:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to generate recipe" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to generate recipe" });
      }
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

      let toolCallArgs: Record<number, { name: string; args: string }> = {};

      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          fullResponse += delta.content;
          res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (tc.function?.name) {
              toolCallArgs[idx] = { name: tc.function.name, args: "" };
            }
            if (tc.function?.arguments && toolCallArgs[idx]) {
              toolCallArgs[idx].args += tc.function.arguments;
            }
          }
        }
      }

      for (const tc of Object.values(toolCallArgs)) {
        if (tc.name === "update_meal" && tc.args) {
          try {
            const args = JSON.parse(tc.args);
            if (args.mealName) {
              await storage.updateMealPlanDay(dayId, {
                mealName: args.mealName,
                notes: args.notes || null,
                recipeContent: null,
                recipeImagePrompt: null,
              });
              updatedMeal = { mealName: args.mealName, notes: args.notes };
            }
          } catch (e) {
            console.error("Failed to parse tool call:", e);
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

  app.get("/api/kitchen/shopping-lists", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const lists = await storage.getAllShoppingLists(userId);
      res.json(lists);
    } catch (error) {
      console.error("Error fetching shopping lists:", error);
      res.status(500).json({ error: "Failed to fetch shopping lists" });
    }
  });

  app.get("/api/kitchen/shopping-list/:identifier", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const identifier = req.params.identifier as string;
      const listId = parseInt(identifier);
      let shoppingList;
      
      if (!isNaN(listId) && identifier.match(/^\d+$/)) {
        shoppingList = await storage.getShoppingListById(userId, listId);
      } else {
        shoppingList = await storage.getShoppingListByWeek(userId, identifier);
      }
      
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
        weekStartDate: mealPlan?.weekStartDate || null,
        mealPlanId: mealPlan?.id || null,
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
      const id = parseInt(req.params.id as string);
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

  // =============== COOKBOOK ===============
  app.get("/api/kitchen/cookbook", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const recipes = await storage.getCookbookRecipes(userId);
      res.json(recipes);
    } catch (error) {
      console.error("Error fetching cookbook:", error);
      res.status(500).json({ error: "Failed to fetch cookbook" });
    }
  });

  app.get("/api/kitchen/cookbook/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid recipe ID" });

      const recipe = await storage.getCookbookRecipe(id);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      if (recipe.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      res.json(recipe);
    } catch (error) {
      console.error("Error fetching cookbook recipe:", error);
      res.status(500).json({ error: "Failed to fetch recipe" });
    }
  });

  app.post("/api/kitchen/cookbook", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { title, content, imagePrompt } = req.body;
      if (!title || !content) return res.status(400).json({ error: "Title and content required" });

      const recipe = await storage.addToCookbook({
        userId,
        title,
        content,
        imagePrompt: imagePrompt || null,
      });

      res.json(recipe);
    } catch (error) {
      console.error("Error adding to cookbook:", error);
      res.status(500).json({ error: "Failed to add recipe to cookbook" });
    }
  });

  app.delete("/api/kitchen/cookbook/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid recipe ID" });

      const recipe = await storage.getCookbookRecipe(id);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      if (recipe.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      await storage.deleteCookbookRecipe(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting cookbook recipe:", error);
      res.status(500).json({ error: "Failed to delete recipe" });
    }
  });

  // Regenerate image from stored prompt (on-demand)
  app.post("/api/kitchen/regenerate-image", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: "Image prompt required" });

      const imageResponse = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
      });

      const imageBase64 = imageResponse.data?.[0]?.b64_json;
      if (!imageBase64) {
        return res.status(500).json({ error: "Failed to generate image" });
      }

      const imageUrl = `data:image/png;base64,${imageBase64}`;
      res.json({ imageUrl });
    } catch (error) {
      console.error("Error regenerating image:", error);
      res.status(500).json({ error: "Failed to regenerate image" });
    }
  });

  return httpServer;
}

function getWeekStartDate(targetDate?: Date): string {
  const now = targetDate || new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const weekStart = new Date(now);
  weekStart.setDate(diff);
  return weekStart.toISOString().split('T')[0];
}
