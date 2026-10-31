"use client";

import { useId } from "react";
import { ACCOUNT_COLOUR_KEYS, APPEARANCE_ICON_KEYS } from "@ft/core";
import { AppIcon } from "@/components/AppIcon";

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ");

/** Colour and icon radios for a category (R3 FR-003). Decorative only: the name carries the meaning. */
export function AppearancePicker({
  colour,
  icon,
  onChange,
}: {
  colour: string;
  icon: string;
  onChange: (next: { colour: string; icon: string }) => void;
}) {
  const ids = useId();
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLOUR_KEYS.map((key) => (
            <label key={key} className="relative cursor-pointer">
              <input
                type="radio"
                name={`${ids}-colour`}
                value={key}
                checked={colour === key}
                onChange={() => onChange({ colour: key, icon })}
                aria-label={label(key)}
                className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
              />
              <span className="block rounded-full p-0.5 ring-offset-2 peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-brand">
                <AppIcon icon={icon} colour={key} size="sm" />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Icon</legend>
        <div className="flex flex-wrap gap-2">
          {APPEARANCE_ICON_KEYS.map((key) => (
            <label key={key} className="relative cursor-pointer">
              <input
                type="radio"
                name={`${ids}-icon`}
                value={key}
                checked={icon === key}
                onChange={() => onChange({ colour, icon: key })}
                aria-label={label(key)}
                className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
              />
              <span className="block rounded-full p-0.5 ring-offset-2 peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-brand">
                <AppIcon icon={key} colour={colour} size="sm" />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
