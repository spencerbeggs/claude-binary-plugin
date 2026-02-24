import { ThemeProvider } from "@inkjs/ui";
import { Box } from "ink";
import type React from "react";
import { useCallback, useState } from "react";
import type { ScaffoldConfig } from "../scaffold.js";
import { scaffold } from "../scaffold.js";
import { toScreamingSnake } from "../templates/shared.js";
import { CompletedStep } from "./CompletedStep.js";
import { Header } from "./Header.js";
import { useGitDefaults } from "./hooks/useGitDefaults.js";
import { ScaffoldProgress } from "./ScaffoldProgress.js";
import { AuthorStep } from "./steps/AuthorStep.js";
import { DescriptionStep } from "./steps/DescriptionStep.js";
import { DirectoryStep } from "./steps/DirectoryStep.js";
import { FeaturesStep } from "./steps/FeaturesStep.js";
import { GithubOwnerStep } from "./steps/GithubOwnerStep.js";
import { HooksStep } from "./steps/HooksStep.js";
import { LicenseStep } from "./steps/LicenseStep.js";
import { NameStep } from "./steps/NameStep.js";
import { PrefixStep } from "./steps/PrefixStep.js";
import { SummaryStep } from "./steps/SummaryStep.js";
import { TypeStep } from "./steps/TypeStep.js";
import { wizardTheme } from "./theme.js";
import type { WizardState } from "./types.js";
import { STEP_ORDER, WizardStep } from "./types.js";

interface AppProps {
	defaults: Partial<ScaffoldConfig>;
	onComplete: () => void;
}

interface Phase {
	name: string;
	status: "pending" | "active" | "done";
}

