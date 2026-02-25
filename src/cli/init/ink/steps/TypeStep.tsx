import { Select } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";

interface TypeStepProps {
	onSubmit: (value: string) => void;
}

const TYPE_OPTIONS = [
	{ label: "Single Plugin - One plugin with hooks and commands", value: "plugin" },
	{ label: "Marketplace - Multiple plugins in a monorepo", value: "marketplace" },
];

export function TypeStep({ onSubmit }: TypeStepProps): React.ReactElement {
	return (
		<Box flexDirection="column">
			<Text bold>Project type</Text>
			<Select options={TYPE_OPTIONS} onChange={onSubmit} />
		</Box>
	);
}
