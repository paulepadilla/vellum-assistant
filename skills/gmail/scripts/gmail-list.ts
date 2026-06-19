#!/usr/bin/env bun

/**
 * Read-only Gmail message listing.
 *
 * Returns newest messages in Gmail's API order with selected metadata only.
 */

import { ok, optionalArg, parseArgs, printError } from "./lib/common.js";
import {
  batchFetchMessages,
  gmailGet,
  type GmailMessage,
} from "./lib/gmail-client.js";

interface ToolContext {
  workingDir?: string;
  conversationId?: string;
}

interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

interface ListMessagesResponse {
  messages?: Array<{ id: string; threadId?: string }>;
  resultSizeEstimate?: number;
  nextPageToken?: string;
}

function header(message: GmailMessage, name: string): string {
  return (
    message.payload?.headers?.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function parseMaxResults(value: string | undefined): number {
  if (value === undefined) return 5;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("--max-results must be an integer from 1 to 100");
  }
  return parsed;
}

async function listMessages(input: {
  maxResults?: string;
  query?: string;
  account?: string;
}) {
  const maxResults = parseMaxResults(input.maxResults);
  const listResponse = await gmailGet<ListMessagesResponse>(
    "/messages",
    {
      maxResults: String(maxResults),
      ...(input.query ? { q: input.query } : {}),
    },
    input.account,
  );

  if (!listResponse.ok) {
    throw new Error(
      `Gmail list request failed (${listResponse.status}): ${JSON.stringify(listResponse.data)}`,
    );
  }

  const ids = (listResponse.data.messages ?? []).map((message) => message.id);
  if (ids.length === 0) {
    return {
      messages: [],
      returnedCount: 0,
      resultSizeEstimate: 0,
      hasMore: false,
      exactCount: true,
    };
  }

  const messages = await batchFetchMessages(
    ids,
    "metadata",
    ["From", "Subject", "Date"],
    input.account,
  );

  return {
    messages: messages.map((message) => ({
      id: message.id,
      threadId: message.threadId,
      from: header(message, "From"),
      subject: header(message, "Subject"),
      date: header(message, "Date"),
      internalDate: message.internalDate,
    })),
    returnedCount: messages.length,
    resultSizeEstimate: listResponse.data.resultSizeEstimate ?? ids.length,
    hasMore: Boolean(listResponse.data.nextPageToken),
    exactCount: !listResponse.data.nextPageToken,
    countWarning: listResponse.data.nextPageToken
      ? "This is a limited page of search results, not an exact total. Do not count the returned messages by sender or present them as exact bulk-action counts."
      : undefined,
  };
}

export async function run(
  input: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolExecutionResult> {
  try {
    return {
      content: JSON.stringify(
        await listMessages({
          maxResults:
            input.max_results === undefined
              ? undefined
              : String(input.max_results),
          query: typeof input.query === "string" ? input.query : undefined,
          account: typeof input.account === "string" ? input.account : undefined,
        }),
      ),
      isError: false,
    };
  } catch (error) {
    return {
      content: error instanceof Error ? error.message : String(error),
      isError: true,
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  ok(
    await listMessages({
      maxResults: optionalArg(args, "max-results"),
      query: optionalArg(args, "query"),
      account: optionalArg(args, "account"),
    }),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    printError(error instanceof Error ? error.message : String(error));
  });
}
