import { BunPackage } from "../builder/bun-package.js";

await BunPackage.create({
	bin: {
		"src/cli/index.ts": "bin/cli.js",
	},
	link: "npm",
	// Install dependencies in dist directories for local linking
	installDeps: false,
	apiModel: {
		path: "../../../website/docs/lib/packages/claude-binary-plugin.api.json",
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
