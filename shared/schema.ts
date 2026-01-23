import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, real, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";
export * from "./models/chat";

// ============= CANONICAL FOOD OBJECT (CFO) =============
// Single, immutable object schema for all food-related data
// Used consistently across recipes, meal planning, inventory, and shopping lists
// Lists, plans, and exports are VIEWS, not separate data models

/**
 * INGREDIENT FORMAT:
 * - canonical_name: lowercase, singular, generic (e.g., "milk" not "Whole Milk")
 * - display_name: human-readable for UI (e.g., "Whole Milk")
 * - Standard categories: produce, dairy, meat, seafood, pantry, frozen, bakery, beverages, other
 * 
 * RECIPE FORMAT (Markdown):
 * # Recipe Name
 * [1-2 sentence description]
 * 
 * **Prep Time:** X minutes | **Cook Time:** X minutes | **Serves:** X
 * 
 * ## Ingredients
 * - [quantity] [ingredient]
 * 
 * ## Instructions
 * 1. [Step]
 * 2. [Step]
 * 
 * ## Tips (optional)
 * - [Tip]
 */

export const INGREDIENT_CATEGORIES = [
  "produce",
  "dairy", 
  "meat",
  "seafood",
  "pantry",
  "frozen",
  "bakery",
  "beverages",
  "other"
] as const;

export type IngredientCategory = typeof INGREDIENT_CATEGORIES[number];

export const FOOD_ITEM_ROLES = ["ingredient", "planned", "inventory", "shopping"] as const;
export type FoodItemRole = typeof FOOD_ITEM_ROLES[number];

export const INVENTORY_STATUSES = ["confirmed", "likely", "unknown", "out"] as const;
export type InventoryStatus = typeof INVENTORY_STATUSES[number];

// TypeScript interfaces for JSONB fields
export interface FoodQuantity {
  amount: number;
  unit: string;
}

export interface FoodCategory {
  primary: IngredientCategory;
  secondary?: string;
}

export interface FoodAttributes {
  [key: string]: string | boolean | number | null;
}

export interface FoodFlexibility {
  substitution_allowed: boolean;
  acceptable_variants: string[];
  strict: boolean;
}

export interface FoodUsageContext {
  role: FoodItemRole;
  required: boolean;
  recipe_ids: number[];
  meal_plan_id?: number;
  shopping_list_id?: number;
}

export interface FoodInventoryState {
  status: InventoryStatus;
  on_hand_amount: number | null;
  last_confirmed: string | null;
}

export interface FoodSourcing {
  store_affinity: string | null;
  bulk_allowed: boolean;
  generic_ok: boolean;
}

export interface FoodMetadata {
  created_by: "ai" | "user";
  confidence: number;
}

