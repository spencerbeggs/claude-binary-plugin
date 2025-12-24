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
		delete pkg.devDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		delete pkg.packageManager;
		delete pkg.devEngines;
		return pkg;
	},
});
