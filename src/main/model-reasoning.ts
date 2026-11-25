/** Apply the Console's light GPT-6 preset without changing other agent settings. */
export function applyModelReasoning(raw: string, model: string) {
  if (model !== "gpt-6-astra") return raw;
  const pattern = /^agent:[ \t]*\r?\n(?:[ \t]+[^\n]*\n?|[ \t]*\n)*/m;
  const block = raw.match(pattern)?.[0];
  if (!block) return `${raw.trimEnd()}\nagent:\n  reasoning_effort: low\n`;
  const next = /^  reasoning_effort:/m.test(block)
    ? block.replace(/^  reasoning_effort:[^\n]*/m, "  reasoning_effort: low")
    : block.replace(/^agent:[ \t]*\r?\n/, "agent:\n  reasoning_effort: low\n");
  return raw.replace(pattern, next);
}
