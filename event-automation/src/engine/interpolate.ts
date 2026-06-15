import { EventContext } from "../model/event";

/**
 * Replace ${field} / ${a.b} tokens in a string with values from the event
 * context. Unknown tokens resolve to an empty string. Supports dotted paths
 * into metadata.
 */
export function interpolate(input: string, ctx: EventContext): string {
  return input.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const value = resolvePath(ctx, expr.trim());
    return value === undefined || value === null ? "" : String(value);
  });
}

function resolvePath(ctx: EventContext, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = ctx;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else if (
      current &&
      typeof current === "object" &&
      (current as EventContext).metadata &&
      part in ((current as EventContext).metadata as Record<string, unknown>)
    ) {
      current = ((current as EventContext).metadata as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Interpolate any string fields inside an arbitrary record (shallow + body). */
export function interpolateString(input: string | undefined, ctx: EventContext): string | undefined {
  return input === undefined ? undefined : interpolate(input, ctx);
}
