export enum WizardStep {
	Name = "name",
	Directory = "directory",
	Type = "type",
	Prefix = "prefix",
	Description = "description",
	Author = "author",
	GithubOwner = "githubOwner",
	License = "license",
	Hooks = "hooks",
	Features = "features",
	Summary = "summary",
	Scaffold = "scaffold",
}

export interface WizardState {
	name: string;
	directory: string;
	type: "plugin" | "marketplace";
	prefix: string;
	description: string;
	authorName: string;
	authorEmail: string;
	githubOwner: string;
	license: string;
	hooks: string[];
	includeCommands: boolean;
	includeOtel: boolean;
	includeLintStaged: boolean;
	includeCommitlint: boolean;
	includeChangesets: boolean;
}

/** Ordered step sequence */
export const STEP_ORDER: WizardStep[] = [
	WizardStep.Name,
	WizardStep.Directory,
	WizardStep.Type,
	WizardStep.Prefix,
	WizardStep.Description,
	WizardStep.Author,
	WizardStep.GithubOwner,
	WizardStep.License,
	WizardStep.Hooks,
	WizardStep.Features,
	WizardStep.Summary,
	WizardStep.Scaffold,
];
