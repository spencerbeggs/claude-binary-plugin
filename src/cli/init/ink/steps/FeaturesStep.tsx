import { MultiSelect } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";

interface FeaturesStepProps {
	defaultCommands: boolean;
	defaultOtel: boolean;
	defaultLintStaged: boolean;
	defaultCommitlint: boolean;
	defaultChangesets: boolean;
	onSubmit: (
		includeCommands: boolean,
		includeOtel: boolean,
		includeLintStaged: boolean,
		includeCommitlint: boolean,
		includeChangesets: boolean,
	) => void;
}

const FEATURE_OPTIONS = [
	{ label: "Include example command", value: "commands" },
	{ label: "Include OTEL telemetry", value: "otel" },
	{ label: "Lint-staged (pre-commit hooks)", value: "lintStaged" },
	{ label: "Commitlint (commit message validation)", value: "commitlint" },
	{ label: "Changesets (version management)", value: "changesets" },
];

export function FeaturesStep({
	defaultCommands,
	defaultOtel,
	defaultLintStaged,
	defaultCommitlint,
	defaultChangesets,
	onSubmit,
}: FeaturesStepProps): React.ReactElement {
	const defaultValue: string[] = [];
	if (defaultCommands) defaultValue.push("commands");
	if (defaultOtel) defaultValue.push("otel");
	if (defaultLintStaged) defaultValue.push("lintStaged");
	if (defaultCommitlint) defaultValue.push("commitlint");
	if (defaultChangesets) defaultValue.push("changesets");

	return (
		<Box flexDirection="column">
			<Text bold>Additional features</Text>
			<Text dimColor>(Space to toggle, Enter to confirm)</Text>
			<MultiSelect
				options={FEATURE_OPTIONS}
				defaultValue={defaultValue}
				onSubmit={(values) => {
					onSubmit(
						values.includes("commands"),
						values.includes("otel"),
						values.includes("lintStaged"),
						values.includes("commitlint"),
						values.includes("changesets"),
					);
				}}
			/>
		</Box>
	);
}
