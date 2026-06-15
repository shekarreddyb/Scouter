"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeEvent = makeEvent;
function makeEvent(source, event, extra = {}) {
    return { source, event, timestamp: Date.now(), ...extra };
}
//# sourceMappingURL=event.js.map