import { Text } from "ink";
import BigText from "ink-big-text";
import type React from "react";

export function Header(): React.ReactElement {
	return (
		<>
			<BigText text="Claude Plugin" font="tiny" />
			<Text dimColor>Create a new Claude Code plugin project</Text>
			<Text>{""}</Text>
		</>
	);
}
