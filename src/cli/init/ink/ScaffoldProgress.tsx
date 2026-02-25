import { Spinner } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";

interface Phase {
	name: string;
	status: "pending" | "active" | "done";
}

interface ScaffoldProgressProps {
	phases: Phase[];
}

export function ScaffoldProgress({ phases }: ScaffoldProgressProps): React.ReactElement {
	return (
		<Box flexDirection="column">
			{phases.map((phase) => (
				<Box key={phase.name} gap={1}>
					{phase.status === "done" && <Text color="green">{"\u2714"}</Text>}
					{phase.status === "active" && <Spinner label="" />}
					{phase.status === "pending" && <Text dimColor>{"\u25CB"}</Text>}
					<Text dimColor={phase.status === "pending"}>{phase.name}</Text>
				</Box>
			))}
		</Box>
	);
}
