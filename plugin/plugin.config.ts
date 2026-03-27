import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import { Schema } from "effect";

export default ClaudeBinaryPlugin.create({
	prefix: "TEST_PLUGIN",
	options: Schema.Struct({
		foo: Schema.Number,
	}),
	hooks: {
		SessionStart: [{ name: "init", pipeline: "./hooks/session-start.ts" }],
		PreToolUse: [{ name: "observe", pipeline: "./hooks/pre-tool-use.ts" }],
	},
});
