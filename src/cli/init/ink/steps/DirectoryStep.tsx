import { resolve } from "node:path";
import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";
import { useState } from "react";

interface DirectoryStepProps {
	defaultValue: string;
	onSubmit: (value: string) => void;
}

export function DirectoryStep({ defaultValue, onSubmit }: DirectoryStepProps): React.ReactElement {
	const [error, setError] = useState("");

	return (
		<Box flexDirection="column">
			<Text bold>Output directory</Text>
			<Text dimColor>(relative to cwd or absolute path)</Text>
			<TextInput
				defaultValue={defaultValue}
				placeholder={defaultValue || "my-plugin"}
				onSubmit={(value) => {
					if (!value) {
						setError("Directory is required");
						return;
					}
					setError("");
					const resolved = resolve(process.cwd(), value);
					onSubmit(resolved);
				}}
			/>
			{error ? <Text color="red">{error}</Text> : null}
		</Box>
	);
}
