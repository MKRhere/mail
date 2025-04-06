import { Telegraf } from "telegraf";
import { escapers } from "@telegraf/entity";
import ms from "ms";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { ImapFlow, type ImapFlowOptions, type MailboxLockObject } from "imapflow";
import { setTimeout as sleep } from "node:timers/promises";
import { w } from "w";
import { KV } from "./kv.ts";

const AUTH_URL = Bun.env.AUTH_URL;
const BOT_TOKEN = Bun.env.BOT_TOKEN;
const CHAT_ID = Bun.env.CHAT_ID;
const MAILBOX = Bun.env.MAILBOX || "INBOX";
const KV_STORE = Bun.env.KV_STORE || "kv.sqlite";

if (!AUTH_URL) throw new Error("AUTH_URL is not set");
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not set");
if (!CHAT_ID) throw new Error("CHAT_ID is not set");

const kv = new KV<{ lastSeenSeq: number }>(KV_STORE);

const bot = new Telegraf(BOT_TOKEN);

const uri = new URL(AUTH_URL);

const formattedLog = w("mkrmail:format");

const removeMailContext = (text: string) => {
	// look for the first instance of this line and slice off the rest
	// ---- On Fri, 04 Apr 2025 19:31:58 +0530 Muthu Kumar <hi@mkr.pw> wrote ---
	const start = text.indexOf("---- On ");
	if (start === -1) return text.trim();
	return text.slice(0, start).trim();
};

const address = (address: AddressObject | AddressObject[] | undefined) => {
	if (!address) return "Unknown";
	const addresses = (Array.isArray(address) ? address : [address]).map(a => a.value).flat();
	return addresses.map(a => `${a.name} <${a.address}>`).join(", ");
};

// Function to format email for Telegram
function formatMailForTg(mail: ParsedMail): string {
	const from = address(mail.from);
	const to = address(mail.to);
	const subject = mail.subject || "(No Subject)";

	const text = removeMailContext(mail.text || mail.html || "") || "No text";
	const date = mail.date ? new Date(mail.date).toLocaleString() : "Unknown";

	// @ts-expect-error let it garbage collect
	mail = null;

	const formatted = `
📧

<b>From:</b> ${escapers.HTML(from)}
<b>To:</b> ${escapers.HTML(to)}
<b>Subject:</b> ${escapers.HTML(subject)}
<b>Date:</b> ${escapers.HTML(date)}

<pre><code>${escapers.HTML(text)}</code></pre>
`.trim();

	formattedLog(formatted);
	return formatted;
}

function on(imap: ImapFlow): AsyncIterable<ParsedMail & { seq: number }> {
	let error: Error | undefined;
	let done = false;

	const errorHandler = (err: Error) => (error = err);
	const closeHandler = () => (done = true);

	imap.on("error", errorHandler);
	imap.on("close", closeHandler);

	const log = w("mkrmail:search");

	return {
		[Symbol.asyncIterator]() {
			return {
				async next() {
					while (true) {
						if (error) throw error;
						if (done) return { value: undefined, done: true };

						log("waiting for 'exists' event");
						await new Promise(resolve => imap.once("exists", resolve));
						log("'exists' event received");

						try {
							const lastSeenSeq = kv.get("lastSeenSeq");

							const next = `${(lastSeenSeq ?? 0) + 1}:*`;
							log("searching for seq %s", next);
							const unread = await imap.search({ seen: false, all: true, seq: next });
							log("found %d unread: %o", unread.length, unread);
							const seq = unread.shift();
							if (!seq) continue;

							if (lastSeenSeq && seq <= lastSeenSeq) continue;

							log("fetching message %d", seq);
							const [message] = await imap.fetchAll([seq], { source: true });
							if (!message) continue;

							kv.set("lastSeenSeq", seq);
							return { value: Object.assign(await simpleParser(message.source), { seq }), done: false };
						} catch (e) {
							log("error: %o", e);
						}
					}
				},
				async return() {
					imap.off("error", errorHandler);
					imap.off("close", closeHandler);
					return { value: undefined, done: true };
				},
				async throw(error: unknown) {
					imap.off("error", errorHandler);
					imap.off("close", closeHandler);
					throw error;
				},
			};
		},
	};
}

const log = w("mkrmail:main");
const internals = w("imapflow");
const wrapped = (obj: object) => internals("%o", obj);
const logger = { debug: wrapped, info: wrapped, warn: wrapped, error: wrapped };

type Auth = ImapFlowOptions["auth"];
const auth: Auth = { user: decodeURIComponent(uri.username), pass: decodeURIComponent(uri.password) };
const config: ImapFlowOptions = { host: uri.hostname, port: parseInt(uri.port), secure: true, logger, auth };

const pipe =
	(...fs: (() => void)[]) =>
	() => {
		for (const f of fs) f();
	};

let imap: ImapFlow | undefined;
let lock: MailboxLockObject | undefined;
let interval: NodeJS.Timeout | undefined;

const cleanup = () => {
	if (interval) {
		clearInterval(interval);
		interval = undefined;
	}
	if (lock) {
		log("releasing mailbox lock");
		lock.release();
		lock = undefined;
	}
	if (imap) {
		log("closing imap");
		imap.close();
		imap = undefined;
	}
};

process.on("SIGINT", pipe(cleanup, process.exit));
process.on("SIGTERM", pipe(cleanup, process.exit));

while (true) {
	try {
		await new Promise<void>(async (resolve, reject) => {
			log("connecting to imap");
			imap = new ImapFlow(config);
			await imap.connect();

			clearInterval(interval);
			interval = setInterval(() => imap?.noop(), 1000 * 60 * 1);

			log("getting mailbox lock");
			lock = await imap.getMailboxLock(MAILBOX);

			imap.on("error", pipe(cleanup, reject));
			imap.on("close", pipe(cleanup, resolve));

			try {
				for await (const msg of on(imap)) {
					log("found new message: %d, sending to telegram", msg.seq);
					await bot.telegram.sendMessage(CHAT_ID, formatMailForTg(msg), { parse_mode: "HTML" });
					log("sent message %d to telegram", msg.seq);
				}
			} finally {
				cleanup();
			}
		});
	} catch (error) {
		log("error in main loop, reconnecting: %o", error);
	}

	log("main loop disconnected, reconnecting in 1 second");
	await sleep(1000);
}
