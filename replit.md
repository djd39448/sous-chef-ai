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
- **Key Tables**: users, sessions, ingredient_memory, meal_plans, meal_plan_days, recipes, shopping_lists, shopping_list_items, kitchen_conversations, kitchen_messages

### AI/Chat System
- **Streaming**: Server-Sent Events for real-time AI responses
- **Tool Calling**: OpenAI function calling for updating ingredients, creating meal plans, and generating shopping lists
- **Conversation Memory**: Per-user conversation history stored in database
- **Ingredient Memory**: Soft inventory inferred from conversations with confidence scores
- **Recipe Chat**: Stateless conversation for individual recipe pages (allows asking questions and swapping meals)

### Recent Changes (Jan 2026)
- Added recipe detail page (/recipe/:dayId) with dedicated chat interface for viewing and editing meals
- **Recipe auto-generation**: Full recipe is automatically generated and displayed when clicking a meal card
- **AI-generated food photography**: Photorealistic image of each dish is generated and displayed at the top of the recipe page
- Recipe content and images are cached in database (recipeContent, recipeImageUrl fields) for instant loading on repeat visits
- Enhanced meal plan flow: clickable meal cards now navigate to recipe detail pages
- Added security checks: meal plan day routes verify user ownership via getMealPlanDayWithOwner
- Fixed SSE streaming parser with buffering to handle chunked network data correctly
- Enhanced OpenAI prompt to proactively create meal plans when users express preferences in chat

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