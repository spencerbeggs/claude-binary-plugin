import { Text } from "ink";
import type React from "react";

interface CompletedStepProps {
	label: string;
	value: string;
}

export function CompletedStep({ label, value }: CompletedStepProps): React.ReactElement {
	return (
		<Text>
			<Text color="green">{"  \u2714"}</Text>
			<Text> {label}: </Text>
			<Text bold>{value}</Text>
		</Text>
	);
}
