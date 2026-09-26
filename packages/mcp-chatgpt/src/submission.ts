import { MCP_TOOL_METADATA, type McpToolName } from "./tool-metadata";

/**
 * App-level information for the ChatGPT submission manifest.
 * Override defaults via environment variables or pass directly.
 */
export interface ChatGPTAppInfo {
  displayName: string;
  subtitle: string;
  description: string;
  category: string;
  testCases?: ChatGPTTestCase[];
  negativeTestCases?: ChatGPTTestCase[];
}

export interface ChatGPTTestCase {
  description: string;
  user_prompt: string;
  file_attachment_urls: null;
  tools_triggered: string | null;
  expected_output: string;
  expected_output_url: null;
}

export interface ChatGPTSubmission {
  $schema: string;
  schema_version: number;
  app_info: {
    display_name: string;
    subtitle: string;
    description: string;
    category: string;
  };
  tools: Record<
    string,
    {
      annotations: {
        readOnlyHint: boolean;
        openWorldHint: boolean;
        destructiveHint: boolean;
        idempotentHint?: boolean;
      };
      justifications: {
        read_only_justification: string;
        open_world_justification: string;
        destructive_justification: string;
      };
    }
  >;
  test_cases: ChatGPTTestCase[];
  negative_test_cases: ChatGPTTestCase[];
}

/**
 * Default test cases for the `show_content` widget tool.
 */
const DEFAULT_TEST_CASES: ChatGPTTestCase[] = [
  {
    description: "Display homepage content for the authenticated user.",
    user_prompt: "Show me the homepage content.",
    file_attachment_urls: null,
    tools_triggered: "show_content",
    expected_output:
      "Returns the rendered homepage content with the user's name embedded.",
    expected_output_url: null,
  },
  {
    description: "Display personalised content with a custom name.",
    user_prompt: "Show the content page for Alice.",
    file_attachment_urls: null,
    tools_triggered: "show_content",
    expected_output:
      'Returns the homepage content widget with "Alice" as the display name and a current timestamp.',
    expected_output_url: null,
  },
];

const DEFAULT_NEGATIVE_TEST_CASES: ChatGPTTestCase[] = [
  {
    description: "Do not trigger for requests to modify site content.",
    user_prompt: 'Update the homepage hero text to say "Welcome back".',
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "The app should not be invoked because the MCP tools only read and display content — they do not write or modify it.",
    expected_output_url: null,
  },
  {
    description: "Do not trigger for unrelated third-party service requests.",
    user_prompt: "Post a tweet announcing our new feature launch.",
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output:
      "The app should not be invoked because the MCP tools do not interact with external social platforms.",
    expected_output_url: null,
  },
];

/**
 * Dynamically generate a ChatGPT app submission manifest.
 *
 * The `tools` section is built entirely from `MCP_TOOL_METADATA`, so it stays
 * in sync automatically whenever tools are added or hints are updated —
 * no manual duplication required.
 *
 * By default only ChatGPT-facing tools (i.e. those intended for end-users) are
 * included. Admin-only tools are excluded via the `excludeTools` option.
 */
type SubmissionToolEntry = ChatGPTSubmission["tools"][string];

function buildToolEntry(
  metadata: (typeof MCP_TOOL_METADATA)[McpToolName],
): SubmissionToolEntry {
  const { annotations, justifications } = metadata;
  return {
    annotations: {
      readOnlyHint: annotations.readOnlyHint,
      openWorldHint: annotations.openWorldHint,
      destructiveHint: annotations.destructiveHint,
      ...(annotations.idempotentHint !== undefined
        ? { idempotentHint: annotations.idempotentHint }
        : {}),
    },
    justifications: {
      read_only_justification: justifications.read_only_justification,
      open_world_justification: justifications.open_world_justification,
      destructive_justification: justifications.destructive_justification,
    },
  };
}

export function generateChatGPTSubmission(
  appInfo: ChatGPTAppInfo,
  options: {
    /** Tool names to exclude from the submission (e.g. admin-only tools). */
    excludeTools?: McpToolName[];
  } = {},
): ChatGPTSubmission {
  const excluded = new Set<string>(options.excludeTools ?? []);

  const tools: ChatGPTSubmission["tools"] = {};
  for (const [name, metadata] of Object.entries(MCP_TOOL_METADATA) as [
    McpToolName,
    (typeof MCP_TOOL_METADATA)[McpToolName],
  ][]) {
    if (!excluded.has(name)) {
      tools[name] = buildToolEntry(metadata);
    }
  }

  return {
    $schema:
      "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json",
    schema_version: 1,
    app_info: {
      display_name: appInfo.displayName,
      subtitle: appInfo.subtitle,
      description: appInfo.description,
      category: appInfo.category,
    },
    tools,
    test_cases: appInfo.testCases ?? DEFAULT_TEST_CASES,
    negative_test_cases:
      appInfo.negativeTestCases ?? DEFAULT_NEGATIVE_TEST_CASES,
  };
}
