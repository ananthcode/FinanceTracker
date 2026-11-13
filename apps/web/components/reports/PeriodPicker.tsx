"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import type { PeriodPreset } from "@ft/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

const LABELS: Record<PeriodPreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  this_fy: "This financial year",
  last_12_months: "Last 12 months",
  custom: "Custom dates",
};

/** The report period (R6 FR-005): a preset or custom dates, kept in the URL. Changing it starts the drill-down again. */
export function PeriodPicker({ preset, from, to, presets }: { preset: PeriodPreset; from: string; to: string; presets: PeriodPreset[] }) {
  const ids = useId();
  const router = useRouter();
  const params = useSearchParams();
  const [choice, setChoice] = useState<PeriodPreset>(preset);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  function go(next: PeriodPreset, dates?: { from: string; to: string }) {
    const query = new URLSearchParams();
    query.set("view", params.get("view") ?? "spending");
    query.set("period", next);
    if (next === "custom" && dates) {
      query.set("from", dates.from);
      query.set("to", dates.to);
    }
    router.push(`/reports?${query.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (choice === "custom" && start && end && start <= end) go("custom", { from: start, to: end });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-period`}>Period</Label>
        <select
          id={`${ids}-period`}
          className={selectClass}
          value={choice}
          onChange={(e) => {
            const next = e.target.value as PeriodPreset;
            setChoice(next);
            if (next !== "custom") go(next);
          }}
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      {choice === "custom" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-from`}>From</Label>
            <Input id={`${ids}-from`} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-to`}>To</Label>
            <Input id={`${ids}-to`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button type="submit" variant="outline">
            Show
          </Button>
        </>
      )}
    </form>
  );
}
