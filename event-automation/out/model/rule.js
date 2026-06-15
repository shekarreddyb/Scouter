"use strict";
/**
 * Parsed rule + action shapes. The YAML/JSON is normalized into these.
 *
 * Actions use shorthand in config: the *type key* (publish/notify/run/
 * command/webhook/statusBar) carries the primary value, with modifiers
 * beside it. After parsing every action becomes a discriminated { type, ... }.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
    publishTo: "udp://127.0.0.1:38471",
    enabled: true,
    commands: [],
};
//# sourceMappingURL=rule.js.map