import { MultiSelect } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";

interface HooksStepProps {
	defaultValue: string[];
	onSubmit: (value: string[]) => void;
}

const HOOK_OPTIONS = [
	{ label: "SessionStart (recommended \u2014 inject project context)", value: "SessionStart" },
	{ label: "SessionEnd (cleanup on session end)", value: "SessionEnd" },
	{ label: "PreToolUse (filter tool calls)", value: "PreToolUse" },
	{ label: "PostToolUse (respond after tool execution)", value: "PostToolUse" },
	{ label: "Stop (guard against premature stops)", value: "Stop" },
	{ label: "SubagentStop (guard subagent stops)", value: "SubagentStop" },
	{ label: "UserPromptSubmit (validate user prompts)", value: "UserPromptSubmit" },
	{ label: "Notification (observe notifications)", value: "Notification" },
	{ label: "PermissionRequest (auto-allow/deny permissions)", value: "PermissionRequest" },
	{ label: "PreCompact (observe context compaction)", value: "PreCompact" },
];

export function HooksStep({ defaultValue, onSubmit }: HooksStepProps): React.ReactElement {
	return (
		<Box flexDirection="column">
			<Text bold>Which hooks do you want to include?</Text>
			<Text dimColor>(Space to toggle, Enter to confirm)</Text>
			<MultiSelect
				options={HOOK_OPTIONS}
				defaultValue={defaultValue}
				onSubmit={(values) => {
					// SessionStart is always required for cross-platform distribution
					if (!values.includes("SessionStart")) {
						values.unshift("SessionStart");
					}
					onSubmit(values);
				}}
			/>
		</Box>
	);
}
