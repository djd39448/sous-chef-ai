import { 
  ingredientMemory, type IngredientMemory, type InsertIngredientMemory,
  mealPlans, mealPlanDays, type MealPlan, type MealPlanDay, type InsertMealPlan, type InsertMealPlanDay,
  recipes, type Recipe, type InsertRecipe,
  cookbookRecipes, type CookbookRecipe, type InsertCookbookRecipe,
  shoppingLists, shoppingListItems, type ShoppingList, type ShoppingListItem, type InsertShoppingList, type InsertShoppingListItem,
  kitchenConversations, kitchenMessages, type KitchenConversation, type KitchenMessage, type InsertKitchenConversation, type InsertKitchenMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lte } from "drizzle-orm";

export interface IStorage {
  // Ingredient Memory
  getIngredients(userId: string): Promise<IngredientMemory[]>;
  upsertIngredient(data: InsertIngredientMemory): Promise<IngredientMemory>;
  deleteIngredient(id: number): Promise<void>;
  clearIngredients(userId: string): Promise<void>;

  // Meal Plans
  getMealPlan(userId: string): Promise<(MealPlan & { days: MealPlanDay[] }) | null>;
  getMealPlanDay(id: number): Promise<MealPlanDay | null>;
  getMealPlanDayWithOwner(id: number): Promise<(MealPlanDay & { userId: string }) | null>;
  createMealPlan(data: InsertMealPlan): Promise<MealPlan>;
  addMealPlanDay(data: InsertMealPlanDay): Promise<MealPlanDay>;
  updateMealPlanDay(id: number, data: Partial<InsertMealPlanDay>): Promise<MealPlanDay>;
  deleteMealPlan(userId: string): Promise<void>;

  // Recipes
  getRecipes(userId: string): Promise<Recipe[]>;
  getRecipe(id: number): Promise<Recipe | null>;
  createRecipe(data: InsertRecipe): Promise<Recipe>;
  deleteRecipe(id: number): Promise<void>;

  // Cookbook
  getCookbookRecipes(userId: string): Promise<CookbookRecipe[]>;
  getCookbookRecipe(id: number): Promise<CookbookRecipe | null>;
  addToCookbook(data: InsertCookbookRecipe): Promise<CookbookRecipe>;
  deleteCookbookRecipe(id: number): Promise<void>;

  // Shopping Lists
  getShoppingList(userId: string): Promise<(ShoppingList & { items: ShoppingListItem[] }) | null>;
  createShoppingList(data: InsertShoppingList): Promise<ShoppingList>;
  addShoppingListItem(data: InsertShoppingListItem): Promise<ShoppingListItem>;
  updateShoppingListItem(id: number, data: Partial<InsertShoppingListItem>): Promise<ShoppingListItem>;
  deleteShoppingListItem(id: number): Promise<void>;
  deleteCheckedItems(shoppingListId: number): Promise<void>;
  clearShoppingList(userId: string): Promise<void>;

  // Kitchen Conversations
  getOrCreateConversation(userId: string): Promise<KitchenConversation & { messages: KitchenMessage[] }>;
  addMessage(data: InsertKitchenMessage): Promise<KitchenMessage>;
  getMessages(conversationId: number): Promise<KitchenMessage[]>;
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
    const [plan] = await db.select().from(mealPlans)
      .where(eq(mealPlans.userId, userId))
      .orderBy(desc(mealPlans.createdAt))
      .limit(1);

    if (!plan) return null;

    const days = await db.select().from(mealPlanDays)
      .where(eq(mealPlanDays.mealPlanId, plan.id));

    return { ...plan, days };
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
    // Delete old plans first
    await this.deleteMealPlan(data.userId);
    
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

  async createShoppingList(data: InsertShoppingList): Promise<ShoppingList> {
    await this.clearShoppingList(data.userId);
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
}

export const storage = new DatabaseStorage();
