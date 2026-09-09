import Link from "next/link";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";
import { loadHeldEmailsForStaff } from "@/server/email/outbound/staff-review";
import { HeldEmailReview } from "@/components/clients/held-email-review";

export const dynamic = "force-dynamic";
export default async function EmailReviewPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ page?: string }> }) {
  const staff = await requireOpensDoorsStaff();
  const { clientId } = await params;
  await requireClientAccess(staff, clientId);
  const rawPage = Number((await searchParams).page ?? 0);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 && rawPage <= 10000 ? rawPage : 0;
  const data = await loadHeldEmailsForStaff(clientId, page);
  const base = `/clients/${clientId}/email-review`;
  return <section className="space-y-6">
    <h1 className="text-2xl font-semibold">Emails waiting for your approval</h1>
    <p>Emails can be held because automatic sending is off, or because another client recently contacted the recipient. Review the email and any recent contact history before choosing to queue it. Approving one email leaves the client’s automatic sending setting unchanged.</p>
    <p>Current mailbox limits, warm-up, sending days and do-not-contact checks still apply. Approval queues the email; it does not prove delivery.</p>
    <a href={`${base}?page=${page}`} className="underline">Refresh review status</a>
    {data.emails.length ? data.emails.map(email => <HeldEmailReview key={`${email.id}:${email.reviewToken}`} clientId={clientId} email={email} />) : <p>No emails waiting on this page.</p>}
    <nav aria-label="Email review pages" className="flex gap-4">
      {page > 0 && <Link prefetch={false} href={`${base}?page=${page - 1}`}>Previous emails</Link>}
      {data.hasNext && <Link prefetch={false} href={`${base}?page=${page + 1}`}>Next emails</Link>}
    </nav>
  </section>;
}
