import { Button } from "@/components/ui/button";
import { ChefHat, MessageCircle, Calendar, ShoppingCart, Sparkles } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between h-16 px-6 max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <ChefHat className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">Sous Chef</span>
          </div>
          <Button asChild data-testid="button-login-header">
            <a href="/api/login">Sign In</a>
          </Button>
        </div>
      </header>

      <main className="flex-1 pt-16">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
          <div className="absolute top-20 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 -left-32 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          
          <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-32">
            <div className="max-w-2xl mx-auto text-center lg:text-left lg:mx-0">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <Sparkles className="h-4 w-4" />
                AI-Powered Kitchen Assistant
              </div>
              
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
                Your personal
                <span className="text-primary block">sous chef</span>
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-lg mx-auto lg:mx-0">
                Stop staring at your fridge wondering what to cook. Get instant dinner ideas, 
                weekly meal plans, and smart shopping lists through natural conversation.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="lg" asChild className="text-base" data-testid="button-get-started">
                  <a href="/api/login">Get Started Free</a>
                </Button>
              </div>

              <p className="text-sm text-muted-foreground mt-4">
                No credit card required
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24 border-t border-border">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Faster than thinking
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Just tell it what you have, what you're craving, or ask for help. It handles the rest.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <FeatureCard
                icon={MessageCircle}
                title="Natural Conversation"
                description="Say things like 'I have chicken and rice' or 'Plan my week' and get instant, helpful responses."
              />
              <FeatureCard
                icon={Calendar}
                title="Weekly Meal Plans"
                description="Generate a full week of dinners tailored to your ingredients, time, and family preferences."
              />
              <FeatureCard
                icon={ShoppingCart}
                title="Smart Shopping Lists"
                description="Auto-generate shopping lists grouped by category. Check items off as you shop."
              />
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24 bg-muted/30">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-xl mx-auto text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                Ready to simplify dinner?
              </h2>
              <p className="text-muted-foreground mb-8">
                Join thousands who've stopped stressing about meal decisions. 
                Your AI sous chef is ready to help.
              </p>
              <Button size="lg" asChild data-testid="button-get-started-bottom">
                <a href="/api/login">Start Cooking Smarter</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-primary" />
              <span className="font-semibold">Sous Chef AI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Made with love for busy home cooks
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="group p-6 rounded-xl bg-card border border-card-border hover-elevate transition-all duration-200">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}
