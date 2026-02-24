import { ConfirmInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";
import type { WizardState } from "../types.js";

interface SummaryStepProps {
	state: WizardState;
	onConfirm: () => void;
}

function SummaryRow({ label, value }: { label: string; value: string }): React.ReactElement {
	return (
		<Box>
			<Box width={16}>
				<Text dimColor>{label}</Text>
			</Box>
			<Text>{value}</Text>
		</Box>
	);
}

export function SummaryStep({ state, onConfirm }: SummaryStepProps): React.ReactElement {
	const features = [state.includeCommands ? "commands" : "", state.includeOtel ? "otel" : ""].filter(Boolean);

	const tooling = [
		state.includeLintStaged ? "lint-staged" : "",
		state.includeCommitlint ? "commitlint" : "",
		state.includeChangesets ? "changesets" : "",
	].filter(Boolean);

	return (
		<Box flexDirection="column" gap={1}>
			<Text bold>Ready to scaffold?</Text>

			<Box flexDirection="column" paddingLeft={2}>
				<SummaryRow label="Name" value={state.name} />
				<SummaryRow label="Directory" value={state.directory} />
				<SummaryRow label="Type" value={state.type === "marketplace" ? "Marketplace" : "Single Plugin"} />
				<SummaryRow label="Prefix" value={state.prefix} />
				<SummaryRow label="Description" value={state.description || "(none)"} />
				<SummaryRow
					label="Author"
					value={
						state.authorName ? `${state.authorName}${state.authorEmail ? ` <${state.authorEmail}>` : ""}` : "(none)"
					}
				/>
				<SummaryRow label="GitHub" value={state.githubOwner || "(none)"} />
				<SummaryRow label="License" value={state.license} />
				<SummaryRow label="Hooks" value={state.hooks.join(", ")} />
				<SummaryRow label="Features" value={features.length > 0 ? features.join(", ") : "(none)"} />
				<SummaryRow label="Tooling" value={tooling.length > 0 ? tooling.join(", ") : "(none)"} />
			</Box>

			<Box>
				<Text dimColor>Confirm? (Y/n) </Text>
				<ConfirmInput
					defaultChoice="confirm"
					onConfirm={onConfirm}
					onCancel={() => {
						process.exit(1);
					}}
				/>
			</Box>
		</Box>
	);
}
