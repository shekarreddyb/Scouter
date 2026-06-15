using EventOverlay.Core.Models;

namespace EventOverlay.Core;

/// <summary>
/// Matches incoming events against the configured <see cref="OverlayRule"/> list.
/// All rendering decisions live here; the WPF layer just executes the matched rules.
/// </summary>
public sealed class RuleEngine
{
    private IReadOnlyList<OverlayRule> _rules = [];

    public void SetRules(IEnumerable<OverlayRule> rules) =>
        _rules = rules.ToList();

    /// <summary>Returns every rule whose pattern matches the event and whose when-filter passes.</summary>
    public IEnumerable<OverlayRule> Match(IncomingEvent evt)
    {
        foreach (var rule in _rules)
        {
            if (!MatchesPattern(rule.On, evt.Type)) continue;
            if (rule.When is not null && !EvaluateWhen(rule.When, evt)) continue;
            yield return rule;
        }
    }

    // ── Pattern matching ──────────────────────────────────────────────────────

    private static bool MatchesPattern(string pattern, string eventType)
    {
        if (pattern == "**") return true;

        // "test.*" matches "test.passed", "test.failed"
        if (pattern.EndsWith(".*", StringComparison.Ordinal))
        {
            var ns = pattern[..^2];
            return eventType.StartsWith(ns + ".", StringComparison.Ordinal);
        }

        return string.Equals(pattern, eventType, StringComparison.Ordinal);
    }

    // ── Simple when-filter ────────────────────────────────────────────────────

    private static bool EvaluateWhen(string expression, IncomingEvent evt)
    {
        // Supports: "field == value"  and  "field != value"
        // Field is looked up in evt.Payload (JSON element).
        if (evt.Payload is null) return false;

        var (field, op, expected) = ParseExpression(expression);
        if (field is null) return true; // unparseable → don't filter

        var actual = evt.GetPayloadString(field);
        return op == "!=" ? actual != expected : actual == expected;
    }

    private static (string? field, string op, string? expected) ParseExpression(string expr)
    {
        foreach (var op in new[] { "!=", "==" })
        {
            var idx = expr.IndexOf(op, StringComparison.Ordinal);
            if (idx < 0) continue;
            var field = expr[..idx].Trim();
            var val = expr[(idx + op.Length)..].Trim().Trim('"', '\'');
            return (field, op, val);
        }
        return (null, "==", null);
    }
}
