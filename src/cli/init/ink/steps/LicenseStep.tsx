import { Select } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";

interface LicenseStepProps {
	onSubmit: (value: string) => void;
}

const LICENSE_OPTIONS = [
	{ label: "MIT", value: "MIT" },
	{ label: "Apache-2.0", value: "Apache-2.0" },
	{ label: "ISC", value: "ISC" },
	{ label: "BSD-3-Clause", value: "BSD-3-Clause" },
	{ label: "GPL-3.0-only", value: "GPL-3.0-only" },
	{ label: "UNLICENSED", value: "UNLICENSED" },
];

export function LicenseStep({ onSubmit }: LicenseStepProps): React.ReactElement {
	return (
		<Box flexDirection="column">
			<Text bold>License</Text>
			<Select options={LICENSE_OPTIONS} onChange={onSubmit} />
		</Box>
	);
}
