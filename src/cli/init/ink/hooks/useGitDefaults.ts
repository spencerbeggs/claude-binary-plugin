import { useEffect, useState } from "react";
import type { DetectedDefaults } from "../../detect-defaults.js";
import { detectDefaults } from "../../detect-defaults.js";

export interface GitDefaults extends DetectedDefaults {
	loading: boolean;
}

export function useGitDefaults(): GitDefaults {
	const [defaults, setDefaults] = useState<GitDefaults>({
		name: "",
		email: "",
		githubOwner: "",
		loading: true,
	});

	useEffect(() => {
		detectDefaults().then((detected) => {
			setDefaults({ ...detected, loading: false });
		});
	}, []);

	return defaults;
}
