import { BunLibraryBuilder } from "@savvy-web/bun-builder";

export default BunLibraryBuilder.create({
	transform({ pkg }) {
		delete pkg.devDependencies;
		delete pkg.bundleDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		delete pkg.devEngines;
		return pkg;
	},
	apiModel: {
		enabled: true,
		tsdoc: {
			tagDefinitions: [
				{
					tagName: "@error",
					syntaxKind: "modifier",
				},
				{
					tagName: "@schema",
					syntaxKind: "modifier",
				},
				{
					tagName: "@codec",
					syntaxKind: "modifier",
				},
			],
		},
	},
});
