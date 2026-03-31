import { ClaudePlugin } from "claude-binary-plugin";
import preToolUseHandler from "./hooks/pre-tool-use.js";
import sessionStartHandler from "./hooks/session-start.js";
import TestConfig from "./plugin.config.js";

const plugin = new ClaudePlugin(TestConfig, {
	SessionStart: [{ name: "init", pipeline: sessionStartHandler }],
	PreToolUse: [{ name: "guard", pipeline: preToolUseHandler }],
});

const result = await plugin.build({
	rootDir: import.meta.dir,
});

if (!result.success) {
	console.error("Build failed:", result.output);
	process.exit(1);
}
console.log(`Built: ${result.output} (${result.duration}ms)`);
