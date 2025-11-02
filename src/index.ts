import { w } from "w";

import * as Telegram from "./telegram/index.ts";
import * as Mail from "./mail/index.ts";
import * as Store from "./store.ts";
import * as Config from "./config.ts";
import { pipe } from "./utils.ts";

const log = w("alice:main");

log("Parsing config");
const config = Config.schema.parse(await Bun.file("config.json").json());

log("Opening store");
const store = Store.init(config.store);

log("Initialising Telegram bot");
const tg = Telegram.init({ token: config.bot_token });

log("Initialising Mail client");
const uri = new URL(config.imap_url);
const secure = uri.protocol === "imaps:";
const mail = Mail.init({
	user: decodeURIComponent(uri.username),
	pass: decodeURIComponent(uri.password),
	secure,
	host: uri.hostname,
	port: parseInt(uri.port) || (secure ? 993 : 143),
	mailbox: uri.pathname.slice(1) || "INBOX",
	bridged_chat_id: config.bridged_chat_id,
	mapping: config.mapping,
	bot: tg.bot,
	store: store,
});

const cleanup = pipe(() => console.log("Exiting..."), mail.deinit, tg.deinit, store.deinit);
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

log("Starting mail listener");
await mail.listen();
