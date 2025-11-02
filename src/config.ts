import { z } from "zod";

export const schema = z.object({
	bot_token: z.string(),
	imap_url: z.string(),
	store: z.string().default("kv.sqlite"),
	mail_chat_id: z.string().transform(s => parseInt(s)),
	mapping: z.record(
		z.string().refine(s => s.startsWith("to:") || s.startsWith("from:")),
		z.array(z.number()),
	),
});
