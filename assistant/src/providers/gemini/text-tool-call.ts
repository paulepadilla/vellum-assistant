interface ParsedTextToolCall {
  name: string;
  args: Record<string, unknown>;
}

class PythonLiteralParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parseKeywordArguments(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.skipWhitespace();
    while (!this.atEnd()) {
      const key = this.parseIdentifier();
      this.skipWhitespace();
      this.expect("=");
      this.skipWhitespace();
      result[key] = this.parseValue();
      this.skipWhitespace();
      if (this.atEnd()) break;
      this.expect(",");
      this.skipWhitespace();
    }
    return result;
  }

  private parseValue(): unknown {
    this.skipWhitespace();
    const current = this.source[this.index];
    if (current === "'" || current === '"') return this.parseString();
    if (current === "{") return this.parseObject();
    if (current === "[") return this.parseArray();
    if (current === "-" || /\d/.test(current ?? "")) return this.parseNumber();

    const identifier = this.parseIdentifier();
    if (identifier === "True" || identifier === "true") return true;
    if (identifier === "False" || identifier === "false") return false;
    if (identifier === "None" || identifier === "null") return null;
    throw new Error(`Unsupported literal: ${identifier}`);
  }

  private parseObject(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.expect("{");
    this.skipWhitespace();
    while (this.source[this.index] !== "}") {
      const key = this.parseString();
      this.skipWhitespace();
      this.expect(":");
      this.skipWhitespace();
      result[key] = this.parseValue();
      this.skipWhitespace();
      if (this.source[this.index] === "}") break;
      this.expect(",");
      this.skipWhitespace();
    }
    this.expect("}");
    return result;
  }

  private parseArray(): unknown[] {
    const result: unknown[] = [];
    this.expect("[");
    this.skipWhitespace();
    while (this.source[this.index] !== "]") {
      result.push(this.parseValue());
      this.skipWhitespace();
      if (this.source[this.index] === "]") break;
      this.expect(",");
      this.skipWhitespace();
    }
    this.expect("]");
    return result;
  }

  private parseString(): string {
    const quote = this.source[this.index];
    if (quote !== "'" && quote !== '"') throw new Error("Expected string");
    this.index++;
    let result = "";
    while (!this.atEnd()) {
      const character = this.source[this.index++];
      if (character === quote) return result;
      if (character !== "\\") {
        result += character;
        continue;
      }
      if (this.atEnd()) throw new Error("Unterminated escape");
      const escaped = this.source[this.index++];
      const replacements: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        "\\": "\\",
        "'": "'",
        '"': '"',
      };
      result += replacements[escaped] ?? escaped;
    }
    throw new Error("Unterminated string");
  }

  private parseNumber(): number {
    const start = this.index;
    if (this.source[this.index] === "-") this.index++;
    while (/\d/.test(this.source[this.index] ?? "")) this.index++;
    if (this.source[this.index] === ".") {
      this.index++;
      while (/\d/.test(this.source[this.index] ?? "")) this.index++;
    }
    const value = Number(this.source.slice(start, this.index));
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  }

  private parseIdentifier(): string {
    const start = this.index;
    if (!/[A-Za-z_]/.test(this.source[this.index] ?? "")) {
      throw new Error("Expected identifier");
    }
    this.index++;
    while (/[A-Za-z0-9_]/.test(this.source[this.index] ?? "")) this.index++;
    return this.source.slice(start, this.index);
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.index] ?? "")) this.index++;
  }

  private expect(value: string): void {
    if (!this.source.startsWith(value, this.index)) {
      throw new Error(`Expected ${value}`);
    }
    this.index += value.length;
  }

  private atEnd(): boolean {
    return this.index >= this.source.length;
  }
}

/**
 * Recover Gemini responses that print a single Python-style tool call instead
 * of returning the native functionCall part requested by the API. Gemini has
 * emitted both `default_api.<tool>` and `assistant.<tool>` wrappers. The
 * grammar is intentionally narrow, requires an API-supplied tool name, and
 * never evaluates model output.
 */
export function parseGeminiTextToolCall(
  text: string,
  allowedToolNames: ReadonlySet<string>,
): ParsedTextToolCall | undefined {
  const trimmed = text.trim();
  const suppliedToolMatch = trimmed.match(
    /^tool_code\s+print\(\s*(?:default_api|assistant)\.([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)\s*\)$/,
  );

  try {
    if (suppliedToolMatch && allowedToolNames.has(suppliedToolMatch[1])) {
      return {
        name: suppliedToolMatch[1],
        args: new PythonLiteralParser(
          suppliedToolMatch[2],
        ).parseKeywordArguments(),
      };
    }

    const contactsMatch = trimmed.match(
      /^tool_code\s+print\(\s*google_contacts\.list\(([\s\S]*)\)\s*\)$/,
    );
    if (contactsMatch && allowedToolNames.has("skill_execute")) {
      return {
        name: "skill_execute",
        args: {
          tool: "google_contacts_list",
          input: new PythonLiteralParser(
            contactsMatch[1],
          ).parseKeywordArguments(),
          activity: "Listing Google contacts",
        },
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
}
