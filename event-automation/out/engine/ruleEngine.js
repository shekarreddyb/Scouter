"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleEngine = void 0;
const expression_1 = require("./expression");
const dispatcher_1 = require("../actions/dispatcher");
const log_1 = require("../log");
class RuleEngine {
    constructor(services, isEnabled) {
        this.services = services;
        this.isEnabled = isEnabled;
        this.rules = [];
        this.programmatic = [];
        this.lastFire = new Map();
        this.fired = new Set();
        this.config = services.getConfig();
    }
    setRules(rules, config) {
        this.rules = rules;
        this.config = config;
        this.lastFire.clear();
        this.fired.clear();
    }
    setProgrammatic(rules) {
        this.programmatic = rules;
    }
    async handle(ctx) {
        if (!this.isEnabled()) {
            return;
        }
        for (const rule of this.rules) {
            if (rule.enabled === false) {
                continue;
            }
            if (!rule.on.includes(ctx.event)) {
                continue;
            }
            if (rule.once && this.fired.has(rule)) {
                continue;
            }
            if (rule.cooldown) {
                const last = this.lastFire.get(rule) ?? 0;
                if (Date.now() - last < rule.cooldown) {
                    continue;
                }
            }
            if (rule.when) {
                const ok = (0, expression_1.evaluate)(rule.when, ctx, (m) => log_1.log.warn(`Rule '${rule.name ?? "(unnamed)"}' when-error: ${m}`));
                if (!ok) {
                    continue;
                }
            }
            this.lastFire.set(rule, Date.now());
            this.fired.add(rule);
            log_1.log.info(`Matched rule '${rule.name ?? "(unnamed)"}' on ${ctx.event}`);
            await this.runActions(rule.do, rule.execute, ctx);
            if (rule.stop) {
                return;
            }
        }
        for (const pr of this.programmatic) {
            if (!pr.events.includes(ctx.event)) {
                continue;
            }
            if (pr.predicate && !pr.predicate(ctx)) {
                continue;
            }
            await this.runActions(pr.actions, "sequential", ctx);
        }
    }
    /** Fire a rule's actions directly, bypassing matching/cooldown (used by Test Fire). */
    async fireRule(rule, ctx) {
        await this.runActions(rule.do, rule.execute, ctx);
    }
    getRules() {
        return this.rules;
    }
    async runActions(actions, execute, ctx) {
        if (execute === "parallel") {
            await Promise.all(actions.map((a) => (0, dispatcher_1.dispatch)(a, ctx, this.services)));
        }
        else {
            for (const action of actions) {
                await (0, dispatcher_1.dispatch)(action, ctx, this.services);
            }
        }
    }
}
exports.RuleEngine = RuleEngine;
//# sourceMappingURL=ruleEngine.js.map