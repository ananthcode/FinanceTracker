/**
 * Per-field latest-edit-wins merge (FR-030 as clarified 2026-10-24, research R2-02).
 *
 * Pure: given the HLC that last set each field and an incoming change, decides which of the
 * change's fields win. The database implements the same rule (app.merge_field_versions) and both
 * run the vectors in packages/core/test/vectors/merge.json.
 */
import { clampHlc, compareHlc } from "./hlc";

export interface MergeResult {
  /** Fields the change sets (alphabetical). */
  applied: string[];
  /** Fields that lost to a newer edit (alphabetical). */
  ignored: string[];
  /** Field versions after the merge. */
  fieldVersions: Record<string, string>;
  /** The HLC actually recorded (clamped when the device clock was too far ahead). */
  hlc: string;
  clamped: boolean;
}

export function mergeFields(
  fieldVersions: Readonly<Record<string, string>>,
  change: { fields: readonly string[]; hlc: string },
  receivedAt: number,
): MergeResult {
  const { hlc, clamped } = clampHlc(change.hlc, receivedAt);
  const versions: Record<string, string> = { ...fieldVersions };
  const applied: string[] = [];
  const ignored: string[] = [];
  for (const field of [...new Set(change.fields)].sort()) {
    const previous = fieldVersions[field];
    // A strictly newer HLC wins; an identical one keeps the stored value.
    if (previous === undefined || compareHlc(hlc, previous) > 0) {
      versions[field] = hlc;
      applied.push(field);
    } else {
      ignored.push(field);
    }
  }
  return { applied, ignored, fieldVersions: versions, hlc, clamped };
}
