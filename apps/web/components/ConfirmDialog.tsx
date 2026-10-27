"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * A modal question with Confirm / Cancel (native <dialog>: focus is trapped and Escape cancels).
 * Rendered only while open; the caller unmounts it on either answer.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-full max-w-md rounded-md border border-border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/40"
    >
      <h2 id={titleId} className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      <div className="flex flex-col gap-2 text-sm">{children}</div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
