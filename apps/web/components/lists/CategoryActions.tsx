"use client";

import type { CategoriesStart, CategoryView, PayeeView } from "@ft/core";
import { Button } from "@/components/ui/button";

/**
 * The actions for one category, shown in its Manage panel (R3 US1; US5 adds hide, merge and delete).
 */
export function CategoryActions({
  onAddChild,
  onEdit,
  onMove,
  onClose,
}: {
  category: CategoryView;
  categories: CategoryView[];
  categoriesStart: CategoriesStart | null;
  payees: PayeeView[];
  onAddChild: () => void;
  onEdit: () => void;
  onMove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" onClick={onAddChild}>
        Add sub-category
      </Button>
      <Button type="button" variant="outline" onClick={onEdit}>
        Edit name, colour or icon
      </Button>
      <Button type="button" variant="outline" onClick={onMove}>
        Move
      </Button>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