export function App({ defaults, onComplete }: AppProps): React.ReactElement {
	const gitDefaults = useGitDefaults();
	const [currentStep, setCurrentStep] = useState(WizardStep.Name);
	const [state, setState] = useState<WizardState>({
		name: defaults.name ?? "",
		directory: defaults.directory ?? "",
		type: (defaults.type ?? "plugin") as "plugin" | "marketplace",
		prefix: defaults.prefix ?? "",
		description: defaults.description ?? "",
		authorName: defaults.author?.name ?? "",
		authorEmail: defaults.author?.email ?? "",
		githubOwner: defaults.githubOwner ?? "",
		license: defaults.license ?? "MIT",
		hooks: defaults.hooks ?? ["SessionStart", "PreToolUse"],
		includeCommands: defaults.includeCommands ?? true,
		includeOtel: defaults.includeOtel ?? false,
		includeLintStaged: defaults.includeLintStaged ?? true,
		includeCommitlint: defaults.includeCommitlint ?? true,
		includeChangesets: defaults.includeChangesets ?? true,
	});
	const [phases, setPhases] = useState<Phase[]>([]);

	// Track which steps have been completed
	const completedStepIndex = STEP_ORDER.indexOf(currentStep);
	const completedSteps = STEP_ORDER.slice(0, completedStepIndex);

	const advanceStep = useCallback(() => {
		const currentIndex = STEP_ORDER.indexOf(currentStep);
		const nextStep = STEP_ORDER[currentIndex + 1];
		if (currentIndex < STEP_ORDER.length - 1 && nextStep !== undefined) {
			setCurrentStep(nextStep);
		}
	}, [currentStep]);

	const getStepDisplay = (step: WizardStep): { label: string; value: string } => {
		switch (step) {
			case WizardStep.Name:
				return { label: "Name", value: state.name };
			case WizardStep.Directory:
				return { label: "Directory", value: state.directory };
			case WizardStep.Type:
				return {
					label: "Type",
					value: state.type === "marketplace" ? "Marketplace" : "Single Plugin",
				};
			case WizardStep.Prefix:
				return { label: "Prefix", value: state.prefix };
			case WizardStep.Description:
				return { label: "Description", value: state.description || "(none)" };
			case WizardStep.Author:
				return {
					label: "Author",
					value: state.authorName
						? `${state.authorName}${state.authorEmail ? ` <${state.authorEmail}>` : ""}`
						: "(none)",
				};
			case WizardStep.GithubOwner:
				return { label: "GitHub", value: state.githubOwner || "(none)" };
			case WizardStep.License:
				return { label: "License", value: state.license };
			case WizardStep.Hooks:
				return { label: "Hooks", value: state.hooks.join(", ") };
			case WizardStep.Features: {
				const features = [state.includeCommands ? "commands" : "", state.includeOtel ? "otel" : ""].filter(Boolean);
				const tooling = [
					state.includeLintStaged ? "lint-staged" : "",
					state.includeCommitlint ? "commitlint" : "",
					state.includeChangesets ? "changesets" : "",
				].filter(Boolean);
				const all = [...features, ...tooling];
				return { label: "Features", value: all.length > 0 ? all.join(", ") : "(none)" };
			}
			default:
				return { label: "", value: "" };
		}
	};

	const handleScaffold = useCallback(async () => {
		const config: ScaffoldConfig = {
			directory: state.directory,
			name: state.name,
			type: state.type,
			prefix: state.prefix,
			description: state.description,
			hooks: state.hooks,
			includeCommands: state.includeCommands,
			includeOtel: state.includeOtel,
			includeLintStaged: state.includeLintStaged,
			includeCommitlint: state.includeCommitlint,
			includeChangesets: state.includeChangesets,
			initGit: defaults.initGit ?? true,
			runInstall: defaults.runInstall ?? true,
			author: { name: state.authorName, email: state.authorEmail },
			githubOwner: state.githubOwner,
			license: state.license,
		};

		const phaseList: Phase[] = [
			{ name: "Creating project structure", status: "pending" },
			...(config.runInstall ? [{ name: "Installing dependencies", status: "pending" as const }] : []),
			...(config.initGit ? [{ name: "Initializing git repository", status: "pending" as const }] : []),
		];
		setPhases(phaseList);

		await scaffold(config, (phase, status) => {
			setPhases((prev) =>
				prev.map((p) => {
					if (p.name === phase) {
						return { ...p, status: status === "start" ? "active" : "done" };
					}
					return p;
				}),
			);
		});

		// Mark all done
		setPhases((prev) => prev.map((p) => ({ ...p, status: "done" as const })));

		// Small delay so user sees completion
		await new Promise((resolve) => setTimeout(resolve, 500));
		onComplete();
	}, [state, defaults, onComplete]);

	const renderStep = (): React.ReactElement | null => {
		switch (currentStep) {
			case WizardStep.Name:
				return (
					<NameStep
						defaultValue={state.name}
						onSubmit={(v) => {
							setState((s) => ({
								...s,
								name: v,
								directory: s.directory || v,
								prefix: s.prefix || toScreamingSnake(v),
							}));
							advanceStep();
						}}
					/>
				);
			case WizardStep.Directory:
				return (
					<DirectoryStep
						defaultValue={state.directory || state.name}
						onSubmit={(v) => {
							setState((s) => ({ ...s, directory: v }));
							advanceStep();
						}}
					/>
				);
			case WizardStep.Type:
				return (
					<TypeStep
						defaultValue={state.type}
						onSubmit={(v) => {
							setState((s) => ({ ...s, type: v as "plugin" | "marketplace" }));
							advanceStep();
						}}
					/>
				);
			case WizardStep.Prefix:
				return (
					<PrefixStep
						defaultValue={state.prefix || toScreamingSnake(state.name)}
						onSubmit={(v) => {
							setState((s) => ({ ...s, prefix: v }));
							advanceStep();
						}}
					/>
				);
			case WizardStep.Description:
				return (
					<DescriptionStep
						defaultValue={state.description}
						onSubmit={(v) => {
							setState((s) => ({ ...s, description: v }));
							advanceStep();
						}}
					/>
				);
			case WizardStep.Author:
				return (
					<AuthorStep
						defaultName={state.authorName || gitDefaults.name}
						defaultEmail={state.authorEmail || gitDefaults.email}
						onSubmit={(name, email) => {
							setState((s) => ({ ...s, authorName: name, authorEmail: email }));
							advanceStep();
						}}
					/>
				);
			case WizardStep.GithubOwner:
				return (
					<GithubOwnerStep
						defaultValue={state.githubOwner || gitDefaults.githubOwner}
						onSubmit={(v) => {
							setState((s) => ({ ...s, githubOwner: v }));
							advanceStep();
						}}
					/>
				);
			case WizardStep.License:
				return (
					<LicenseStep
						defaultValue={state.license}
						onSubmit={(v) => {
							setState((s) => ({ ...s, license: v }));
							advanceStep();
						}}
					/>
				);
			case WizardStep.Hooks:
				return (
					<HooksStep
						defaultValue={state.hooks}
						onSubmit={(v) => {
							setState((s) => ({ ...s, hooks: v }));
							advanceStep();
						}}
					/>
				);
			case WizardStep.Features:
				return (
					<FeaturesStep
						defaultCommands={state.includeCommands}
						defaultOtel={state.includeOtel}
						defaultLintStaged={state.includeLintStaged}
						defaultCommitlint={state.includeCommitlint}
						defaultChangesets={state.includeChangesets}
						onSubmit={(cmds, otel, lintStaged, commitlint, changesets) => {
							setState((s) => ({
								...s,
								includeCommands: cmds,
								includeOtel: otel,
								includeLintStaged: lintStaged,
								includeCommitlint: commitlint,
								includeChangesets: changesets,
							}));
							advanceStep();
						}}
					/>
				);
			case WizardStep.Summary:
				return (
					<SummaryStep
						state={state}
						onConfirm={() => {
							setCurrentStep(WizardStep.Scaffold);
							handleScaffold();
						}}
					/>
				);
			case WizardStep.Scaffold:
				return <ScaffoldProgress phases={phases} />;
			default:
				return null;
		}
	};

	return (
		<ThemeProvider theme={wizardTheme}>
			<Box flexDirection="column" gap={0}>
				<Header />
				{completedSteps.map((step) => {
					const { label, value } = getStepDisplay(step);
					return label ? <CompletedStep key={step} label={label} value={value} /> : null;
				})}
				{renderStep()}
			</Box>
		</ThemeProvider>
	);
}
