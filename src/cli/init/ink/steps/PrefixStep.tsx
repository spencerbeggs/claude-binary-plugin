import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";
import { useState } from "react";

interface PrefixStepProps {
	defaultValue: string;
	onSubmit: (value: string) => void;
}

export function PrefixStep({ defaultValue, onSubmit }: PrefixStepProps): React.ReactElement {
	const [error, setError] = useState("");

	return (
		<Box flexDirection="column">
			<Text bold>Environment variable prefix</Text>
			<Text dimColor>(SCREAMING_SNAKE_CASE, e.g. MY_PLUGIN)</Text>
			<TextInput
				defaultValue={defaultValue}
				placeholder="MY_PLUGIN"
				onSubmit={(value) => {
					if (!value) {
						setError("Prefix is required");
						return;
					}
					if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
						setError("Must be SCREAMING_SNAKE_CASE (e.g., MY_PLUGIN)");
						return;
					}
					setError("");
					onSubmit(value);
				}}
			/>
			{error ? <Text color="red">{error}</Text> : null}
		</Box>
	);
}
