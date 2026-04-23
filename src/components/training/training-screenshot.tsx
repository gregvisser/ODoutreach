import type { TrainingScreenshot } from "@/lib/training/modules";

type Props = {
  screenshot: TrainingScreenshot;
  /** First screenshot in a module is "eager" so the hero image loads immediately. */
  priority?: boolean;
};

/**
 * Renders a single portal screenshot with its caption. Purely presentational.
 * No server actions, no data fetching. Uses a plain <img> so we don't take a
 * dependency on next/image configuration for local assets.
 */
export function TrainingScreenshot({ screenshot, priority }: Props) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border/80 bg-background shadow-sm">
      {/*
        Captured from opensdoors.bidlow.co.uk at a 1440×900 viewport; width/height
        are set explicitly so the layout never shifts while the image decodes.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={screenshot.src}
        alt={screenshot.alt}
        width={screenshot.width}
        height={screenshot.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="block h-auto w-full bg-muted/40"
      />
      {screenshot.caption ? (
        <figcaption className="border-t border-border/60 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {screenshot.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
