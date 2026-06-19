import { RiskLevel } from "../../permissions/types.js";
import { registerTool } from "../registry.js";
import type {
  ToolContext,
  ToolDefinition,
  ToolExecutionResult,
} from "../types.js";

export const skillExecuteTool = {
  name: "skill_execute",
  description:
    'Execute a tool provided by an active skill. Use this instead of calling skill tools directly. For Gmail, Google Drive, or Google Contacts listing or search, call `gmail_search_messages`, `google_drive_list`, or `google_contacts_list`; they return a limited page, so `max_results` and the number of returned rows are never exact match counts when `hasMore` is true. Never count those rows by sender or present them as exact bulk-action totals. To create an unsent Gmail draft, call `gmail_create_draft`. These tools are already active and do not require skill_load. Other Gmail tools such as `gmail_scan_sender_digest`, `gmail_archive`, and `gmail_unsubscribe` do not exist as direct skill_execute tools. For inbox cleanup, decluttering, archiving, labels, filters, sending, or unsubscribing, first call `skill_load` with skill `gmail`, then use bash exactly as its loaded instructions specify. Google Calendar is similar: tools named `google_calendar_create_event`, `google_calendar_list_events`, and `google_calendar_delete_event` do not exist; first call `skill_load` with skill `google-calendar`, then follow its bash instructions. Do not ask the user for another method. For unread Gmail inbox messages, pass query `in:inbox is:unread`. Gmail search results already include sender, subject, and date. When drafting to the user\'s own Gmail address, omit `to` or use `to: "self"`. Draft creation never sends the email. Other skill instructions describe their available tools and parameters. For browser automation, use the `assistant browser` CLI commands instead.',
  category: "skills",
  executionTarget: "sandbox",
  defaultRiskLevel: RiskLevel.Low,

  input_schema: {
    type: "object",
    properties: {
      tool: {
        type: "string",
        description:
          "The skill tool name to execute (e.g. 'google_drive_list', 'task_create', 'deploy_run')",
      },
      input: {
        type: "object",
        description:
          "Tool-specific parameters as documented in the skill's instructions. Do not put `activity` inside this object; use the top-level `activity` field.",
      },
      activity: {
        type: "string",
        description:
          "Brief non-technical explanation of what you are doing and why, shown as a progress update.",
      },
    },
    required: ["tool", "input", "activity"],
  },

  async execute(
    _input: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolExecutionResult> {
    return {
      content:
        "skill_execute should be intercepted at session level. If you see this error, the session dispatch is not configured.",
      isError: true,
    };
  },
} satisfies ToolDefinition;

registerTool(skillExecuteTool);
