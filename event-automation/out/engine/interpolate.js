"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpolate = interpolate;
exports.interpolateString = interpolateString;
/**
 * Replace ${field} / ${a.b} tokens in a string with values from the event
 * context. Unknown tokens resolve to an empty string. Supports dotted paths
 * into metadata.
 */
function interpolate(input, ctx) {
    return input.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
        const value = resolvePath(ctx, expr.trim());
        return value === undefined || value === null ? "" : String(value);
    });
}
function resolvePath(ctx, path) {
    const parts = path.split(".");
    let current = ctx;
    for (const part of parts) {
        if (current && typeof current === "object" && part in current) {
            current = current[part];
        }
        else if (current &&
            typeof current === "object" &&
            current.metadata &&
            part in current.metadata) {
            current = current.metadata[part];
        }
        else {
            return undefined;
        }
    }
    return current;
}
/** Interpolate any string fields inside an arbitrary record (shallow + body). */
function interpolateString(input, ctx) {
    return input === undefined ? undefined : interpolate(input, ctx);
}
//# sourceMappingURL=interpolate.js.map