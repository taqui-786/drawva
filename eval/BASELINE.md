# Drawva Prompt Optimization Baseline Measurements

Date: 2026-08-25
Status: Baseline Established

## Prompt Block Sizes (Pre-Optimization)

| Block (`lib/ai/prompts.ts`) | Chars | Est Tokens (chars/4) |
|---|---|---|
| `SYSTEM_PROMPT` | 13687 | ≈ 3422 |
| `PLUGIN_ROUTING_PROMPT` | 832 | ≈ 208 |
| `PLUGIN_SYSTEM_PROMPT` | 3641 | ≈ 911 |
| `WIDGET_RENDERING_POLICY` | 1757 | ≈ 440 |
| `MANDATORY_VISIBLE_RESPONSE` | 1122 | ≈ 281 |
| `CODE_SYSTEM_PROMPT_EXTRA` | 1819 | ≈ 455 |
| **Composed System Total (with current agent.ts double-injection)** | **22492** | **≈ 5623** |

## Initial Identified Defects
1. **Duplicate `MANDATORY_VISIBLE_RESPONSE`**: Injected twice in composed prompt (`buildSystemPromptText` + appended in `attemptReply` at line 408-409).
2. **Redundant `WIDGET_RENDERING_POLICY` vs `PLUGIN_SYSTEM_PROMPT`**: Overlapping typography, sizing, and viewBox instructions.
3. **Verbose Prose in `SYSTEM_PROMPT`**: Long paragraphs instead of compact imperative rule-lines.
4. **Plugin Documentation Volume**: Verbose plugins in `public/plugins/*/plugin.md` (>3,600 words across 11 plugins).

## Golden Set Evaluation (Baseline)
- Cases in Golden Set: 20 scenarios
- Validator Harness: `eval/run.ts`
- Target System Tokens Post-Optimization: **≤ 3,200 tokens** (~12,800 chars)
