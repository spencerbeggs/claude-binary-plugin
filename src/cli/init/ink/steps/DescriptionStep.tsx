import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";

interface DescriptionStepProps {
	defaultValue: string;
	onSubmit: (value: string) => void;
}

export function DescriptionStep({ defaultValue, onSubmit }: DescriptionStepProps): React.ReactElement {
	return (
		<Box flexDirection="column">
			<Text bold>Short description</Text>
			<Text dimColor>(optional, press Enter to skip)</Text>
			<TextInput
				defaultValue={defaultValue}
				placeholder="Hooks and commands for Claude Code"
				onSubmit={(value) => {
					onSubmit(value);
				}}
			/>
		</Box>
	);
}
