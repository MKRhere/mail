import { Telegraf } from "telegraf";
import { ImapFlow } from "imapflow";
import { setTimeout as sleep } from "node:timers/promises";

const AUTH_URL = Bun.env.AUTH_URL;
const BOT_TOKEN = Bun.env.BOT_TOKEN;
const CHAT_ID = Bun.env.CHAT_ID;
const CHECK_INTERVAL = parseInt(Bun.env.CHECK_INTERVAL || "300000"); // Default 5 minutes
const MAILBOX = Bun.env.MAILBOX || "INBOX"; // Default to INBOX

if (!AUTH_URL) throw new Error("AUTH_URL is not set");
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not set");
if (!CHAT_ID) throw new Error("CHAT_ID is not set");

const bot = new Telegraf(BOT_TOKEN);

const uri = new URL(AUTH_URL);

const imap = new ImapFlow({
	host: uri.hostname,
	port: parseInt(uri.port),
	secure: true,
	auth: {
		user: decodeURIComponent(uri.username),
		pass: decodeURIComponent(uri.password),
	},
	logger: false,
});

// Function to format email for Telegram
function formatEmailForTelegram(email: any): string {
	const from = email.envelope.from[0]?.address || "Unknown";
	const subject = email.envelope.subject || "(No Subject)";
	const date = new Date(email.envelope.date).toLocaleString();

	return `📧 *New Email*\n\n*From:* ${from}\n*Subject:* ${subject}\n*Date:* ${date}`;
}

function on<T>(imap: ImapFlow, event: string): AsyncIterable<T> {
	let buffer: T[] = [];

	let error: unknown = undefined;
	let done = false;

	const listener = (data: T) => buffer.push(data);
	const errorHandler = (err: Error) => (error = err);
	const closeHandler = () => (done = true);

	// Attach the listeners
	imap.on(event, listener);
	imap.on("error", errorHandler);
	imap.on("close", closeHandler);

	const cleanup = () => {
		imap.off(event, listener);
		imap.off("error", errorHandler);
		imap.off("close", closeHandler);
	};

	// Return an async iterator that can be cleaned up
	return {
		[Symbol.asyncIterator]() {
			return {
				async next() {
					if (done) return { value: undefined, done: true };

					let value: T | undefined;
					// Wait 100ms before checking again
					while (true) {
						await sleep(100);
						if (error) throw error;
						if (!(value = buffer.shift())) continue;
						break;
					}
					return { value, done: false };
				},
				async return() {
					cleanup();
					return { value: undefined, done: true };
				},
				async throw(error: unknown) {
					cleanup();
					throw error;
				},
			};
		},
	};
}

interface ExistsEvent {
	/** mailbox path this event applies to */
	path: string;

	/** updated count of messages */
	count: number;

	/** message count before this update */
	prevCount: number;
}

while (true) {
	await new Promise(async (resolve, reject) => {
		await imap.connect();
		const lock = await imap.getMailboxLock(MAILBOX);

		imap.on("error", reject);
		imap.on("close", resolve);

		const interval = setInterval(() => imap.noop(), 1000 * 60 * 1);

		try {
			for await (const event of on<ExistsEvent>(imap, "exists")) {
				console.log(event);
			}
		} catch (error) {
			console.error(error);
		} finally {
			clearInterval(interval);
			lock.release();
		}
	});
}
