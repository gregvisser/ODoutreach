import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ clientId: string }>;
};

/** Client-scoped contacts: uses the global directory filtered to this workspace. */
export default async function ClientContactsRedirect({ params }: Props) {
  const { clientId } = await params;
  redirect(`/contacts?client=${clientId}`);
}
