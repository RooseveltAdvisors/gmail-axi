export class MidError extends Error {
  readonly code = "invalid_mid";

  constructor(message = "Message-ID must be a bare ID, bracketed ID, or neomd://mid URI") {
    super(message);
    this.name = "MidError";
  }
}

export function parseMessageId(input: string): string {
  let value = input.trim();
  if (!value) throw new MidError();

  if (/^neomd:\/\//i.test(value)) {
    if (!/^neomd:\/\/mid\//i.test(value)) throw new MidError();
    try {
      const uri = new URL(value);
      if (uri.protocol.toLowerCase() !== "neomd:" || uri.hostname.toLowerCase() !== "mid" || !uri.pathname.slice(1)) throw new MidError();
      value = decodeURIComponent(uri.pathname.slice(1));
    } catch (error) {
      if (error instanceof MidError) throw error;
      throw new MidError("The neomd Message-ID URI is not valid");
    }
  } else {
    try {
      value = decodeURIComponent(value);
    } catch {
      throw new MidError("The Message-ID contains invalid URL encoding");
    }
  }

  value = value.trim();
  if (value.startsWith("<") || value.endsWith(">")) {
    if (!value.startsWith("<") || !value.endsWith(">")) throw new MidError();
    value = value.slice(1, -1);
  }
  if (!value || /[\s<>"\r\n]/.test(value)) throw new MidError();
  return `<${value}>`;
}
