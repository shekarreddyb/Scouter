"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfigFromString = loadConfigFromString;
exports.loadConfigFromFile = loadConfigFromFile;
const fs = __importStar(require("fs"));
const yaml = __importStar(require("js-yaml"));
const jsonc_parser_1 = require("jsonc-parser");
const rule_1 = require("../model/rule");
const util_1 = require("../util");
// Keys that identify a known action type in a YAML/JSON object.
// "parallel" is handled specially (its value is an array of sub-actions).
const ACTION_TYPE_KEYS = [
    "publish", "parallel", "notify", "run", "command", "webhook", "statusBar",
];
const KNOWN_EVENTS = new Set([
    "test.started", "test.passed", "test.failed", "test.finished",
    "task.started", "task.finished", "task.failed",
    "terminal.started", "terminal.finished",
    "debug.started", "debug.stopped", "debug.breakpoint", "debug.exception",
    "git.commit", "git.push", "git.pull", "git.branchChanged",
    "file.saved", "folder.opened", "workspace.loaded",
]);
function loadConfigFromString(text, format) {
    const problems = [];
    let raw;
    try {
        raw = format === "yaml" ? yaml.load(text) : (0, jsonc_parser_1.parse)(text);
    }
    catch (e) {
        problems.push({
            message: `Failed to parse config: ${e instanceof Error ? e.message : String(e)}`,
            severity: "error",
        });
        return { parsed: { config: rule_1.DEFAULT_CONFIG, rules: [] }, problems };
    }
    const rawObj = (raw && typeof raw === "object" ? raw : {});
    const config = normalizeConfig(rawObj.config, problems);
    const rules = normalizeRules(rawObj.rules, problems);
    return { parsed: { config, rules }, problems };
}
function loadConfigFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {
            parsed: { config: rule_1.DEFAULT_CONFIG, rules: [] },
            problems: [{ message: `Config file not found: ${filePath}`, severity: "warning" }],
        };
    }
    const text = fs.readFileSync(filePath, "utf8");
    const format = /\.ya?ml$/i.test(filePath) ? "yaml" : "jsonc";
    return loadConfigFromString(text, format);
}
function normalizeConfig(input, _problems) {
    const c = (input && typeof input === "object" ? input : {});
    let publishTo = rule_1.DEFAULT_CONFIG.publishTo;
    if (typeof c.publishTo === "string") {
        publishTo = c.publishTo;
    }
    else if (Array.isArray(c.publishTo)) {
        publishTo = c.publishTo.filter((x) => typeof x === "string");
    }
    return {
        publishTo,
        enabled: typeof c.enabled === "boolean" ? c.enabled : rule_1.DEFAULT_CONFIG.enabled,
        commands: Array.isArray(c.commands)
            ? c.commands.filter((x) => typeof x === "string")
            : [],
    };
}
function normalizeRules(input, problems) {
    if (!Array.isArray(input)) {
        if (input !== undefined) {
            problems.push({ message: "`rules` must be a list", severity: "error" });
        }
        return [];
    }
    const rules = [];
    input.forEach((item, idx) => {
        const r = item;
        const label = r?.name || `rule #${idx + 1}`;
        if (!r || typeof r !== "object") {
            problems.push({ message: `${label}: not an object`, severity: "error" });
            return;
        }
        const on = normalizeOn(r.on);
        if (on.length === 0) {
            problems.push({ message: `${label}: missing or invalid 'on'`, severity: "error", rule: label });
            return;
        }
        for (const ev of on) {
            if (!KNOWN_EVENTS.has(ev) && !ev.startsWith("command.")) {
                problems.push({ message: `${label}: unknown event '${ev}'`, severity: "warning", rule: label });
            }
        }
        const actions = normalizeActions(r.do, label, problems);
        if (actions.length === 0) {
            problems.push({ message: `${label}: 'do' has no valid actions`, severity: "error", rule: label });
            return;
        }
        const execute = r.execute === "parallel" ? "parallel" : "sequential";
        rules.push({
            name: r.name,
            on,
            when: typeof r.when === "string" ? r.when : undefined,
            cooldown: (0, util_1.parseDuration)(r.cooldown),
            once: r.once === true,
            priority: typeof r.priority === "number" ? r.priority : 0,
            stop: r.stop === true,
            enabled: r.enabled !== false,
            execute,
            do: actions,
        });
    });
    rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return rules;
}
function normalizeOn(on) {
    if (typeof on === "string") {
        return [on];
    }
    if (Array.isArray(on)) {
        return on.filter((x) => typeof x === "string");
    }
    return [];
}
function normalizeActions(input, label, problems) {
    if (!Array.isArray(input)) {
        problems.push({ message: `${label}: 'do' must be a list`, severity: "error", rule: label });
        return [];
    }
    const actions = [];
    for (const raw of input) {
        const obj = raw;
        if (!obj || typeof obj !== "object") {
            problems.push({ message: `${label}: invalid action`, severity: "warning", rule: label });
            continue;
        }
        const typeKey = ACTION_TYPE_KEYS.find((k) => k in obj);
        if (typeKey) {
            const a = buildKnownAction(typeKey, obj, label, problems);
            if (a) {
                actions.push(a);
            }
            continue;
        }
        // Unknown key → custom action
        const keys = Object.keys(obj);
        if (keys.length >= 1) {
            const name = keys[0];
            const { [name]: value, ...rest } = obj;
            actions.push({ type: "custom", name, params: { value, ...rest } });
        }
        else {
            problems.push({ message: `${label}: empty action`, severity: "warning", rule: label });
        }
    }
    return actions;
}
function buildKnownAction(typeKey, obj, label, problems) {
    const v = obj[typeKey];
    switch (typeKey) {
        case "publish": {
            // publish: "event.type"   OR   publish: { event: "...", payload: {...}, to: "..." }
            if (typeof v === "string") {
                return {
                    type: "publish",
                    event: v,
                    to: obj.to,
                    payload: obj.payload,
                };
            }
            if (v && typeof v === "object") {
                const pub = v;
                if (typeof pub.event !== "string") {
                    problems.push({ message: `${label}: publish.event must be a string`, severity: "error", rule: label });
                    return undefined;
                }
                return {
                    type: "publish",
                    event: pub.event,
                    to: (pub.to ?? obj.to),
                    payload: pub.payload,
                };
            }
            problems.push({ message: `${label}: 'publish' value must be a string or object`, severity: "error", rule: label });
            return undefined;
        }
        case "parallel":
            return {
                type: "parallel",
                actions: normalizeActions(Array.isArray(v) ? v : [], label, problems),
            };
        case "notify":
            return {
                type: "notify",
                text: String(v),
                level: obj.level ?? "info",
                buttons: obj.buttons,
            };
        case "run":
            return { type: "run", command: String(v), cwd: obj.cwd };
        case "command":
            return { type: "command", command: String(v), args: obj.args };
        case "webhook":
            return {
                type: "webhook",
                url: String(v),
                method: obj.method ?? "POST",
                headers: obj.headers,
                body: obj.body,
            };
        case "statusBar":
            return {
                type: "statusBar",
                text: String(v),
                color: obj.color,
                tooltip: obj.tooltip,
                timeout: obj.timeout,
            };
        default:
            return undefined;
    }
}
//# sourceMappingURL=loader.js.map