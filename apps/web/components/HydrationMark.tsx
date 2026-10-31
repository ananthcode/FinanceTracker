"use client";

import { useEffect } from "react";

/**
 * Marks `<html data-hydrated>` once React has taken over the page, so end-to-end tests can wait for
 * the page to be interactive: a field filled or a button clicked before that is lost. No visible effect.
 */
export function HydrationMark() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
