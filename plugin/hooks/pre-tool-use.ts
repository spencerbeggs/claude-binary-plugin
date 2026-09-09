import { Allow, Deny, Modify } from "claude-binary-plugin";
import type { Handlers } from "../plugin.config.js";

const handler: Handlers["PreToolUse"] = ({ input, options, state }) => {
	// In strict mode, deny destructive bash commands
	if (options.MODE === "strict" && input.tool_name === "Bash") {
		const command = (input.tool_input as { command?: string }).command ?? "";
		if (command.includes("rm -rf")) {
			return new Deny({
				summary: "blocked destructive command",
				reason: `Destructive command "${command}" is not allowed in strict mode`,
			});
		}
	}

	// Demo: modify Write tool to add a header comment
	if (input.tool_name === "Write") {
		const toolInput = input.tool_input as { file_path?: string; content?: string };
		if (toolInput.file_path?.endsWith(".ts") && toolInput.content) {
			return new Modify({
				summary: `added header to ${toolInput.file_path}`,
				updatedInput: {
					file_path: toolInput.file_path,
					content: `// Generated with ${state.getPmExec()}\n${toolInput.content}`,
				},
			});
		}
	}

	return new Allow({ summary: `allowed ${input.tool_name}` });
};

export default handler;
