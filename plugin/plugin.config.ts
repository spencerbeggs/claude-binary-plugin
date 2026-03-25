import { ClaudeBinaryPlugin } from "claude-binary-plugin";

export default ClaudeBinaryPlugin.create({
	prefix: "TEST_PLUGIN",
	setup: () => {
		return {
			foo: 1,
		};
	},
	hooks: {
		SessionStart: [{ name: "init", pipeline: "./hooks/session-start.ts" }],
		PreToolUse: [{ name: "observe", pipeline: "./hooks/pre-tool-use.ts" }],
	},
});
