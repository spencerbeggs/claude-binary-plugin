import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";
import { useState } from "react";

interface AuthorStepProps {
	defaultName: string;
	defaultEmail: string;
	onSubmit: (name: string, email: string) => void;
}

export function AuthorStep({ defaultName, defaultEmail, onSubmit }: AuthorStepProps): React.ReactElement {
	const [phase, setPhase] = useState<"name" | "email">("name");
	const [authorName, setAuthorName] = useState(defaultName);

	if (phase === "name") {
		return (
			<Box flexDirection="column">
				<Text bold>Author name</Text>
				<Text dimColor>(optional, press Enter to skip)</Text>
				<TextInput
					defaultValue={defaultName}
					placeholder="Your Name"
					onSubmit={(value) => {
						setAuthorName(value);
						setPhase("email");
					}}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text>
				<Text color="green">{" \u2714"}</Text>
				<Text> Author name: </Text>
				<Text bold>{authorName || "(none)"}</Text>
			</Text>
			<Text bold>Author email</Text>
			<Text dimColor>(optional, press Enter to skip)</Text>
			<TextInput
				defaultValue={defaultEmail}
				placeholder="you@example.com"
				onSubmit={(value) => {
					onSubmit(authorName, value);
				}}
			/>
		</Box>
	);
}
