"use client";

import { TableHead } from "@/components/ui/table";
import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";

/** Contact-field columns — same twelve labels as the CSV / Sources contract. */
export function UniverseContactFieldTableHeads() {
  return (
    <>
      {STAFF_VISIBLE_CONTACT_IMPORT_HEADERS.map((label) => (
        <TableHead key={label}>{label}</TableHead>
      ))}
    </>
  );
}
