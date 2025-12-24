import { BunPackage } from "../builder/bun-package.js";

await BunPackage.create({
	bin: {
		"src/cli/index.ts": "bin/cli.js",
	},
	packageJson({ pkg, target }) {
		// Scope the package name for GitHub Packages
		if (target.registry === "https://npm.pkg.github.com/") {
			pkg.name = "@spencerbeggs/claude-binary-plugin";
		}

		return pkg;
	},
});
