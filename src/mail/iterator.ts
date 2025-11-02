const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "20");

import { w } from "w";
import type { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";

import type { Store } from "../store.ts";

const log = w("alice:mail:iterator");

export async function* on(imap: ImapFlow, store: Store): AsyncIterable<ParsedMail & { uid: number }> {
	while (true) {
		const lastSeenUid = store.getUid();

		const next = `${(lastSeenUid ?? 0) + 1}:*`;
		log("searching for seq %s", next);

		const unread = (
			await imap.search(
				Object.assign(
					{
						seen: false,
						all: true,
						uid: next,
					},
					lastSeenUid ? undefined : { since: new Date() },
				),
				// uids don't change so it's much safer than seq
				{ uid: true },
			)
		)
			.filter(uid => uid > (lastSeenUid ?? 0))
			.slice(0, BATCH_SIZE); // process at most BATCH_SIZE messages at a time

		if (unread.length === 0) {
			log("no new messages, waiting for 'exists' event");
			await new Promise(resolve => imap.once("exists", resolve));
			log("'exists' event received");
			continue;
		}

		log("found %d new unread: %o", unread.length, unread);

		for (const uid of unread) {
			log("fetching message %d", uid);
			const message = await imap.fetchOne(uid.toString(), { source: true }, { uid: true });
			if (!message) continue;

			store.setUid(uid);
			yield Object.assign(await simpleParser(message.source), { uid });
		}
	}
}