// ============= CANONICAL FOOD ITEMS =============
export const foodItems = pgTable("food_items", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  
  canonicalName: text("canonical_name").notNull(),
  displayName: text("display_name").notNull(),
  
  quantity: jsonb("quantity").$type<FoodQuantity>(),
  category: jsonb("category").$type<FoodCategory>().notNull(),
  attributes: jsonb("attributes").$type<FoodAttributes>().default({}),
  flexibility: jsonb("flexibility").$type<FoodFlexibility>().default({
    substitution_allowed: true,
    acceptable_variants: [],
    strict: false
  }),
  usageContext: jsonb("usage_context").$type<FoodUsageContext>().notNull(),
  inventoryState: jsonb("inventory_state").$type<FoodInventoryState>().default({
    status: "unknown",
    on_hand_amount: null,
    last_confirmed: null
  }),
  sourcing: jsonb("sourcing").$type<FoodSourcing>().default({
    store_affinity: null,
    bulk_allowed: true,
    generic_ok: true
  }),
  metadata: jsonb("metadata").$type<FoodMetadata>().notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFoodItemSchema = createInsertSchema(foodItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FoodItem = typeof foodItems.$inferSelect;
export type InsertFoodItem = z.infer<typeof insertFoodItemSchema>;

// ============= INGREDIENT MEMORY =============
export const ingredientMemory = pgTable("ingredient_memory", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  quantity: text("quantity"),
  confidence: real("confidence").default(1.0).notNull(),
  lastMentioned: timestamp("last_mentioned").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIngredientMemorySchema = createInsertSchema(ingredientMemory).omit({
  id: true,
  createdAt: true,
});

export type IngredientMemory = typeof ingredientMemory.$inferSelect;
export type InsertIngredientMemory = z.infer<typeof insertIngredientMemorySchema>;

// ============= MEAL PLANS =============
export const mealPlans = pgTable("meal_plans", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  weekStartDate: date("week_start_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mealPlanDays = pgTable("meal_plan_days", {
  id: serial("id").primaryKey(),
  mealPlanId: integer("meal_plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  recipeId: integer("recipe_id").references(() => recipes.id),
  mealName: text("meal_name").notNull(),
  notes: text("notes"),
  recipeContent: text("recipe_content"),
  recipeImagePrompt: text("recipe_image_prompt"),
});

export const insertMealPlanSchema = createInsertSchema(mealPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMealPlanDaySchema = createInsertSchema(mealPlanDays).omit({
  id: true,
});

export type MealPlan = typeof mealPlans.$inferSelect;
export type InsertMealPlan = z.infer<typeof insertMealPlanSchema>;
export type MealPlanDay = typeof mealPlanDays.$inferSelect;
export type InsertMealPlanDay = z.infer<typeof insertMealPlanDaySchema>;

// ============= RECIPES =============
export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  ingredients: jsonb("ingredients").$type<string[]>().notNull(),
  instructions: jsonb("instructions").$type<string[]>().notNull(),
  cookTime: integer("cook_time"),
  servings: integer("servings").default(4),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRecipeSchema = createInsertSchema(recipes).omit({
  id: true,
  createdAt: true,
});

export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;

// ============= COOKBOOK (Master Recipe Collection) =============
export const cookbookRecipes = pgTable("cookbook_recipes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  imagePrompt: text("image_prompt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCookbookRecipeSchema = createInsertSchema(cookbookRecipes).omit({
  id: true,
  createdAt: true,
});

export type CookbookRecipe = typeof cookbookRecipes.$inferSelect;
export type InsertCookbookRecipe = z.infer<typeof insertCookbookRecipeSchema>;

// ============= SHOPPING LISTS =============
export const shoppingLists = pgTable("shopping_lists", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  weekStartDate: date("week_start_date"),
  mealPlanId: integer("meal_plan_id").references(() => mealPlans.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: serial("id").primaryKey(),
  shoppingListId: integer("shopping_list_id").notNull().references(() => shoppingLists.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: text("quantity"),
  category: text("category").notNull(),
  checked: integer("checked").default(0).notNull(),
});

export const insertShoppingListSchema = createInsertSchema(shoppingLists).omit({
  id: true,
  createdAt: true,
});

export const insertShoppingListItemSchema = createInsertSchema(shoppingListItems).omit({
  id: true,
});

export type ShoppingList = typeof shoppingLists.$inferSelect;
export type InsertShoppingList = z.infer<typeof insertShoppingListSchema>;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type InsertShoppingListItem = z.infer<typeof insertShoppingListItemSchema>;

// ============= USER CONVERSATIONS (Kitchen-specific) =============
export const kitchenConversations = pgTable("kitchen_conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: text("title").default("New Chat").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kitchenMessages = pgTable("kitchen_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => kitchenConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertKitchenConversationSchema = createInsertSchema(kitchenConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKitchenMessageSchema = createInsertSchema(kitchenMessages).omit({
  id: true,
  createdAt: true,
});

export type KitchenConversation = typeof kitchenConversations.$inferSelect;
export type InsertKitchenConversation = z.infer<typeof insertKitchenConversationSchema>;
export type KitchenMessage = typeof kitchenMessages.$inferSelect;
export type InsertKitchenMessage = z.infer<typeof insertKitchenMessageSchema>;

// ============= RELATIONS =============
export const mealPlansRelations = relations(mealPlans, ({ many }) => ({
  days: many(mealPlanDays),
}));

export const mealPlanDaysRelations = relations(mealPlanDays, ({ one }) => ({
  mealPlan: one(mealPlans, {
    fields: [mealPlanDays.mealPlanId],
    references: [mealPlans.id],
  }),
  recipe: one(recipes, {
    fields: [mealPlanDays.recipeId],
    references: [recipes.id],
  }),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ many }) => ({
  items: many(shoppingListItems),
}));

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  shoppingList: one(shoppingLists, {
    fields: [shoppingListItems.shoppingListId],
    references: [shoppingLists.id],
  }),
}));

export const kitchenConversationsRelations = relations(kitchenConversations, ({ many }) => ({
  messages: many(kitchenMessages),
}));

export const kitchenMessagesRelations = relations(kitchenMessages, ({ one }) => ({
  conversation: one(kitchenConversations, {
    fields: [kitchenMessages.conversationId],
    references: [kitchenConversations.id],
  }),
}));
