#!/usr/bin/env bun
import { basename } from "node:path";
import { existsSync } from "node:fs";

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

async function uploadFile(input: {
  localPath: string;
  name?: string;
  parentId?: string;
  account?: string;
}): Promise<any> {
  if (!existsSync(input.localPath)) {
    throw new Error(`Local file not found: ${input.localPath}`);
  }

  const fileName = input.name || basename(input.localPath);

  // Step 1: Create file metadata
  const metadata: Record<string, any> = {
    name: fileName,
  };
  if (input.parentId) {
    metadata.parents = [input.parentId];
  }

  const createCommand = [
    "assistant",
    "oauth",
    "request",
    "--provider",
    "google",
    ...(input.account ? ["--account", input.account] : []),
    "-X", "POST",
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify(metadata),
    "https://www.googleapis.com/drive/v3/files",
    "--json",
  ];

  const createResult = Bun.spawn(createCommand, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const createStdout = await new Response(createResult.stdout).text();
  const createStderr = await new Response(createResult.stderr).text();
  const createExitCode = await createResult.exited;

  if (createExitCode !== 0) {
    throw new Error(
      `Failed to create Google Drive metadata (exit ${createExitCode}): ${createStderr || createStdout}`,
    );
  }

  let createResponse: {
    ok: boolean;
    status: number;
    body: any;
  };
  try {
    createResponse = JSON.parse(createStdout);
  } catch {
    throw new Error(`Could not parse Google Drive create metadata response: ${createStdout}`);
  }

  if (!createResponse.ok) {
    throw new Error(
      `Google Drive metadata creation failed (${createResponse.status}): ${JSON.stringify(createResponse.body)}`,
    );
  }

  const fileId = createResponse.body.id;

  // Step 2: Upload file content using media upload PATCH
  const uploadCommand = [
    "assistant",
    "oauth",
    "request",
    "--provider",
    "google",
    ...(input.account ? ["--account", input.account] : []),
    "-X", "PATCH",
    "-d", `@${input.localPath}`,
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    "--json",
  ];

  const uploadResult = Bun.spawn(uploadCommand, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const uploadStdout = await new Response(uploadResult.stdout).text();
  const uploadStderr = await new Response(uploadResult.stderr).text();
  const uploadExitCode = await uploadResult.exited;

  if (uploadExitCode !== 0) {
    throw new Error(
      `Failed to upload file content to Google Drive (exit ${uploadExitCode}): ${uploadStderr || uploadStdout}`,
    );
  }

  let uploadResponse: {
    ok: boolean;
    status: number;
    body: any;
  };
  try {
    uploadResponse = JSON.parse(uploadStdout);
  } catch {
    throw new Error(`Could not parse Google Drive upload content response: ${uploadStdout}`);
  }

  if (!uploadResponse.ok) {
    throw new Error(
      `Google Drive content upload failed (${uploadResponse.status}): ${JSON.stringify(uploadResponse.body)}`,
    );
  }

  return uploadResponse.body;
}

export async function run(
  input: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolExecutionResult> {
  try {
    if (!input.local_path || typeof input.local_path !== "string") {
      throw new Error("local_path is required and must be a string");
    }
    const data = await uploadFile({
      localPath: input.local_path,
      name: typeof input.name === "string" ? input.name : undefined,
      parentId: typeof input.parent_id === "string" ? input.parent_id : undefined,
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
  let localPath = "";
  let name = "";
  let parentId = "";
  let account = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--local-path") localPath = args[++i];
    if (args[i] === "--name") name = args[++i];
    if (args[i] === "--parent-id") parentId = args[++i];
    if (args[i] === "--account") account = args[++i];
  }
  if (!localPath) {
    fail("Usage: drive-upload.ts --local-path <path> [--name <name>] [--parent-id <id>] [--account <email>]");
  }
  const data = await uploadFile({ localPath, name, parentId, account });
  printJson({ ok: true, data });
}

if (import.meta.main) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
