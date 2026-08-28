import type { InferHandlers } from "claude-binary-plugin";
import { PluginConfig } from "claude-binary-plugin";
import { Schema } from "effect";
import { PluginState } from "./plugin.state.js";

class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
	prefix: Schema.Literal("TEST_PLUGIN"),
}) {
	static readonly options = Schema.Struct({
		MODE: Schema.optionalWith(Schema.Literal("strict", "lenient"), {
			default: () => "strict" as const,
		}),
		MAX_RETRIES: Schema.optionalWith(Schema.Number, {
			default: () => 3,
		}),
	});
	static readonly state = PluginState;
	static readonly setup = async () => {
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
	};
}

export type Handlers = InferHandlers<typeof TestConfig>;
export default TestConfig;
