import type { PreToolUsePipeline } from "claude-binary-plugin";

const handler: PreToolUsePipeline<Record<string, never>> = ({ input }) => {
	const timestamp = new Date().toISOString();
	const toolName = input.tool_name;

	return {
		foo: 1,
		status: "executed",
		action: "allow",
		summary: `test-plugin observed ${toolName}`,
		additionalContext: `[test-plugin ${timestamp}] Tool: ${toolName}`,
	};
};

export default handler;
