import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { ChefHat } from "lucide-react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Chat from "@/pages/chat";
import MealPlan from "@/pages/meal-plan";
import Shopping from "@/pages/shopping";
import Recipe from "@/pages/recipe";
import Cookbook from "@/pages/cookbook";

function AuthenticatedRoutes() {
  return (
    <Switch>
      <Route path="/" component={Chat} />
      <Route path="/plan" component={MealPlan} />
      <Route path="/recipe/:dayId" component={Recipe} />
      <Route path="/cookbook" component={Cookbook} />
      <Route path="/shopping" component={Shopping} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Landing />;
  }

  return <AuthenticatedRoutes />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center animate-pulse">
          <ChefHat className="h-6 w-6 text-primary-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Loading your kitchen...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="sous-chef-theme">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
