import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, Utensils, Check } from "lucide-react";

interface MealPlanCardProps {
  day: string;
  mealName: string;
  notes?: string | null;
  onClick?: () => void;
  showCheckbox?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  dayId?: number;
}

export function MealPlanCard({ 
  day, 
  mealName, 
  notes, 
  onClick,
  showCheckbox = false,
  checked = false,
  onCheckedChange,
  dayId
}: MealPlanCardProps) {
  return (
    <Card 
      className={`hover-elevate cursor-pointer overflow-hidden transition-all ${checked ? 'ring-2 ring-primary/50 bg-primary/5' : ''}`} 
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3 min-w-0">
          {showCheckbox && (
            <Checkbox 
              checked={checked}
              onCheckedChange={(val) => {
                onCheckedChange?.(val === true);
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid={`checkbox-day-${dayId || day.toLowerCase()}`}
              className="h-5 w-5 shrink-0"
            />
          )}
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 dark:bg-primary/20 text-primary shrink-0">
            <span className="text-sm font-semibold">{day.slice(0, 2)}</span>
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {day}
            </p>
            <p className="font-medium truncate" data-testid={`meal-${day.toLowerCase()}`}>
              {mealName || "No meal planned"}
            </p>
            {notes && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{notes}</p>
            )}
          </div>
          {checked ? (
            <Check className="h-5 w-5 text-primary shrink-0" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyMealPlan({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Utensils className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No meal plan yet</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-xs">
        Let me help you plan your week. Just ask me to create a meal plan in the chat!
      </p>
      <Button onClick={onGenerate} data-testid="button-generate-plan">
        Generate Weekly Plan
      </Button>
    </div>
  );
}
