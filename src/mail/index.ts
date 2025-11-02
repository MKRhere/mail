const WAIT_AFTER_MESSAGE = parseInt(process.env.WAIT_AFTER_MESSAGE || "100");
const NOOP_INTERVAL = parseInt(process.env.NOOP_INTERVAL || "60000");

import { Telegraf } from "telegraf";
import { button, inlineKeyboard } from "telegraf/markup";
import { ImapFlow, type ImapFlowOptions, type MailboxLockObject } from "imapflow";
import { setTimeout as sleep } from "node:timers/promises";
import { w } from "w";

import type { Store } from "../store.ts";
import { fmtMail } from "./formatting.ts";
import { ensureArray, pipe } from "../utils.ts";
import { on } from "./iterator.ts";

const log = w("alice:mail");
const err = w("alice:mail:error");
err.enabled = true;
const internals = w("imapflow");
const wrapped = (obj: object) => internals("%o", obj);
const logger = { debug: wrapped, info: wrapped, warn: wrapped, error: wrapped };

export function init({
	user,
	pass,
	secure,
	host,
	port,
	mailbox,
	targetChatId,
	mapping,
	bot,
	store,
}: {
	user: string;
	pass: string;
	secure: boolean;
	host: string;
	port: number;
	mailbox?: string;
	targetChatId: number;
	mapping: Record<string, number[]>;
	bot: Telegraf;
	store: Store;
}) {
	const imapConfig: ImapFlowOptions = { host, port, secure, logger, auth: { user, pass } };

	let imap: ImapFlow | undefined;
	let keepaliveInterval: NodeJS.Timeout | undefined;
	let lock: MailboxLockObject | undefined;
	let trashFolder: string;

	const kb = (uid: number) => {
		return inlineKeyboard([
			button.callback("Read", `mail:read_${uid}`),
			button.callback("Delete", `mail:delete_${uid}`),
		]);
	};

	bot.action(/^mail:read_(\d+)$/, async ctx => {
		const uid = ctx.match[1];
		try {
			log("Marking as read: %d", uid);
			if (!uid) return ctx.answerCbQuery("Invalid UID");
			if (!imap) return ctx.answerCbQuery("IMAP connection not established");
			await imap.messageFlagsAdd({ uid }, ["\\Seen"]);
			await ctx.answerCbQuery("Marked as read");
			log("Marked as read: %s", uid);
			// remove the keyboard since it only has [Read] button
			await ctx.editMessageReplyMarkup(undefined);
		} catch (e) {
			log("Error marking as read: %s", uid, e);
			await ctx.answerCbQuery("Error marking message as read");
		}
	});

	bot.action(/^mail:delete_(\d+)$/, async ctx => {
		const uid = ctx.match[1];
		try {
			log("Deleting message: %d", uid);
			if (!uid) return ctx.answerCbQuery("Invalid UID");
			if (!imap) return ctx.answerCbQuery("IMAP connection not established");
			await imap.messageMove({ uid }, trashFolder);
			await ctx.answerCbQuery("Deleted message");
			log("Marked as deleted: %s", uid);
			// remove the keyboard since it doesn't make sense anymore
			await ctx.editMessageReplyMarkup(undefined);
		} catch (e) {
			log("Error marking as read: %s", uid, e);
			await ctx.answerCbQuery("Error marking message as deleted");
		}
	});

	function deinit() {
		if (keepaliveInterval) {
			clearInterval(keepaliveInterval);
			keepaliveInterval = undefined;
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
	}

	let exited = false;

	return {
		deinit() {
			exited = true;
			deinit();
		},
		async listen() {
			while (true) {
				if (exited) break;

				try {
					// oxlint-disable-next-line no-async-promise-executor It's required to use async/await here, and errors are properly handled
					await new Promise<void>(async (resolve, reject) => {
						try {
							log("connecting to imap");
							imap = new ImapFlow(imapConfig);
							await imap.connect();

							clearInterval(keepaliveInterval);
							const keepalive = imap.noop.bind(imap);
							keepaliveInterval = setInterval(keepalive, NOOP_INTERVAL);

							log("listing mailboxes");

							for await (const mailbox of await imap.list()) {
								if (mailbox.specialUse === "\\Trash") {
									trashFolder = mailbox.path;
									break;
								}
							}

							if (!trashFolder) {
								err("No trash folder found, defaulting to Trash");
								trashFolder = "Trash";
							}

							log("getting mailbox lock");
							lock = await imap.getMailboxLock(mailbox || "INBOX");

							imap.on("error", pipe(deinit, reject));
							imap.on("close", pipe(deinit, resolve));

							for await (const msg of on(imap, store)) {
								if (!imap) break;
								log("found new message: %d, sending to telegram", msg.uid);
								const formatted = fmtMail(msg);

								await bot.telegram.sendMessage(targetChatId, formatted, {
									parse_mode: "HTML",
									...kb(msg.uid),
								});
								log("sent message %d to telegram", msg.uid);

								const otherA = (msg.from?.value ?? [])
									.filter(email => email.address)
									.flatMap(email => mapping["from:" + email.address] || []);

								const otherB = ensureArray(msg.to)
									.flatMap(each => each.value)
									.filter(email => email.address)
									.flatMap(email => mapping["to:" + email.address] || []);

								const otherRecipients = [...new Set(otherA.concat(otherB))];

								if (otherRecipients.length) {
									await Promise.all(
										otherRecipients.map(each => {
											return bot.telegram
												.sendMessage(each, formatted, { parse_mode: "HTML" })
												.catch(e => (console.error(e), null));
										}),
									).then(sent => {
										const success = sent.filter(x => x);
										const failed = sent.filter(x => !x);
										if (success.length) console.log("Additionally forwarded to", success.length, "recipients");
										if (failed.length) console.warn(failed.length, "forwards failed");
									});
								}

								await sleep(WAIT_AFTER_MESSAGE); // wait some time per message to avoid rate limiting
							}
						} catch (e) {
							reject(e);
						}
					});
				} catch (error) {
					log("error in main loop: %o", error);
					deinit();
				}

				log("main loop disconnected, reconnecting in 1 second");
				await sleep(1000);
			}
		},
	};
}
