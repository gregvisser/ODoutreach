import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReplyOwnershipBadge } from "@/components/activity/reply-ownership-badge";
import { areAiFeaturesEnabled } from "@/lib/ai/ai-switch";
import {
  UNCLASSIFIED_BADGE,
  replyClassificationBadge,
} from "@/lib/ai/reply-classification-display";
import {
  replyOwnershipLabel,
  resolveReplyOwnershipState,
} from "@/lib/inbox/reply-ownership";
import { cn } from "@/lib/utils";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  getRepliesNeedingAPerson,
  type TriagedReplyWithClaim,
} from "@/server/queries/replies-needing-a-person";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

/**
 * Every reply still waiting on a human, across every client, on one page.
 *
 * Why this page exists: labelling a reply is not routing it. Classification
 * shipped in cycle 85 and put a coloured badge inside each client's Activity
 * tab — so finding the person who said "yes, happy to talk" meant opening
 * thirty-odd workspaces in turn and scanning each one. That is the same shape
 * as the weekly Google reconnect chore before `/google-reconnects` existed,
 * and it fails the same way: the job gets half done, and the half nobody
 * reached is a lost deal.
 *
 * Open to all staff, deliberately, and listed in the sidebar for the same
 * reason `/google-reconnects` is: a queue nobody can find is a queue nobody
 * works.
 *
 * Nothing on this page mutates anything. It is a list and a set of links to
 * the reply-detail page where the buttons already live.
 */
export default async function RepliesNeedingAPersonPage() {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const queue = await getRepliesNeedingAPerson(accessible, staff.id);

  // When classification cannot run, every reply arrives here unlabelled and is
  // routed to a person anyway — which is correct, but a screen full of "Not
  // checked yet" looks broken unless it says why. Silence about a feature that
  // is off is exactly the failure this project keeps shipping.
  const aiOff = !areAiFeaturesEnabled();
  const unclassifiedCount = queue.entries.filter(
    (e) => e.classification === null,
  ).length;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Replies waiting for a person
        </h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Everyone who has written back and not yet had an answer, across every
          client workspace. People asking to talk come first, then the longest
          wait. Replies somebody has answered, marked handled, or added to
          do-not-contact drop off this list automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          testId="replies-want-to-talk"
          title="Want to talk"
          value={queue.wantToTalkCount}
          hint="Asked for a call, a demo or pricing"
          tone={queue.wantToTalkCount > 0 ? "warn" : "ok"}
        />
        <SummaryCard
          testId="replies-overdue"
          title="Waiting too long"
          value={queue.overdueCount}
          hint="Past the time we said we would answer in"
          tone={queue.overdueCount > 0 ? "bad" : "ok"}
        />
        <SummaryCard
          testId="replies-total-waiting"
          title="Waiting in total"
          value={queue.totalWaiting}
          hint={`Replies from the last ${String(queue.windowDays)} days`}
          tone="ok"
        />
      </div>

      {aiOff || unclassifiedCount > 0 ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-medium">
            {aiOff
              ? "Automatic sorting is switched off."
              : `${String(unclassifiedCount)} of these have not been read by the assistant.`}
          </span>{" "}
          They are all still listed here and still need a person — an unsorted
          reply is never treated as one you can ignore. It just means nobody has
          told you which are the warm ones, so read them yourself.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Waiting now</CardTitle>
          <CardDescription>
            Open a reply to read it, answer it, or mark it handled. Anyone on
            the team can. If a colleague already has it open you will be told
            when you get there.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queue.entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nobody is waiting. Every reply from the last{" "}
              {String(queue.windowDays)} days has been answered, marked handled,
              or was a no.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>What they said</TableHead>
                    <TableHead>Waiting</TableHead>
                    <TableHead>Who has this</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.entries.map((entry) => (
                    <TableRow key={entry.replyId} data-testid="replies-waiting-row">
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-0.5">
                          <span data-testid="replies-waiting-from">
                            {entry.fromEmail}
                          </span>
                          {entry.subject ? (
                            <span className="text-muted-foreground max-w-xs truncate text-xs">
                              {entry.subject}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          prefetch={false}
                          className="underline"
                          href={`/clients/${entry.clientId}`}
                        >
                          {entry.clientName}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-sm">
                        <div className="flex flex-col gap-1">
                          <ClassificationBadge entry={entry} />
                          {entry.classificationRationale ? (
                            <span className="text-muted-foreground text-xs">
                              {entry.classificationRationale}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <WaitingCell entry={entry} />
                      </TableCell>
                      <TableCell>
                        <OwnerCell entry={entry} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          prefetch={false}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                          )}
                          href={`/clients/${entry.clientId}/activity/replies/${entry.replyId}`}
                        >
                          Open reply
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {queue.truncated ? (
                <p className="text-muted-foreground mt-4 text-xs">
                  This list is capped, and the cap was reached — there are older
                  replies from the last {String(queue.windowDays)} days that are
                  not shown. Work the list down and they will appear.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  tone,
  testId,
}: {
  title: string;
  value: number;
  hint: string;
  tone: "ok" | "warn" | "bad";
  testId: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle
          data-testid={testId}
          className={cn(
            "text-3xl",
            tone === "bad" && "text-destructive",
            tone === "warn" && "text-amber-600",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ClassificationBadge({ entry }: { entry: TriagedReplyWithClaim }) {
  const badge =
    entry.classification === null
      ? UNCLASSIFIED_BADGE
      : replyClassificationBadge(entry.classification);
  return (
    <Badge variant="outline" className={cn("w-fit", badge.className)}>
      {badge.text}
    </Badge>
  );
}

/**
 * The waiting time, and whether it has gone on too long. The word "overdue"
 * is never the only signal — the duration is always spelled out beside it, so
 * the row reads the same to somebody who cannot see the colour.
 */
function WaitingCell({ entry }: { entry: TriagedReplyWithClaim }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "text-sm",
          entry.overdue && "text-destructive font-medium",
        )}
      >
        {entry.waitingLabel}
      </span>
      {entry.overdue ? (
        <span className="text-destructive text-xs">Waiting too long</span>
      ) : null}
    </div>
  );
}

/**
 * Row 132 — every reply on this screen is by definition still waiting (a
 * handled one drops off the list entirely), so the only two states that can
 * show here are "unclaimed" and "claimed by somebody".
 */
function OwnerCell({ entry }: { entry: TriagedReplyWithClaim }) {
  const { text, tone } = replyOwnershipLabel(
    resolveReplyOwnershipState({
      handledAt: null,
      handledByName: null,
      handledByIsViewer: false,
      claim: entry.claim,
    }),
  );
  return <ReplyOwnershipBadge testId="replies-waiting-owner" text={text} tone={tone} />;
}
