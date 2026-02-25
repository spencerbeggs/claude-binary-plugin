import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";
import { useState } from "react";

interface NameStepProps {
	defaultValue: string;
	onSubmit: (value: string) => void;
}

export function NameStep({ defaultValue, onSubmit }: NameStepProps): React.ReactElement {
	const [error, setError] = useState("");

	return (
		<Box flexDirection="column">
			<Text bold>Project name</Text>
			<Text dimColor>(kebab-case, e.g. my-plugin)</Text>
			<TextInput
				defaultValue={defaultValue}
				placeholder="my-plugin"
				onSubmit={(value) => {
					if (!value) {
						setError("Name is required");
						return;
					}
					if (!/^[a-z][a-z0-9-]*$/.test(value)) {
						setError("Must be kebab-case (e.g., my-plugin)");
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
