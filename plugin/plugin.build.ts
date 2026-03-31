import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import { plugin } from "./plugin.config.js";

const result = await ClaudeBinaryPlugin.build(plugin, {
	rootDir: import.meta.dir,
});

if (!result.success) {
	console.error("Build failed:", result.output);
	process.exit(1);
}

console.log(`Built: ${result.output} (${result.duration}ms)`);
