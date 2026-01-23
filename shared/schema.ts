import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";
export * from "./models/chat";

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
  weekStartDate: timestamp("week_start_date").notNull(),
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

// ============= SHOPPING LISTS =============
export const shoppingLists = pgTable("shopping_lists", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
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
