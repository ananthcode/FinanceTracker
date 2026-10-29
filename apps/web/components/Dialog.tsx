"use client";

import { useEffect, useId, useRef } from "react";

/**
 * A modal panel (native <dialog>: focus is trapped and Escape closes it unless `required`).
 * Rendered only while open; the caller unmounts it on close.
 */
export function Dialog({
  title,
  description,
  children,
  onClose,
  required = false,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  /** The user must answer: Escape does nothing. */
  required?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!required) onClose();
      }}
      className="m-auto w-full max-w-md rounded-md border border-border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/40"
    >
      <h2 id={titleId} className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      {description && (
        <div id={descriptionId} className="mb-3 text-sm text-muted-foreground">
          {description}
        </div>
      )}
      {children}
    </dialog>
  );
}
