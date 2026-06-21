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

async function deleteFile(input: {
  fileId: string;
  account?: string;
}): Promise<any> {
  const body = {
    trashed: true,
  };

  const command = [
    "assistant",
    "oauth",
    "request",
    "--provider",
    "google",
    ...(input.account ? ["--account", input.account] : []),
    "-X", "PATCH",
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify(body),
    `https://www.googleapis.com/drive/v3/files/${input.fileId}`,
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
      `Google Drive delete file failed (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }

  return response.body;
}

export async function run(
  input: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolExecutionResult> {
  try {
    if (!input.file_id || typeof input.file_id !== "string") {
      throw new Error("file_id is required and must be a string");
    }
    const data = await deleteFile({
      fileId: input.file_id,
      account: typeof input.account === "string" ? input.account : undefined,
    });
    return {
      content: JSON.stringify({
        ok: true,
        file: data,
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
  let fileId = "";
  let account = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file-id") fileId = args[++i];
    if (args[i] === "--account") account = args[++i];
  }
  if (!fileId) {
    fail("Usage: drive-delete.ts --file-id <file_id> [--account <email>]");
  }
  const data = await deleteFile({ fileId, account });
  printJson({ ok: true, data });
}

if (import.meta.main) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
