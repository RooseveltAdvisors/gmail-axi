function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value) || isObject(value)) return JSON.stringify(value) || "null";
  const text = String(value);
  const numericLike = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
  if (/^[A-Za-z0-9_./@+~=-]+$/.test(text) && !/^(true|false|null)$/.test(text) && !numericLike && !text.startsWith("-")) return text;
  return JSON.stringify(text);
}

function isFlatObject(value: unknown): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).length > 0 && Object.values(value).every((field) => !Array.isArray(field) && !isObject(field));
}

function isPrimitive(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isTabular(values: unknown[]): values is Array<Record<string, unknown>> {
  if (!values.length || !values.every(isFlatObject)) return false;
  const keys = Object.keys(values[0]);
  return values.every((value) => keys.length === Object.keys(value).length && keys.every((key) => Object.hasOwn(value, key)));
}

function fieldLines(key: string, field: unknown, indent: string): string[] {
  if (Array.isArray(field)) return arrayLines(key, field, indent);
  if (isObject(field)) return [`${indent}${key}:`, ...objectLines(field, `${indent}  `)];
  return [`${indent}${key}: ${scalar(field)}`];
}

function listItemLines(value: unknown, indent: string): string[] {
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return [`${indent}- {}`];
    const lines: string[] = [];
    for (const [index, [key, field]] of entries.entries()) {
      const fieldIndent = `${indent}  `;
      const nested = fieldLines(key, field, fieldIndent);
      if (index === 0) nested[0] = `${indent}- ${nested[0].slice(fieldIndent.length)}`;
      lines.push(...nested);
    }
    return lines;
  }
  if (Array.isArray(value)) {
    if (!value.length) return [`${indent}- []`];
    if (value.every(isPrimitive)) return [`${indent}- [${value.length}]: ${value.map(scalar).join(",")}`];
    return [`${indent}- [${value.length}]:`, ...value.flatMap((item) => listItemLines(item, `${indent}  `))];
  }
  return [`${indent}- ${scalar(value)}`];
}

function arrayLines(key: string, values: unknown[], indent: string): string[] {
  if (!values.length) return [`${indent}${key}: []`];
  if (isTabular(values)) {
    const keys = [...new Set(values.flatMap((value) => Object.keys(value)))];
    const lines = [`${indent}${key}[${values.length}]{${keys.join(",")}}:`];
    for (const value of values) lines.push(`${indent}  ${keys.map((field) => scalar(value[field])).join(",")}`);
    return lines;
  }
  if (values.every(isPrimitive)) return [`${indent}${key}[${values.length}]: ${values.map(scalar).join(",")}`];
  return [`${indent}${key}[${values.length}]:`, ...values.flatMap((value) => listItemLines(value, `${indent}  `))];
}

function objectLines(value: Record<string, unknown>, indent = ""): string[] {
  const lines: string[] = [];
  for (const [key, field] of Object.entries(value)) lines.push(...fieldLines(key, field, indent));
  return lines;
}

export function toon(value: Record<string, unknown>): string {
  return `${objectLines(value).join("\n")}\n`;
}
