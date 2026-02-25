import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";

interface GithubOwnerStepProps {
	defaultValue: string;
	onSubmit: (value: string) => void;
}

export function GithubOwnerStep({ defaultValue, onSubmit }: GithubOwnerStepProps): React.ReactElement {
	return (
		<Box flexDirection="column">
			<Text bold>GitHub user or organization</Text>
			<Text dimColor>(optional, press Enter to skip)</Text>
			<TextInput
				defaultValue={defaultValue}
				placeholder="my-org"
				onSubmit={(value) => {
					onSubmit(value);
				}}
			/>
		</Box>
	);
}
