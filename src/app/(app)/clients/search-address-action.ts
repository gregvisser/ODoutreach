"use server";

import { searchAddresses } from "@/lib/address-lookup/address-lookup";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

export async function searchAddressesAction(query: string) {
  await requireOpensDoorsStaff();
  return searchAddresses(query);
}
