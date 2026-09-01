"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  addSupportTicketComment,
  type SupportActionResult,
} from "@/app/(app)/support/actions";

export type SupportTicketCommentItem = {
  id: string;
  body: string;
  createdAt: string | Date;
  authorEmail: string;
  authorName: string | null;
};

/**
 * Row 159: the reply thread on a ticket. Append-only — oldest first, like any
 * chat log — so the order a reader sees matches the order things were said.
 */
export function SupportTicketComments({
  ticketId,
  comments,
}: {
  ticketId: string;
  comments: SupportTicketCommentItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [banner, setBanner] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);

  function submit() {
    startTransition(async () => {
      setBanner(null);
      const r: SupportActionResult = await addSupportTicketComment({
        ticketId,
        body,
      });
      if (r.ok) {
        setBody("");
        formRef.current?.reset();
        router.refresh();
      } else {
        setBanner({ type: "err", text: r.error });
      }
    });
  }

  return (
    <div className="space-y-4">
      {comments.length > 0 ? (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border/60 bg-muted/20 px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm font-medium text-foreground">
                  {c.authorName ?? c.authorEmail}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(c.createdAt), "d MMM yyyy, HH:mm")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {c.body}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          No replies yet. Ask a question or add an update below.
        </p>
      )}

      {banner && (
        <div
          role="status"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {banner.text}
        </div>
      )}

      <form
        ref={formRef}
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ask a question or add an update…"
          disabled={pending}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending || body.trim().length < 2}
          className={cn(pending && "opacity-70")}
        >
          {pending ? "Posting…" : "Post reply"}
        </Button>
      </form>
    </div>
  );
}
