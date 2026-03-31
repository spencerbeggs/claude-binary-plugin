import plugin from "./plugin.config.js";

const result = await plugin.build({
	rootDir: import.meta.dir,
});

if (!result.success) {
	console.error("Build failed:", result.output);
	process.exit(1);
}

console.log(`Built: ${result.output} (${result.duration}ms)`);
