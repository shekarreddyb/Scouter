"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDuration = parseDuration;
/** Parse a human duration to milliseconds. Accepts "5s", "2m", "1h", "300ms",
 *  or a bare number (treated as ms). Returns undefined for empty/invalid. */
function parseDuration(input) {
    if (input === undefined || input === null) {
        return undefined;
    }
    if (typeof input === "number") {
        return input;
    }
    const s = String(input).trim();
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
    if (!m) {
        return undefined;
    }
    const value = parseFloat(m[1]);
    const unit = (m[2] || "ms").toLowerCase();
    switch (unit) {
        case "ms": return value;
        case "s": return value * 1000;
        case "m": return value * 60_000;
        case "h": return value * 3_600_000;
        default: return value;
    }
}
//# sourceMappingURL=util.js.map