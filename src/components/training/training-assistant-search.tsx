"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  askTrainingAssistantAction,
  raiseTrainingAssistantTicketAction,
} from "@/app/(app)/training/assistant-actions";
import type { AnswerTrainingQuestionResult } from "@/server/ai/answer-training-question";

/**
 * The app-shell "how do I..." search bar (queue row 149).
 *
 * PLACEMENT: mounted once in `AppHeader`, which renders on every authenticated
 * screen — not inside the Training tab. See the row's brief for why: a help
 * box a person must navigate to is a help box nobody uses, and this project
 * has already re-learned that lesson twice (Google logins moved to the
 * sidebar; Setup help became its own tab because it used to be conditional on
 * a state the client who most needed it never reached).
 *
 * It answers ONLY from training content (see `answerTrainingQuestion`) and
 * says so plainly when it cannot — the "I don't know, shall I raise a ticket?"
 * path is the designed outcome for a real fraction of questions, not a bug.
 */

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "answered"; readonly result: AnswerTrainingQuestionResult }
  | { readonly kind: "ticket_raised"; readonly ticketId: string };

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent ?? "");
}

export function TrainingAssistantSearch() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRaisingTicket, startTicketTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    // Sheet mount is async; a microtask-delayed focus beats the Popup's own transition.
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      // A closed sheet reopening fresh is a UX decision, not a system to
      // synchronize with — handled in this event handler, not an effect.
      setQuestion("");
      setPhase({ kind: "idle" });
      setTicketError(null);
    }
  }, []);

  const ask = useCallback(() => {
    const trimmed = question.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await askTrainingAssistantAction(trimmed);
      setPhase({ kind: "answered", result });
      setTicketError(null);
    });
  }, [question]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    ask();
  }

  function raiseTicket() {
    if (phase.kind !== "answered" || phase.result.ok !== true || phase.result.canAnswer !== false) {
      return;
    }
    const unansweredQuestionId = phase.result.unansweredQuestionId ?? undefined;
    startTicketTransition(async () => {
      const outcome = await raiseTrainingAssistantTicketAction({
        question,
        unansweredQuestionId,
      });
      if (outcome.ok) {
        setPhase({ kind: "ticket_raised", ticketId: outcome.ticketId });
        setTicketError(null);
      } else {
        setTicketError(outcome.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-2 text-muted-foreground",
        )}
        aria-label="Search how-to questions"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">How do I...?</span>
        <kbd
          suppressHydrationWarning
          className="hidden rounded border border-border/70 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline"
        >
          {isMac() ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="top" className="mx-auto w-full max-w-xl border-x sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>How do I...?</SheetTitle>
            <SheetDescription>
              Ask a question about using this system. Answers come only from the training
              material, and every answer links to where it came from.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-3 px-4 pb-4">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. How do I set a branded signature?"
                disabled={isPending}
              />
              <Button type="submit" disabled={isPending || !question.trim()}>
                {isPending ? "Asking…" : "Ask"}
              </Button>
            </div>

            {phase.kind === "answered" && phase.result.ok && phase.result.canAnswer === true && (
              <div className="space-y-3 rounded-md border border-border/60 bg-background p-3 text-sm">
                <p className="whitespace-pre-wrap text-foreground">{phase.result.answer}</p>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Where this came from:
                  </p>
                  <ul className="space-y-1">
                    {phase.result.citations.map((citation) => (
                      <li key={citation.href}>
                        <Link
                          href={citation.href}
                          prefetch={false}
                          onClick={() => handleOpenChange(false)}
                          className="text-sm text-primary underline underline-offset-2"
                        >
                          {citation.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {phase.kind === "answered" &&
              ((phase.result.ok && phase.result.canAnswer === false) || !phase.result.ok) && (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
                  <p className="text-foreground">
                    I don&apos;t have that in the training material — shall I raise a ticket for
                    it?
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={raiseTicket}
                    disabled={isRaisingTicket}
                  >
                    {isRaisingTicket ? "Raising ticket…" : "Raise a support ticket"}
                  </Button>
                  {ticketError && <p className="text-xs text-destructive">{ticketError}</p>}
                </div>
              )}

            {phase.kind === "ticket_raised" && (
              <div className="rounded-md border border-border/60 bg-background p-3 text-sm">
                <p className="text-foreground">
                  Ticket raised with your question attached.{" "}
                  <Link
                    href={`/support/${phase.ticketId}`}
                    prefetch={false}
                    onClick={() => handleOpenChange(false)}
                    className="text-primary underline underline-offset-2"
                  >
                    View it
                  </Link>
                  .
                </p>
              </div>
            )}
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
