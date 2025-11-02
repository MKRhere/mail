import { w } from "w";
import type { AddressObject, ParsedMail } from "mailparser";
import { escapers } from "@telegraf/entity";

import { formatBytes, trunc } from "../utils.ts";

const log = w("alice:format");

const fmtAddress = (address: AddressObject | AddressObject[] | undefined) => {
	if (!address) return "Unknown";
	const addresses = (Array.isArray(address) ? address : [address]).map(a => a.value).flat();
	return addresses.map(a => `${a.name} <${a.address}>`).join(", ");
};

const stripReply = (text: string) => {
	// look for the first instance of this line and slice off the rest
	// ---- On Fri, 04 Apr 2025 19:31:58 +0530 Name <email@domain> wrote ---
	const start = text.indexOf("---- On ");
	if (start === -1) return text.trim();
	return text.slice(0, start).trim();
};

export function fmtMail(mail: ParsedMail): string {
	const from = fmtAddress(mail.from);
	const to = fmtAddress(mail.to);
	const subject = mail.subject || "(No Subject)";

	const text = stripReply(trunc(mail.text || mail.html || "", 2048)) || "No text";
	const date = mail.date ? new Date(mail.date).toLocaleString() : "Unknown";

	const attachments = mail.attachments.map(a => `* ${a.filename} (${formatBytes(a.size)})`).join("\n");

	const formatted = `
📧

<b>From:</b> ${escapers.HTML(from)}
<b>To:</b> ${escapers.HTML(to)}
<b>Subject:</b> ${escapers.HTML(subject)}
<b>Date:</b> ${escapers.HTML(date)}

<pre><code>${escapers.HTML(text)}</code></pre>

${attachments ? `<b>Attachments:</b>\n${escapers.HTML(attachments)}` : ""}
`.trim();

	log(formatted);
	return formatted;
}
