#!/usr/bin/env bun

import { gmailGet, gmailPost } from "./lib/gmail-client.js";
import { toBase64Url } from "./lib/mime-builder.js";

interface ToolContext {
  workingDir?: string;
  conversationId?: string;
}

interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

interface GmailProfile {
  emailAddress: string;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

async function createDraft(input: Record<string, unknown>) {
  const account =
    typeof input.account === "string" ? input.account.trim() : undefined;
  let to = typeof input.to === "string" ? input.to.trim() : "";

  if (!to || /^(?:me|myself|self|my own email(?: address)?)$/i.test(to)) {
    const profile = await gmailGet<GmailProfile>("/profile", undefined, account);
    if (!profile.ok || !profile.data.emailAddress) {
      throw new Error(
        `Could not resolve the connected Gmail address (status ${profile.status})`,
      );
    }
    to = profile.data.emailAddress;
  }

  const subject = requiredString(input, "subject");
  const body = requiredString(input, "body");
  const raw = toBase64Url(
    Buffer.from(
      [
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        body,
      ].join("\r\n"),
      "utf-8",
    ),
  );

  const response = await gmailPost<{ id: string }>(
    "/drafts",
    { message: { raw } },
    account,
  );
  if (!response.ok) {
    throw new Error(`Failed to create Gmail draft (status ${response.status})`);
  }

  return {
    draftId: response.data.id,
    to,
    subject,
    sent: false,
  };
}

export async function run(
  input: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolExecutionResult> {
  try {
    return {
      content: JSON.stringify(await createDraft(input)),
      isError: false,
    };
  } catch (error) {
    return {
      content: error instanceof Error ? error.message : String(error),
      isError: true,
    };
  }
}
