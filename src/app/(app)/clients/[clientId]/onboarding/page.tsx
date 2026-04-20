import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ clientId: string }>;
};

/** Legacy URL — use `/clients/[clientId]/brief`. */
export default async function ClientOnboardingRedirect({ params }: Props) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}/brief`);
}
