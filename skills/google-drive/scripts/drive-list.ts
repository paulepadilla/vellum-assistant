#!/usr/bin/env bun

interface ToolContext {
  workingDir?: string;
  conversationId?: string;
}

interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
}

interface DriveListResponse {
  files?: DriveFile[];
  nextPageToken?: string;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string): never {
  printJson({ ok: false, error: message });
  process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index++;
    }
  }
  return result;
}

function optionalString(
  args: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function parseMaxResults(value: unknown): number {
  if (value === undefined) return 5;
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("max_results must be an integer from 1 to 100");
  }
  return parsed;
}

function escapeDriveQuery(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function listDriveFiles(input: {
  maxResults?: unknown;
  query?: string;
  account?: string;
}): Promise<DriveListResponse> {
  const maxResults = parseMaxResults(input.maxResults);
  const query = input.query;
  const account = input.account;
  const driveQuery = [
    "trashed = false",
    ...(query
      ? [`fullText contains '${escapeDriveQuery(query)}'`]
      : []),
  ].join(" and ");

  const params = new URLSearchParams({
    pageSize: String(maxResults),
    orderBy: "modifiedTime desc",
    q: driveQuery,
    fields:
      "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners(displayName,emailAddress))",
    spaces: "drive",
  });

  const command = [
    "assistant",
    "oauth",
    "request",
    "--provider",
    "google",
    ...(account ? ["--account", account] : []),
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    "--json",
  ];

  const processResult = Bun.spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(processResult.stdout).text();
  const stderr = await new Response(processResult.stderr).text();
  const exitCode = await processResult.exited;

  if (exitCode !== 0) {
    throw new Error(
      `assistant oauth request failed (exit ${exitCode}): ${stderr || stdout}`,
    );
  }

  let response: {
    ok: boolean;
    status: number;
    body: DriveListResponse | { error?: unknown };
  };
  try {
    response = JSON.parse(stdout);
  } catch {
    throw new Error(`Could not parse Google Drive response: ${stdout}`);
  }

  if (!response.ok) {
    throw new Error(
      `Google Drive list request failed (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }

  return response.body as DriveListResponse;
}

export async function run(
  input: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolExecutionResult> {
  try {
    const data = await listDriveFiles({
      maxResults: input.max_results,
      query: typeof input.query === "string" ? input.query : undefined,
      account: typeof input.account === "string" ? input.account : undefined,
    });
    const hasMore = Boolean(data.nextPageToken);
    return {
      content: JSON.stringify({
        files: data.files ?? [],
        orderedBy: "modifiedTime desc",
        hasMore,
        countWarning: hasMore
          ? "This is a limited page of search results, not an exact total. Do not count the returned files or present them as exact bulk-action counts."
          : undefined,
        nextPageToken: data.nextPageToken,
      }),
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
  const data = await listDriveFiles({
    maxResults: optionalString(args, "max-results"),
    query: optionalString(args, "query"),
    account: optionalString(args, "account"),
  });
  printJson({
    ok: true,
    data: {
      files: data.files ?? [],
      orderedBy: "modifiedTime desc",
      nextPageToken: data.nextPageToken,
    },
  });
}

if (import.meta.main) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
