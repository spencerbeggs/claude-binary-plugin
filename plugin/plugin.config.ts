import type { InferHandlers } from "claude-binary-plugin";
import { Plugin } from "claude-binary-plugin";
import { Schema } from "effect";
import { PluginState } from "./state.js";

class TestPlugin extends Plugin("TEST_PLUGIN", {
	options: Schema.Struct({
		MODE: Schema.optionalWith(Schema.Literal("strict", "lenient"), {
			default: () => "strict" as const,
		}),
		MAX_RETRIES: Schema.optionalWith(Schema.Number, {
			default: () => 3,
		}),
	}),
	state: PluginState,
	setup: async () => {
		const hasGit = await Bun.$`which git`
			.quiet()
			.nothrow()
			.then((r) => r.exitCode === 0);
		const hasBun = await Bun.$`which bun`
			.quiet()
			.nothrow()
			.then((r) => r.exitCode === 0);
		return new PluginState({
			git: hasGit,
			bun: hasBun,
			packageManager: hasBun ? "bun" : "npm",
		});
	},
	hooks: {
		SessionStart: [{ name: "init", pipeline: "./hooks/session-start.ts" }],
		PreToolUse: [{ name: "guard", pipeline: "./hooks/pre-tool-use.ts" }],
	},
}) {}

export type Handlers = InferHandlers<TestPlugin>;
export default new TestPlugin();
