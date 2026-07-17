const VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export function renderText(template: string, variables: Record<string, unknown>) {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => {
    const value = resolveTemplateVariable(variables, key);
    return value === undefined || value === null ? "" : String(value);
  });
}

export function validateTemplateSource(template: { subject?: string | null; title?: string | null; body: string; requiredVariables: string[] }) {
  const declared = new Set(template.requiredVariables);
  const referenced = new Set<string>();
  for (const source of [template.subject, template.title, template.body]) {
    if (!source) continue;
    for (const match of source.matchAll(VARIABLE_PATTERN)) referenced.add(match[1]);
  }
  return {
    valid: [...referenced].every((key) => declared.has(key)),
    undeclared: [...referenced].filter((key) => !declared.has(key)),
  };
}

export function resolveTemplateVariable(variables: Record<string, unknown>, key: string) {
  return key.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[part];
  }, variables);
}
