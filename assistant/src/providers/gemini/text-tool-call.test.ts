import { describe, expect, test } from "bun:test";

import { parseGeminiTextToolCall } from "./text-tool-call.js";

describe("parseGeminiTextToolCall", () => {
  test("parses skill_load keyword arguments", () => {
    expect(
      parseGeminiTextToolCall(
        "tool_code\nprint(default_api.skill_load(skill='google-drive', activity='Loading Drive'))",
        new Set(["skill_load"]),
      ),
    ).toEqual({
      name: "skill_load",
      args: { skill: "google-drive", activity: "Loading Drive" },
    });
  });

  test("parses nested skill_execute input", () => {
    expect(
      parseGeminiTextToolCall(
        "tool_code\nprint(default_api.skill_execute(tool='google_drive_list', input={'max_results': 5, 'enabled': True, 'filters': ['recent', None]}, activity='Listing files'))",
        new Set(["skill_execute"]),
      ),
    ).toEqual({
      name: "skill_execute",
      args: {
        tool: "google_drive_list",
        input: {
          max_results: 5,
          enabled: true,
          filters: ["recent", null],
        },
        activity: "Listing files",
      },
    });
  });

  test("parses the assistant tool wrapper emitted by Gemini", () => {
    expect(
      parseGeminiTextToolCall(
        'tool_code\nprint(assistant.skill_execute(tool = "google_contacts_list", input = {"max_results": 5}))',
        new Set(["skill_execute"]),
      ),
    ).toEqual({
      name: "skill_execute",
      args: {
        tool: "google_contacts_list",
        input: { max_results: 5 },
      },
    });
  });

  test("rejects an assistant-wrapped tool that was not supplied", () => {
    expect(
      parseGeminiTextToolCall(
        'tool_code\nprint(assistant.skill_execute(tool = "google_contacts_list", input = {"max_results": 5}))',
        new Set(["skill_load"]),
      ),
    ).toBeUndefined();
  });

  test("maps Gemini's Google Contacts namespace to skill_execute", () => {
    expect(
      parseGeminiTextToolCall(
        "tool_code\nprint(google_contacts.list(max_results=5))",
        new Set(["skill_execute"]),
      ),
    ).toEqual({
      name: "skill_execute",
      args: {
        tool: "google_contacts_list",
        input: { max_results: 5 },
        activity: "Listing Google contacts",
      },
    });
  });

  test("rejects the Google Contacts namespace without skill_execute", () => {
    expect(
      parseGeminiTextToolCall(
        "tool_code\nprint(google_contacts.list(max_results=5))",
        new Set(["skill_load"]),
      ),
    ).toBeUndefined();
  });

  test("rejects tools that were not supplied to Gemini", () => {
    expect(
      parseGeminiTextToolCall(
        "tool_code\nprint(default_api.unknown_tool(value='x'))",
        new Set(["skill_execute"]),
      ),
    ).toBeUndefined();
  });

  test("leaves ordinary text untouched", () => {
    expect(
      parseGeminiTextToolCall(
        "Here is an example: default_api.skill_execute(...)",
        new Set(["skill_execute"]),
      ),
    ).toBeUndefined();
  });
});
