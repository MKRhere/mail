import { Telegraf } from "telegraf";
import { w } from "w";

const log = w("alice:tg");

export function init({ token }: { token: string }) {
	const bot = new Telegraf(token);

	bot.launch(() => log("Bot started"));

	return { bot, deinit: () => bot.stop() };
}
