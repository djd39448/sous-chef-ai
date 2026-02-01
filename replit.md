# Sous Chef AI - Kitchen Assistant

## Overview

Sous Chef AI is a mobile-first web application that serves as an AI-powered kitchen assistant. Users interact with a conversational chat interface to get dinner ideas, plan weekly meals, generate recipes, and create smart shopping lists. The AI maintains ingredient memory from conversations and uses tool calling to create structured meal plans and shopping lists.

The app follows a monorepo structure with a React frontend (Vite), Express backend, and PostgreSQL database using Drizzle ORM.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with HMR support
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query for server state, React hooks for local state
- **UI Components**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with tsx for development, esbuild for production bundling
- **API Pattern**: RESTful endpoints under `/api/` prefix
- **Authentication**: Replit Auth via OpenID Connect with Passport.js
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple
- **AI Integration**: OpenAI API (via Replit AI Integrations) with streaming responses and tool calling

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Migrations**: Drizzle Kit with `db:push` command
- **Key Tables**: users, sessions, ingredient_memory, meal_plans, meal_plan_days, recipes, shopping_lists, shopping_list_items, kitchen_conversations, kitchen_messages, cookbook_recipes

### AI/Chat System
- **Streaming**: Server-Sent Events for real-time AI responses
- **Tool Calling**: OpenAI function calling for updating ingredients, creating meal plans, and generating shopping lists
- **Conversation Memory**: Per-user conversation history stored in database
- **Ingredient Memory**: Soft inventory inferred from conversations with confidence scores
- **Recipe Chat**: Stateless conversation for individual recipe pages (allows asking questions and swapping meals)

### Master Cookbook Feature
- **Cookbook Table**: cookbook_recipes stores saved recipes per user with title, content, and imagePrompt
- **Save to Cookbook**: Recipe pages have a save button (BookmarkPlus icon) that saves the recipe with its image prompt
- **Cookbook Browsing**: /cookbook page displays saved recipes with expand/collapse and on-demand image regeneration
- **Cookbook as RAG Context**: AI chat and meal planning include cookbook recipes (titles + content previews) for consistency
- **Image Optimization**: Stores generation prompts instead of base64 images; regenerates on-demand to save database space

### Canonical Food Object (CFO) System
- **Unified Schema**: All food-related data (ingredients, shopping items, recipe components) stored in `food_items` table
- **Role-Based Storage**: Each food item has a `usageContext.role` (inventory, shopping, planned, ingredient) for proper separation
- **Uniqueness**: Items identified by `canonicalName + role` to prevent overwrites (e.g., "milk" can exist as both inventory and shopping item)
- **JSONB Fields**: quantity (amount/unit object), category, attributes, flexibility, usageContext, inventoryState, sourcing, metadata
- **Categories**: produce, dairy, meat, seafood, pantry, frozen, bakery, beverages, other
- **Inventory States**: confirmed, likely, unknown, out
- **Backward Compatibility**: Legacy ingredient_memory and shopping_list_items tables still updated alongside CFO

### Recent Changes (Jan 2026)
- Added week navigation to Plan tab for viewing/creating plans for any week (past, current, future)
- Added monthly calendar view with week-at-a-glance showing which weeks have meal plans
- Improved AI meal plan generation with better JSON parsing and randomized fallback meals
- Calendar supports creating meal plans directly for any week
- Added master cookbook feature for saving and reusing recipes across sessions
- Image storage migrated from base64 to storing prompts (recipeImagePrompt field)
- Added recipe detail page (/recipe/:dayId) with dedicated chat interface for viewing and editing meals
- **Recipe auto-generation**: Full recipe is automatically generated and displayed when clicking a meal card
- **AI-generated food photography**: Photorealistic image of each dish is generated and displayed at the top of the recipe page
- Recipe content and image prompts cached in database for instant loading on repeat visits
- Enhanced meal plan flow: clickable meal cards now navigate to recipe detail pages
- Added security checks: meal plan day routes verify user ownership via getMealPlanDayWithOwner
- Fixed SSE streaming parser with buffering to handle chunked network data correctly
- Enhanced OpenAI prompt to proactively create meal plans when users express preferences in chat
- **Conversation Management**: Chat now supports multiple conversations with new chat button and history sidebar
- **Conversation Selection**: Clicking a past conversation loads its full message history
- **Improved Meal Variety**: Meal plan generation uses temperature 0.9, randomized cuisine styles, and seasonal focus
- **Week-Specific Plans**: createMealPlanForWeek properly manages individual weeks without affecting other plans
- **Shopping List by Week**: Calendar month view shows "View List" button for weeks with shopping lists
- **On-Demand Cookbook Images**: Cookbook recipe images only generate when user explicitly taps "generate photo"
- **Current Week getMealPlan**: getMealPlan() now returns the current week's plan (not most recent created)
- **Recipe Auto-Save to Cookbook**: Generated recipes are automatically saved to the user's cookbook (avoiding duplicates)
- **Cookbook-First Recipe Loading**: Recipe generation checks cookbook first and uses existing recipes for consistency before creating new ones
- **Editable Cookbook Recipes**: Individual cookbook recipes can be opened and edited via /cookbook/:id route

### Recent Changes (Feb 2026)
- **Chat Auto-Titling**: Conversations are automatically titled from the user's first message instead of generic "Kitchen Chat"
- **Fresh Chat on Login**: Each session starts with a new conversation instead of loading the previous one
- **Calendar Read-Only**: Calendar tab is now drill-down only; plan generation redirects to Plan tab
- **Recipe Thumbnails**: Cookbook recipes now store thumbnailUrl to avoid regenerating images on repeat views
- **Plan Tab Edit Mode**: New "Edit Plan" button with checkboxes for approving individual days
- **Selective Regeneration**: Regenerate only unchecked/unapproved days while keeping approved meals
- **AI Update Meal Tool**: New update_meal tool allows changing specific day meals via chat (e.g., "make beef fajitas for Tuesday")
- **Ingredient Helper**: Cookbook recipe editor now has quick-add ingredient UI with quantity/unit dropdowns and ingredient suggestions from CFO

### Authentication Flow
- Replit Auth handles user authentication via OIDC
- Sessions stored in PostgreSQL with 1-week TTL
- Protected routes use `isAuthenticated` middleware
- User data synced to database on login via upsert

### Build System
- Development: Vite dev server with Express middleware
- Production: Vite builds to `dist/public`, esbuild bundles server to `dist/index.cjs`
- Selected dependencies are bundled to reduce cold start times

## External Dependencies

### Database
- **PostgreSQL**: Primary database accessed via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### AI Services
- **OpenAI API**: Accessed via Replit AI Integrations
  - Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
  - Used for chat completions with streaming and tool calling
  - Supports image generation (gpt-image-1) and audio processing

### Authentication
- **Replit Auth**: OIDC-based authentication
  - Environment variables: `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`
  - Passport.js strategy for session management

### UI Libraries
- **Radix UI**: Headless UI primitives for accessible components
- **shadcn/ui**: Pre-built component library (configured in `components.json`)
- **Lucide React**: Icon library

### Key npm Packages
- `@tanstack/react-query`: Server state management
- `drizzle-orm` / `drizzle-zod`: Database ORM and validation
- `wouter`: Client-side routing
- `tailwindcss`: Utility-first CSS
- `date-fns`: Date manipulation
- `zod`: Schema validation