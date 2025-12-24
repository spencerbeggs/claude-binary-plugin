const result = await Bun.build({
	entrypoints: [Bun.fileURLToPath(import.meta.resolve("../../src/cli/index.ts"))],
	outdir: Bun.fileURLToPath(import.meta.resolve("../../bin")),
	target: "bun",
	minify: false,
	naming: "cli.js",
});

if (!result.success) {
	// Exit with error code if build failed
	process.exit(1);
}

const outdir = Bun.fileURLToPath(import.meta.resolve("../../bin"));

// Make the output executable
await Bun.$`chmod +x ${outdir}/cli.js`;
