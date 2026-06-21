#!/usr/bin/env bun

interface ToolContext {
  workingDir?: string;
  conversationId?: string;
}

interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string): never {
  printJson({ ok: false, error: message });
  process.exit(1);
}

async function createFolder(input: {
  name: string;
  parentId?: string;
  account?: string;
}): Promise<any> {
  const body: Record<string, any> = {
    name: input.name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (input.parentId) {
    body.parents = [input.parentId];
  }

  const command = [
    "assistant",
    "oauth",
    "request",
    "--provider",
    "google",
    ...(input.account ? ["--account", input.account] : []),
    "-X", "POST",
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify(body),
    "https://www.googleapis.com/drive/v3/files",
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
    body: any;
  };
  try {
    response = JSON.parse(stdout);
  } catch {
    throw new Error(`Could not parse Google Drive response: ${stdout}`);
  }

  if (!response.ok) {
    throw new Error(
      `Google Drive create folder failed (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }

  return response.body;
}

export async function run(
  input: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolExecutionResult> {
  try {
    if (!input.name || typeof input.name !== "string") {
      throw new Error("name is required and must be a string");
    }
    const data = await createFolder({
      name: input.name,
      parentId: typeof input.parent_id === "string" ? input.parent_id : undefined,
      account: typeof input.account === "string" ? input.account : undefined,
    });
    return {
      content: JSON.stringify({
        ok: true,
        folder: data,
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
  const args = process.argv.slice(2);
  let name = "";
  let parentId = "";
  let account = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name") name = args[++i];
    if (args[i] === "--parent-id") parentId = args[++i];
    if (args[i] === "--account") account = args[++i];
  }
  if (!name) {
    fail("Usage: drive-create-folder.ts --name <folder_name> [--parent-id <id>] [--account <email>]");
  }
  const data = await createFolder({ name, parentId, account });
  printJson({ ok: true, data });
}

if (import.meta.main) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
