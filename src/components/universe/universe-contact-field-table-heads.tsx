"use client";

import { TableHead } from "@/components/ui/table";
import {
  UNIVERSE_CONTACT_FIELD_COLUMNS,
  type UniverseContactFieldKey,
} from "@/lib/universe/column-config";

/**
 * Contact-field columns — same twelve labels as the CSV / Sources contract.
 *
 * PR #138: takes an optional `visibleKeys` set so the Universe page can hide
 * individual contact columns via the `cols=` URL parameter. When omitted,
 * all twelve headers render (legacy default — keeps existing callers and
 * tests untouched).
 */
export function UniverseContactFieldTableHeads({
  visibleKeys,
}: {
  visibleKeys?: ReadonlySet<UniverseContactFieldKey>;
}) {
  return (
    <>
      {UNIVERSE_CONTACT_FIELD_COLUMNS.map((col) => {
        if (visibleKeys && !visibleKeys.has(col.key)) return null;
        return <TableHead key={col.key}>{col.label}</TableHead>;
      })}
    </>
  );
}
