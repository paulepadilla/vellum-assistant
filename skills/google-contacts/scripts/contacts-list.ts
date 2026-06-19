#!/usr/bin/env bun

interface ToolContext {
  workingDir?: string;
  conversationId?: string;
}

interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

interface GooglePerson {
  resourceName?: string;
  names?: Array<{ displayName?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string }>;
}

interface ConnectionsResponse {
  connections?: GooglePerson[];
  nextPageToken?: string;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string): never {
  printJson({ ok: false, error: message });
  process.exit(1);
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

async function googleRequest<T>(url: string, account?: string): Promise<T> {
  const command = [
    "assistant",
    "oauth",
    "request",
    "--provider",
    "google",
    ...(account ? ["--account", account] : []),
    url,
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

  let response: { ok: boolean; status: number; body: T | { error?: unknown } };
  try {
    response = JSON.parse(stdout);
  } catch {
    throw new Error(`Could not parse Google Contacts response: ${stdout}`);
  }

  if (!response.ok) {
    throw new Error(
      `Google Contacts request failed (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }
  return response.body as T;
}

function simplifyContacts(
  people: GooglePerson[],
  query: string | undefined,
  maxResults: number,
) {
  const normalizedQuery = query?.trim().toLocaleLowerCase();
  return people
    .map((person) => ({
      resourceName: person.resourceName,
      name: person.names?.[0]?.displayName ?? "",
      emailAddresses: (person.emailAddresses ?? [])
        .map((email) => ({ value: email.value, type: email.type }))
        .filter((email) => Boolean(email.value)),
    }))
    .filter((contact) => {
      if (!normalizedQuery) return true;
      return (
        contact.name.toLocaleLowerCase().includes(normalizedQuery) ||
        contact.emailAddresses.some((email) =>
          email.value?.toLocaleLowerCase().includes(normalizedQuery),
        )
      );
    })
    .slice(0, maxResults);
}

async function listContacts(input: {
  maxResults?: unknown;
  query?: string;
  account?: string;
}) {
  const maxResults = parseMaxResults(input.maxResults);
  const params = new URLSearchParams({
    personFields: "names,emailAddresses",
    pageSize: String(input.query ? 1000 : maxResults),
    sortOrder: "LAST_MODIFIED_DESCENDING",
  });
  const response = await googleRequest<ConnectionsResponse>(
    `https://people.googleapis.com/v1/people/me/connections?${params.toString()}`,
    input.account,
  );
  return {
    contacts: simplifyContacts(
      response.connections ?? [],
      input.query,
      maxResults,
    ),
    nextPageToken: response.nextPageToken,
  };
}

export async function run(
  input: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolExecutionResult> {
  try {
    const data = await listContacts({
      maxResults: input.max_results,
      query: typeof input.query === "string" ? input.query : undefined,
      account: typeof input.account === "string" ? input.account : undefined,
    });
    const hasMore = Boolean(data.nextPageToken);
    return {
      content: JSON.stringify({
        contacts: data.contacts,
        hasMore,
        countWarning: hasMore
          ? "This is a limited page of search results, not an exact total. Do not count the returned contacts or present them as exact bulk-action counts."
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
  const data = await listContacts({
    maxResults: optionalString(args, "max-results"),
    query: optionalString(args, "query"),
    account: optionalString(args, "account"),
  });
  printJson({ ok: true, data });
}

if (import.meta.main) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
