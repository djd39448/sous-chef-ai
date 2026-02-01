import { 
  ingredientMemory, type IngredientMemory, type InsertIngredientMemory,
  mealPlans, mealPlanDays, type MealPlan, type MealPlanDay, type InsertMealPlan, type InsertMealPlanDay,
  recipes, type Recipe, type InsertRecipe,
  cookbookRecipes, type CookbookRecipe, type InsertCookbookRecipe,
  shoppingLists, shoppingListItems, type ShoppingList, type ShoppingListItem, type InsertShoppingList, type InsertShoppingListItem,
  kitchenConversations, kitchenMessages, type KitchenConversation, type KitchenMessage, type InsertKitchenConversation, type InsertKitchenMessage,
  foodItems, type FoodItem, type InsertFoodItem, type FoodItemRole
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lte, or, ilike } from "drizzle-orm";

export interface IStorage {
  // Ingredient Memory
  getIngredients(userId: string): Promise<IngredientMemory[]>;
  upsertIngredient(data: InsertIngredientMemory): Promise<IngredientMemory>;
  deleteIngredient(id: number): Promise<void>;
  clearIngredients(userId: string): Promise<void>;

  // Meal Plans
  getMealPlan(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  getMealPlanByWeek(userId: string, weekStartDate: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  getAllMealPlans(userId: string): Promise<MealPlan[]>;
  getMealPlanDay(id: number): Promise<MealPlanDay | null>;
  getMealPlanDayWithOwner(id: number): Promise<(MealPlanDay & { userId: string }) | null>;
  createMealPlan(data: InsertMealPlan): Promise<MealPlan>;
  createMealPlanForWeek(data: InsertMealPlan): Promise<MealPlan>;
  addMealPlanDay(data: InsertMealPlanDay): Promise<MealPlanDay>;
  updateMealPlanDay(id: number, data: Partial<InsertMealPlanDay>): Promise<MealPlanDay>;
  deleteMealPlan(userId: string): Promise<void>;
  deleteMealPlanById(id: number): Promise<void>;

  // Recipes
  getRecipes(userId: string): Promise<Recipe[]>;
  getRecipe(id: number): Promise<Recipe | null>;
  createRecipe(data: InsertRecipe): Promise<Recipe>;
  deleteRecipe(id: number): Promise<void>;

  // Cookbook
  getCookbookRecipes(userId: string): Promise<CookbookRecipe[]>;
  getCookbookRecipe(id: number): Promise<CookbookRecipe | null>;
  addToCookbook(data: InsertCookbookRecipe): Promise<CookbookRecipe>;
  updateCookbookRecipe(id: number, data: Partial<{ title: string; content: string; imagePrompt: string | null; thumbnailUrl: string | null }>): Promise<CookbookRecipe | null>;
  deleteCookbookRecipe(id: number): Promise<void>;

  // Shopping Lists
  getShoppingList(userId: string): Promise<(ShoppingList & { items: ShoppingListItem[] }) | null>;
  getShoppingListByWeek(userId: string, weekStartDate: string): Promise<(ShoppingList & { items: ShoppingListItem[] }) | null>;
  getShoppingListById(userId: string, listId: number): Promise<(ShoppingList & { items: ShoppingListItem[] }) | null>;
  getAllShoppingLists(userId: string): Promise<ShoppingList[]>;
  createShoppingList(data: InsertShoppingList): Promise<ShoppingList>;
  addShoppingListItem(data: InsertShoppingListItem): Promise<ShoppingListItem>;
  updateShoppingListItem(id: number, data: Partial<InsertShoppingListItem>): Promise<ShoppingListItem>;
  deleteShoppingListItem(id: number): Promise<void>;
  deleteCheckedItems(shoppingListId: number): Promise<void>;
  clearShoppingList(userId: string): Promise<void>;

  // Kitchen Conversations
  getOrCreateConversation(userId: string): Promise<KitchenConversation & { messages: KitchenMessage[] }>;
  getAllConversations(userId: string): Promise<KitchenConversation[]>;
  createNewConversation(userId: string, title?: string): Promise<KitchenConversation>;
  updateConversationTitle(conversationId: number, title: string): Promise<void>;
  addMessage(data: InsertKitchenMessage): Promise<KitchenMessage>;
  getMessages(conversationId: number): Promise<KitchenMessage[]>;

  // Canonical Food Objects (CFO)
  getFoodItems(userId: string, role?: FoodItemRole): Promise<FoodItem[]>;
  getFoodItemByCanonicalName(userId: string, canonicalName: string): Promise<FoodItem | null>;
  getFoodItemByCanonicalNameAndRole(userId: string, canonicalName: string, role: FoodItemRole): Promise<FoodItem | null>;
  upsertFoodItem(data: InsertFoodItem): Promise<FoodItem>;
  updateFoodItem(id: number, data: Partial<InsertFoodItem>): Promise<FoodItem>;
  deleteFoodItem(id: number): Promise<void>;
  getInventoryItems(userId: string): Promise<FoodItem[]>;
  getShoppingFoodItems(userId: string, shoppingListId?: number): Promise<FoodItem[]>;
}

export class DatabaseStorage implements IStorage {
  // =============== INGREDIENT MEMORY ===============
  async getIngredients(userId: string): Promise<IngredientMemory[]> {
    return db.select().from(ingredientMemory).where(eq(ingredientMemory.userId, userId));
  }

  async upsertIngredient(data: InsertIngredientMemory): Promise<IngredientMemory> {
    const existing = await db.select().from(ingredientMemory)
      .where(and(
        eq(ingredientMemory.userId, data.userId),
        eq(ingredientMemory.name, data.name.toLowerCase())
      ));

    if (existing.length > 0) {
      const [updated] = await db.update(ingredientMemory)
        .set({
          quantity: data.quantity,
          confidence: data.confidence,
          lastMentioned: new Date(),
        })
        .where(eq(ingredientMemory.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(ingredientMemory)
      .values({ ...data, name: data.name.toLowerCase() })
      .returning();
    return created;
  }

  async deleteIngredient(id: number): Promise<void> {
    await db.delete(ingredientMemory).where(eq(ingredientMemory.id, id));
  }

  async clearIngredients(userId: string): Promise<void> {
    await db.delete(ingredientMemory).where(eq(ingredientMemory.userId, userId));
  }

  // =============== MEAL PLANS ===============
  async getMealPlan(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    // Get current week's start date
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(now);
    weekStart.setDate(diff);
    const currentWeekStartDate = weekStart.toISOString().split('T')[0];
    
    // First try to get current week's plan
    const [plan] = await db.select().from(mealPlans)
      .where(and(
        eq(mealPlans.userId, userId),
        eq(mealPlans.weekStartDate, currentWeekStartDate)
      ));

    if (!plan) return null;

    const days = await db.select().from(mealPlanDays)
      .where(eq(mealPlanDays.mealPlanId, plan.id));

    return { ...plan, days };
  }

  async getMealPlanByWeek(userId: string, weekStartDate: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null> {
    const [plan] = await db.select().from(mealPlans)
      .where(and(
        eq(mealPlans.userId, userId),
        eq(mealPlans.weekStartDate, weekStartDate)
      ));

    if (!plan) return null;

    const days = await db.select().from(mealPlanDays)
      .where(eq(mealPlanDays.mealPlanId, plan.id));

    return { ...plan, days };
  }

  async getAllMealPlans(userId: string): Promise<MealPlan[]> {
    return db.select().from(mealPlans)
      .where(eq(mealPlans.userId, userId))
      .orderBy(desc(mealPlans.weekStartDate));
  }

  async getMealPlanDay(id: number): Promise<MealPlanDay | null> {
    const [day] = await db.select().from(mealPlanDays).where(eq(mealPlanDays.id, id));
    return day || null;
  }

  async getMealPlanDayWithOwner(id: number): Promise<(MealPlanDay & { userId: string }) | null> {
    const result = await db
      .select({
        id: mealPlanDays.id,
        mealPlanId: mealPlanDays.mealPlanId,
        dayOfWeek: mealPlanDays.dayOfWeek,
        recipeId: mealPlanDays.recipeId,
        mealName: mealPlanDays.mealName,
        notes: mealPlanDays.notes,
        recipeContent: mealPlanDays.recipeContent,
        recipeImagePrompt: mealPlanDays.recipeImagePrompt,
        userId: mealPlans.userId,
      })
      .from(mealPlanDays)
      .innerJoin(mealPlans, eq(mealPlanDays.mealPlanId, mealPlans.id))
      .where(eq(mealPlanDays.id, id));
    
    return result[0] || null;
  }

  async createMealPlan(data: InsertMealPlan): Promise<MealPlan> {
    // Delete old plans first (for backward compatibility)
    await this.deleteMealPlan(data.userId);
    
    const [plan] = await db.insert(mealPlans).values(data).returning();
    return plan;
  }

  async createMealPlanForWeek(data: InsertMealPlan): Promise<MealPlan> {
    // Delete only the plan for this specific week if it exists
    const existing = await this.getMealPlanByWeek(data.userId, data.weekStartDate);
    if (existing) {
      await this.deleteMealPlanById(existing.id);
    }
    
    const [plan] = await db.insert(mealPlans).values(data).returning();
    return plan;
  }

  async addMealPlanDay(data: InsertMealPlanDay): Promise<MealPlanDay> {
    const [day] = await db.insert(mealPlanDays).values(data).returning();
    return day;
  }

  async updateMealPlanDay(id: number, data: Partial<InsertMealPlanDay>): Promise<MealPlanDay> {
    const [day] = await db.update(mealPlanDays)
      .set(data)
      .where(eq(mealPlanDays.id, id))
      .returning();
    return day;
  }

  async deleteMealPlan(userId: string): Promise<void> {
    const plans = await db.select().from(mealPlans).where(eq(mealPlans.userId, userId));
    for (const plan of plans) {
      await db.delete(mealPlanDays).where(eq(mealPlanDays.mealPlanId, plan.id));
    }
    await db.delete(mealPlans).where(eq(mealPlans.userId, userId));
  }

  async deleteMealPlanById(id: number): Promise<void> {
    await db.delete(mealPlanDays).where(eq(mealPlanDays.mealPlanId, id));
    await db.delete(mealPlans).where(eq(mealPlans.id, id));
  }

  // =============== RECIPES ===============
  async getRecipes(userId: string): Promise<Recipe[]> {
    return db.select().from(recipes).where(eq(recipes.userId, userId));
  }

  async getRecipe(id: number): Promise<Recipe | null> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    return recipe || null;
  }

  async createRecipe(data: InsertRecipe): Promise<Recipe> {
    const [recipe] = await db.insert(recipes).values(data).returning();
    return recipe;
  }

  async deleteRecipe(id: number): Promise<void> {
    await db.delete(recipes).where(eq(recipes.id, id));
  }

  // =============== COOKBOOK ===============
  async getCookbookRecipes(userId: string): Promise<CookbookRecipe[]> {
    return db.select().from(cookbookRecipes)
      .where(eq(cookbookRecipes.userId, userId))
      .orderBy(desc(cookbookRecipes.createdAt));
  }

  async getCookbookRecipe(id: number): Promise<CookbookRecipe | null> {
    const [recipe] = await db.select().from(cookbookRecipes).where(eq(cookbookRecipes.id, id));
    return recipe || null;
  }

  async addToCookbook(data: InsertCookbookRecipe): Promise<CookbookRecipe> {
    const [recipe] = await db.insert(cookbookRecipes).values(data).returning();
    return recipe;
  }

  async updateCookbookRecipe(id: number, data: Partial<{ title: string; content: string; imagePrompt: string | null; thumbnailUrl: string | null }>): Promise<CookbookRecipe | null> {
    const [updated] = await db.update(cookbookRecipes)
      .set(data)
      .where(eq(cookbookRecipes.id, id))
      .returning();
    return updated || null;
  }

  async deleteCookbookRecipe(id: number): Promise<void> {
    await db.delete(cookbookRecipes).where(eq(cookbookRecipes.id, id));
  }

  // =============== SHOPPING LISTS ===============
  async getShoppingList(userId: string): Promise<(ShoppingList & { items: ShoppingListItem[] }) | null> {
    const [list] = await db.select().from(shoppingLists)
      .where(eq(shoppingLists.userId, userId))
      .orderBy(desc(shoppingLists.createdAt))
      .limit(1);

    if (!list) return null;

    const items = await db.select().from(shoppingListItems)
      .where(eq(shoppingListItems.shoppingListId, list.id));

    return { ...list, items };
  }

  async getShoppingListByWeek(userId: string, weekStartDate: string): Promise<(ShoppingList & { items: ShoppingListItem[] }) | null> {
    const [list] = await db.select().from(shoppingLists)
      .where(and(
        eq(shoppingLists.userId, userId),
        eq(shoppingLists.weekStartDate, weekStartDate)
      ));

    if (!list) return null;

    const items = await db.select().from(shoppingListItems)
      .where(eq(shoppingListItems.shoppingListId, list.id));

    return { ...list, items };
  }

  async getShoppingListById(userId: string, listId: number): Promise<(ShoppingList & { items: ShoppingListItem[] }) | null> {
    const [list] = await db.select().from(shoppingLists)
      .where(and(
        eq(shoppingLists.userId, userId),
        eq(shoppingLists.id, listId)
      ));

    if (!list) return null;

    const items = await db.select().from(shoppingListItems)
      .where(eq(shoppingListItems.shoppingListId, list.id));

    return { ...list, items };
  }

  async getAllShoppingLists(userId: string): Promise<ShoppingList[]> {
    return db.select().from(shoppingLists)
      .where(eq(shoppingLists.userId, userId))
      .orderBy(desc(shoppingLists.createdAt));
  }

  async createShoppingList(data: InsertShoppingList): Promise<ShoppingList> {
    // If weekStartDate is provided, delete existing list for that week only
    if (data.weekStartDate) {
      const existingList = await this.getShoppingListByWeek(data.userId, data.weekStartDate);
      if (existingList) {
        await db.delete(shoppingListItems).where(eq(shoppingListItems.shoppingListId, existingList.id));
        await db.delete(shoppingLists).where(eq(shoppingLists.id, existingList.id));
      }
    }
    const [list] = await db.insert(shoppingLists).values(data).returning();
    return list;
  }

  async addShoppingListItem(data: InsertShoppingListItem): Promise<ShoppingListItem> {
    const [item] = await db.insert(shoppingListItems).values(data).returning();
    return item;
  }

  async updateShoppingListItem(id: number, data: Partial<InsertShoppingListItem>): Promise<ShoppingListItem> {
    const [item] = await db.update(shoppingListItems)
      .set(data)
      .where(eq(shoppingListItems.id, id))
      .returning();
    return item;
  }

  async deleteShoppingListItem(id: number): Promise<void> {
    await db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
  }

  async deleteCheckedItems(shoppingListId: number): Promise<void> {
    await db.delete(shoppingListItems)
      .where(and(
        eq(shoppingListItems.shoppingListId, shoppingListId),
        eq(shoppingListItems.checked, 1)
      ));
  }

  async clearShoppingList(userId: string): Promise<void> {
    const lists = await db.select().from(shoppingLists).where(eq(shoppingLists.userId, userId));
    for (const list of lists) {
      await db.delete(shoppingListItems).where(eq(shoppingListItems.shoppingListId, list.id));
    }
    await db.delete(shoppingLists).where(eq(shoppingLists.userId, userId));
  }

  // =============== KITCHEN CONVERSATIONS ===============
  async getOrCreateConversation(userId: string): Promise<KitchenConversation & { messages: KitchenMessage[] }> {
    let [conversation] = await db.select().from(kitchenConversations)
      .where(eq(kitchenConversations.userId, userId))
      .orderBy(desc(kitchenConversations.createdAt))
      .limit(1);

    if (!conversation) {
      [conversation] = await db.insert(kitchenConversations)
        .values({ userId, title: "Kitchen Chat" })
        .returning();
    }

    const messages = await this.getMessages(conversation.id);
    return { ...conversation, messages };
  }

  async addMessage(data: InsertKitchenMessage): Promise<KitchenMessage> {
    const [message] = await db.insert(kitchenMessages).values(data).returning();
    
    // Update conversation timestamp
    await db.update(kitchenConversations)
      .set({ updatedAt: new Date() })
      .where(eq(kitchenConversations.id, data.conversationId));
    
    return message;
  }

  async getMessages(conversationId: number): Promise<KitchenMessage[]> {
    return db.select().from(kitchenMessages)
      .where(eq(kitchenMessages.conversationId, conversationId))
      .orderBy(kitchenMessages.createdAt);
  }

  async getAllConversations(userId: string): Promise<KitchenConversation[]> {
    return db.select().from(kitchenConversations)
      .where(eq(kitchenConversations.userId, userId))
      .orderBy(desc(kitchenConversations.updatedAt));
  }

  async createNewConversation(userId: string, title?: string): Promise<KitchenConversation> {
    const [conversation] = await db.insert(kitchenConversations)
      .values({ userId, title: title || "New Chat" })
      .returning();
    return conversation;
  }

  async updateConversationTitle(conversationId: number, title: string): Promise<void> {
    await db.update(kitchenConversations)
      .set({ title })
      .where(eq(kitchenConversations.id, conversationId));
  }

  async getConversationById(conversationId: number, userId: string): Promise<(KitchenConversation & { messages: KitchenMessage[] }) | null> {
    const [conversation] = await db.select().from(kitchenConversations)
      .where(and(
        eq(kitchenConversations.id, conversationId),
        eq(kitchenConversations.userId, userId)
      ))
      .limit(1);

    if (!conversation) return null;

    const messages = await this.getMessages(conversation.id);
    return { ...conversation, messages };
  }

  // =============== CANONICAL FOOD OBJECTS (CFO) ===============
  async getFoodItems(userId: string, role?: FoodItemRole): Promise<FoodItem[]> {
    if (role) {
      const items = await db.select().from(foodItems)
        .where(eq(foodItems.userId, userId))
        .orderBy(desc(foodItems.updatedAt));
      return items.filter(item => item.usageContext?.role === role);
    }
    return db.select().from(foodItems)
      .where(eq(foodItems.userId, userId))
      .orderBy(desc(foodItems.updatedAt));
  }

  async getFoodItemByCanonicalName(userId: string, canonicalName: string): Promise<FoodItem | null> {
    const [item] = await db.select().from(foodItems)
      .where(and(
        eq(foodItems.userId, userId),
        eq(foodItems.canonicalName, canonicalName.toLowerCase())
      ));
    return item || null;
  }

  async getFoodItemByCanonicalNameAndRole(userId: string, canonicalName: string, role: FoodItemRole): Promise<FoodItem | null> {
    const items = await db.select().from(foodItems)
      .where(and(
        eq(foodItems.userId, userId),
        eq(foodItems.canonicalName, canonicalName.toLowerCase())
      ));
    return items.find(item => item.usageContext?.role === role) || null;
  }

  async upsertFoodItem(data: InsertFoodItem): Promise<FoodItem> {
    const canonicalName = data.canonicalName.toLowerCase();
    const role = data.usageContext?.role;
    
    if (!role) {
      throw new Error("usageContext.role is required for CFO upsert");
    }
    
    // Find existing item with SAME canonical name AND SAME role
    const existing = await this.getFoodItemByCanonicalNameAndRole(data.userId, canonicalName, role);

    if (existing) {
      const [updated] = await db.update(foodItems)
        .set({
          ...data,
          canonicalName,
          updatedAt: new Date(),
        })
        .where(eq(foodItems.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(foodItems)
      .values({ ...data, canonicalName })
      .returning();
    return created;
  }

  async updateFoodItem(id: number, data: Partial<InsertFoodItem>): Promise<FoodItem> {
    const [updated] = await db.update(foodItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(foodItems.id, id))
      .returning();
    return updated;
  }

  async deleteFoodItem(id: number): Promise<void> {
    await db.delete(foodItems).where(eq(foodItems.id, id));
  }

  async getInventoryItems(userId: string): Promise<FoodItem[]> {
    const items = await db.select().from(foodItems)
      .where(eq(foodItems.userId, userId))
      .orderBy(desc(foodItems.updatedAt));
    return items.filter(item => 
      item.usageContext?.role === "inventory" && 
      item.inventoryState?.status !== "out"
    );
  }

  async getShoppingFoodItems(userId: string, shoppingListId?: number): Promise<FoodItem[]> {
    const items = await db.select().from(foodItems)
      .where(eq(foodItems.userId, userId))
      .orderBy(foodItems.canonicalName);
    return items.filter(item => {
      if (item.usageContext?.role !== "shopping") return false;
      if (shoppingListId && item.usageContext?.shopping_list_id !== shoppingListId) return false;
      return true;
    });
  }
}

export const storage = new DatabaseStorage();
