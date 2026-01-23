import { Checkbox } from "@/components/ui/checkbox";
import { Apple, Beef, Milk, Cookie, Snowflake, Package, CupSoda, MoreHorizontal, ShoppingCart } from "lucide-react";

interface ShoppingListItemProps {
  id: number;
  name: string;
  quantity?: string | null;
  checked: boolean;
  onToggle: (id: number, checked: boolean) => void;
}

export function ShoppingListItem({ id, name, quantity, checked, onToggle }: ShoppingListItemProps) {
  return (
    <div
      className="flex items-center gap-3 py-3 px-4 border-b border-border last:border-b-0"
      data-testid={`shopping-item-${id}`}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onToggle(id, c === true)}
        data-testid={`checkbox-item-${id}`}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${checked ? "line-through text-muted-foreground" : ""}`}>
          {name}
        </p>
        {quantity && (
          <p className="text-xs text-muted-foreground">{quantity}</p>
        )}
      </div>
    </div>
  );
}

interface ShoppingCategoryProps {
  category: string;
  items: Array<{
    id: number;
    name: string;
    quantity?: string | null;
    checked: boolean;
  }>;
  onToggle: (id: number, checked: boolean) => void;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  produce: Apple,
  meat: Beef,
  dairy: Milk,
  bakery: Cookie,
  frozen: Snowflake,
  pantry: Package,
  beverages: CupSoda,
  other: MoreHorizontal,
};

export function ShoppingCategory({ category, items, onToggle }: ShoppingCategoryProps) {
  const completedCount = items.filter((i) => i.checked).length;
  const Icon = categoryIcons[category.toLowerCase()] || MoreHorizontal;
  
  return (
    <div className="mb-4" data-testid={`category-${category}`}>
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 sticky top-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold capitalize flex-1">{category}</h3>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{items.length}
        </span>
      </div>
      <div>
        {items.map((item) => (
          <ShoppingListItem
            key={item.id}
            {...item}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

export function EmptyShoppingList() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <ShoppingCart className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Your list is empty</h3>
      <p className="text-muted-foreground text-sm max-w-xs">
        Generate a shopping list from your meal plan, or ask me in the chat!
      </p>
    </div>
  );
}
