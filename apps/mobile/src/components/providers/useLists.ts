import type { CategoryView, PayeeView, TagView } from "@ft/core";
import { categoryFromRow, payeeFromRow, tagFromRow } from "@/lib/sync/lists";
import { useSync, useSyncedData } from "./SyncProvider";

/** The signed-in user's categories, payees and tags from the phone's store, re-read on change. */
export function useLists(): { categories: CategoryView[]; payees: PayeeView[]; tags: TagView[] } {
  const { rows } = useSync();
  const categories = useSyncedData(async () => (await rows("category")).map(categoryFromRow), [] as CategoryView[]);
  const payees = useSyncedData(async () => (await rows("payee")).map(payeeFromRow), [] as PayeeView[]);
  const tags = useSyncedData(async () => (await rows("tag")).map(tagFromRow), [] as TagView[]);
  return { categories, payees, tags };
}
