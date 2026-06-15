import { EventContext } from "../model/event";

/**
 * A small, safe expression evaluator for rule `when` conditions.
 * Supports: numbers, strings, true/false/null, identifiers (resolved against the
 * event context), dotted member access, the comparison/logical operators
 * (== != > >= < <= && || !), parentheses, and a whitelist of string methods
 * (startsWith, endsWith, includes). It does NOT evaluate arbitrary JS, so it is
 * safe to run config authored by anyone.
 */

type Value = string | number | boolean | null | undefined;

interface Token {
  kind: "num" | "str" | "ident" | "op" | "eof";
  value: string;
}

const STRING_METHODS = new Set(["startsWith", "endsWith", "includes"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);

  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }

    if (c === '"' || c === "'") {
      const quote = c;
      let str = "";
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < src.length) { str += src[i + 1]; i += 2; }
        else { str += src[i]; i++; }
      }
      i++; // closing quote
      tokens.push({ kind: "str", value: str });
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let num = "";
      while (i < src.length && /[0-9.]/.test(src[i])) { num += src[i]; i++; }
      tokens.push({ kind: "num", value: num });
      continue;
    }

    if (isIdentStart(c)) {
      let id = "";
      while (i < src.length && isIdentPart(src[i])) { id += src[i]; i++; }
      tokens.push({ kind: "ident", value: id });
      continue;
    }

    // multi-char operators first
    const two = src.substr(i, 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
      tokens.push({ kind: "op", value: two }); i += 2; continue;
    }
    if ("()!<>.,".includes(c)) {
      tokens.push({ kind: "op", value: c }); i++; continue;
    }
    throw new Error(`Unexpected character '${c}' in expression`);
  }
  tokens.push({ kind: "eof", value: "" });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private ctx: EventContext) {}

  private peek(): Token { return this.tokens[this.pos]; }
  private next(): Token { return this.tokens[this.pos++]; }
  private expect(op: string): void {
    const t = this.next();
    if (t.kind !== "op" || t.value !== op) {
      throw new Error(`Expected '${op}' but found '${t.value}'`);
    }
  }

  parse(): Value {
    const v = this.parseOr();
    if (this.peek().kind !== "eof") {
      throw new Error(`Unexpected token '${this.peek().value}'`);
    }
    return v;
  }

  private parseOr(): Value {
    let left = this.parseAnd();
    while (this.peek().value === "||") {
      this.next();
      const right = this.parseAnd();
      left = truthy(left) || truthy(right);
    }
    return left;
  }

  private parseAnd(): Value {
    let left = this.parseEquality();
    while (this.peek().value === "&&") {
      this.next();
      const right = this.parseEquality();
      left = truthy(left) && truthy(right);
    }
    return left;
  }

  private parseEquality(): Value {
    let left = this.parseComparison();
    while (this.peek().value === "==" || this.peek().value === "!=") {
      const op = this.next().value;
      const right = this.parseComparison();
      left = op === "==" ? looseEq(left, right) : !looseEq(left, right);
    }
    return left;
  }

  private parseComparison(): Value {
    let left = this.parseUnary();
    while ([">", ">=", "<", "<="].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseUnary();
      const a = Number(left);
      const b = Number(right);
      switch (op) {
        case ">": left = a > b; break;
        case ">=": left = a >= b; break;
        case "<": left = a < b; break;
        case "<=": left = a <= b; break;
      }
    }
    return left;
  }

  private parseUnary(): Value {
    if (this.peek().value === "!") {
      this.next();
      return !truthy(this.parseUnary());
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Value {
    let value = this.parsePrimary();
    // member access / method calls
    while (this.peek().value === ".") {
      this.next();
      const nameTok = this.next();
      if (nameTok.kind !== "ident") {
        throw new Error(`Expected property name after '.'`);
      }
      if (this.peek().value === "(") {
        // method call (whitelisted string methods only)
        this.next();
        const args: Value[] = [];
        if (this.peek().value !== ")") {
          args.push(this.parseOr());
          while (this.peek().value === ",") { this.next(); args.push(this.parseOr()); }
        }
        this.expect(")");
        value = callMethod(value, nameTok.value, args);
      } else {
        value = memberOf(value, nameTok.value);
      }
    }
    return value;
  }

  private parsePrimary(): Value {
    const t = this.peek();
    if (t.value === "(") {
      this.next();
      const v = this.parseOr();
      this.expect(")");
      return v;
    }
    if (t.kind === "num") { this.next(); return Number(t.value); }
    if (t.kind === "str") { this.next(); return t.value; }
    if (t.kind === "ident") {
      this.next();
      if (t.value === "true") return true;
      if (t.value === "false") return false;
      if (t.value === "null") return null;
      return memberOf(this.ctx as unknown as Record<string, unknown>, t.value);
    }
    throw new Error(`Unexpected token '${t.value}'`);
  }
}

function memberOf(obj: unknown, prop: string): Value {
  if (obj && typeof obj === "object" && prop in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[prop] as Value;
  }
  return undefined;
}

function callMethod(target: Value, method: string, args: Value[]): Value {
  if (!STRING_METHODS.has(method)) {
    throw new Error(`Method '${method}' is not allowed in expressions`);
  }
  const s = target === undefined || target === null ? "" : String(target);
  const arg = args[0] === undefined ? "" : String(args[0]);
  switch (method) {
    case "startsWith": return s.startsWith(arg);
    case "endsWith": return s.endsWith(arg);
    case "includes": return s.includes(arg);
    default: return false;
  }
}

function truthy(v: Value): boolean {
  return !!v;
}

function looseEq(a: Value, b: Value): boolean {
  // eslint-disable-next-line eqeqeq
  return a == (b as unknown as Value);
}

/** Evaluate an expression against a context. Returns boolean truthiness.
 *  On parse/eval error, returns false and reports via onError. */
export function evaluate(
  expr: string,
  ctx: EventContext,
  onError?: (message: string) => void
): boolean {
  try {
    const tokens = tokenize(expr);
    const result = new Parser(tokens, ctx).parse();
    return truthy(result);
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e));
    return false;
  }
}
