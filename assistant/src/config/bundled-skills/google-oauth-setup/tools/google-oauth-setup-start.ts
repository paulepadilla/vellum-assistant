import type {
  ToolContext,
  ToolExecutionResult,
} from "../../../../tools/types.js";
import { getLogger } from "../../../../util/logger.js";

const log = getLogger("google-oauth-setup");

export async function run(
  _input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult> {
  log.info("Starting automated Google OAuth setup via browser");

  // 1. Send an inline completion event to acknowledge the tool started
  if (context.sendToClient) {
    context.sendToClient({
      type: "ui_surface_complete",
      conversationId: context.conversationId,
      surfaceId: "google-oauth-setup-start",
      summary: "Browser session started",
    });
  }

  // 2. Return a successful intent to the LLM so it knows it should now
  // start observing the screen and guiding the user.
  // Note: We instruct the LLM to use the browser_navigate tool itself.
  return {
    content:
      "Please open the browser using the 'browser_navigate' tool to 'https://console.cloud.google.com/projectcreate' with 'browser_mode: \"host_browser\"'. Instruct the user to name the project 'Vellum Assistant' and wait for them to finish, or guide them through the next steps using the browser snapshot.",
    isError: false,
  };
}
