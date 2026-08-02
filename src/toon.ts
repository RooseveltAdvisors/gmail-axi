function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value) || isObject(value)) return JSON.stringify(value) || "null";
  const text = String(value);
  if (/^[A-Za-z0-9_./:@+~=-]+$/.test(text) && !/^(true|false|null)$/.test(text)) return text;
  return JSON.stringify(text);
}

function isFlatObject(value: unknown): value is Record<string, unknown> {
  return isObject(value) && Object.values(value).every((field) => !Array.isArray(field) && !isObject(field));
}

function arrayLines(key: string, values: unknown[], indent: string): string[] {
  if (values.length > 0 && values.every(isFlatObject)) {
    const keys = [...new Set(values.flatMap((value) => Object.keys(value)))];
    const lines = [`${indent}${key}[${values.length}]{${keys.join(",")}}:`];
    for (const value of values) lines.push(`${indent}  ${keys.map((field) => scalar(value[field])).join(",")}`);
    return lines;
  }
  return [`${indent}${key}[${values.length}]:`, ...values.map((value) => `${indent}  ${scalar(value)}`)];
}

function objectLines(value: Record<string, unknown>, indent = ""): string[] {
  const lines: string[] = [];
  for (const [key, field] of Object.entries(value)) {
    if (Array.isArray(field)) {
      lines.push(...arrayLines(key, field, indent));
    } else if (isObject(field)) {
      lines.push(`${indent}${key}:`, ...objectLines(field, `${indent}  `));
    } else {
      lines.push(`${indent}${key}: ${scalar(field)}`);
    }
  }
  return lines;
}

export function toon(value: Record<string, unknown>): string {
  return `${objectLines(value).join("\n")}\n`;
}
