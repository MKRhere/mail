import { statSync as stat } from "node:fs";

import { z } from "zod";
import json5 from "json5";

export const schema = z.object({
	bot_token: z.string(),
	imap_url: z.string(),
	store: z.string().default("kv.sqlite"),
	bridged_chat_id: z.string().transform(s => parseInt(s)),
	mapping: z
		.record(
			z.string().refine(s => s.startsWith("to:") || s.startsWith("from:")),
			z.array(z.number()),
		)
		.default({}),
});

export const init = async (argv: string[]) => {
	const argIndex = argv.findIndex(arg => arg === "--config" || arg === "-c");

	let configPath = argIndex !== -1 && argv.length > argIndex + 1 && argv[argIndex + 1];

	if (configPath) {
		if (!stat(configPath).isFile()) {
			throw new Error(`Config file not found at path: ${configPath}`);
		}
	} else {
		if (stat("config.json5").isFile()) {
			configPath = "config.json5";
		} else if (stat("config.json").isFile()) {
			configPath = "config.json";
		} else {
			throw new Error("No config file found");
		}
	}

	const file = await Bun.file("config.json").text();
	return schema.parse(json5.parse(file));
};
