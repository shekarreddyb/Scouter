import { GlobalConfig, Rule, Action } from "../model/rule";
import { EventContext } from "../model/event";
import { evaluate } from "./expression";
import { dispatch, Services } from "../actions/dispatcher";
import { log } from "../log";

export interface ProgrammaticRule {
  events: string[];
  predicate?: (ctx: EventContext) => boolean;
  actions: Action[];
}

export class RuleEngine {
  private rules: Rule[] = [];
  private programmatic: ProgrammaticRule[] = [];
  private config: GlobalConfig;
  private lastFire = new Map<Rule, number>();
  private fired = new Set<Rule>();

  constructor(
    private readonly services: Services,
    private readonly isEnabled: () => boolean
  ) {
    this.config = services.getConfig();
  }

  setRules(rules: Rule[], config: GlobalConfig): void {
    this.rules = rules;
    this.config = config;
    this.lastFire.clear();
    this.fired.clear();
  }

  setProgrammatic(rules: ProgrammaticRule[]): void {
    this.programmatic = rules;
  }

  async handle(ctx: EventContext): Promise<void> {
    if (!this.isEnabled()) { return; }

    for (const rule of this.rules) {
      if (rule.enabled === false) { continue; }
      if (!rule.on.includes(ctx.event)) { continue; }
      if (rule.once && this.fired.has(rule)) { continue; }

      if (rule.cooldown) {
        const last = this.lastFire.get(rule) ?? 0;
        if (Date.now() - last < rule.cooldown) { continue; }
      }

      if (rule.when) {
        const ok = evaluate(rule.when, ctx, (m) =>
          log.warn(`Rule '${rule.name ?? "(unnamed)"}' when-error: ${m}`)
        );
        if (!ok) { continue; }
      }

      this.lastFire.set(rule, Date.now());
      this.fired.add(rule);
      log.info(`Matched rule '${rule.name ?? "(unnamed)"}' on ${ctx.event}`);

      await this.runActions(rule.do, rule.execute, ctx);

      if (rule.stop) { return; }
    }

    for (const pr of this.programmatic) {
      if (!pr.events.includes(ctx.event)) { continue; }
      if (pr.predicate && !pr.predicate(ctx)) { continue; }
      await this.runActions(pr.actions, "sequential", ctx);
    }
  }

  /** Fire a rule's actions directly, bypassing matching/cooldown (used by Test Fire). */
  async fireRule(rule: Rule, ctx: EventContext): Promise<void> {
    await this.runActions(rule.do, rule.execute, ctx);
  }

  getRules(): Rule[] {
    return this.rules;
  }

  private async runActions(
    actions: Action[],
    execute: "sequential" | "parallel" | undefined,
    ctx: EventContext
  ): Promise<void> {
    if (execute === "parallel") {
      await Promise.all(actions.map((a) => dispatch(a, ctx, this.services)));
    } else {
      for (const action of actions) {
        await dispatch(action, ctx, this.services);
      }
    }
  }
}
