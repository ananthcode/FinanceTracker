"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { planMove, type Keyed } from "@ft/core";
import { changes, useSyncPush } from "@/lib/sync-client";

export interface SortableItem extends Keyed {
  /** Accessible name of the item, e.g. the account name. */
  label: string;
  content: ReactNode;
}

const iconButton =
  "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:opacity-30 dark:hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * A list the user reorders by drag and drop (pointer or keyboard: Space to lift, arrows, Space to
 * drop) or with Move up / Move down buttons (FR-010, research R2-09). A move sends one sortKey
 * update through the sync push (two-device ties are repaired by planMove). The new order shows at
 * once and is replaced by the server's when the refreshed data arrives.
 */
export function SortableList({
  items,
  entity,
  ariaLabel,
}: {
  items: SortableItem[];
  entity: "account" | "account_group";
  ariaLabel?: string;
}) {
  const push = useSyncPush();
  const dndId = useId();
  const serverKey = items.map((i) => `${i.id}:${i.sortKey}`).join("|");
  const [local, setLocal] = useState({ serverKey, list: items });
  // New data from the server replaces the optimistic order (render-time reset, no effect needed).
  if (local.serverKey !== serverKey) setLocal({ serverKey, list: items });
  const list = local.serverKey === serverKey ? local.list : items;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function move(from: number, to: number) {
    const planned = planMove(list, from, to);
    if (planned.length === 0) return;
    const keys = new Map(planned.map((c) => [c.id, c.sortKey]));
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setLocal({ serverKey, list: next.map((i) => ({ ...i, sortKey: keys.get(i.id) ?? i.sortKey })) });
    const update = entity === "account" ? changes.updateAccount : changes.updateGroup;
    const outcome = await push(planned.map((c) => update(c.id, { sortKey: c.sortKey })));
    if (!outcome.ok) setLocal({ serverKey, list: items }); // put it back; the page shows the real order
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    void move(
      list.findIndex((i) => i.id === active.id),
      list.findIndex((i) => i.id === over.id),
    );
  }

  const nameOf = (id: string | number) => list.find((i) => i.id === id)?.label ?? "item";
  const positionOf = (id: string | number) => list.findIndex((i) => i.id === id) + 1;
  // dnd-kit reports "over its own place" the moment a drag starts; that must not replace the
  // "Picked up" announcement, so remember whether the item has moved yet.
  const moved = useRef(false);
  const pickedUp = (id: string | number) => `Picked up ${nameOf(id)}, position ${positionOf(id)} of ${list.length}.`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      moved.current = false;
      return pickedUp(active.id);
    },
    onDragOver: ({ active, over }) => {
      if (!over) return undefined;
      if (over.id === active.id) {
        return moved.current ? `${nameOf(active.id)} is back at position ${positionOf(over.id)}.` : pickedUp(active.id);
      }
      moved.current = true;
      return `${nameOf(active.id)} is over position ${positionOf(over.id)}.`;
    },
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)}.` : `${nameOf(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: "To reorder, press Space, use the arrow keys to move, and press Space again to drop. Escape cancels." },
      }}
    >
      <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={ariaLabel}>
          {list.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              first={index === 0}
              last={index === list.length - 1}
              onUp={() => void move(index, index - 1)}
              onDown={() => void move(index, index + 1)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  item,
  first,
  last,
  onUp,
  onDown,
}: {
  item: SortableItem;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 border-t border-border first:border-t-0 ${isDragging ? "relative z-10 bg-background shadow-md" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.label}`}
        className={`${iconButton} cursor-grab touch-none`}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      {item.content}
      <div className="flex shrink-0 flex-col">
        <button type="button" className={iconButton} disabled={first} onClick={onUp} aria-label={`Move ${item.label} up`}>
          <ArrowUp aria-hidden="true" className="size-4" />
        </button>
        <button type="button" className={iconButton} disabled={last} onClick={onDown} aria-label={`Move ${item.label} down`}>
          <ArrowDown aria-hidden="true" className="size-4" />
        </button>
      </div>
    </li>
  );
}
