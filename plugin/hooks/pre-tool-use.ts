import type { PreToolUsePipeline } from "claude-binary-plugin";

const handler: PreToolUsePipeline<Record<string, never>> = ({ input }) => {
	const timestamp = new Date().toISOString();
	const toolName = input.tool_name;

	return {
		status: "executed" as const,
		action: "allow" as const,
		summary: `test-plugin observed ${toolName}`,
		additionalContext: `[test-plugin ${timestamp}] Tool: ${toolName}`,
	};
};

export default handler;
