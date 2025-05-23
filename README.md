# mkr/mail

This is a personal project to read emails from my inbox via IMAP and send them to a Telegram chat. Feel free to use it or adapt it as a starting point for your own project.

It's event-driven, so it picks up new emails as they come in. Upon encountering errors, it will automatically retry after 1s. Last seen email's uid is stored in a KV store, so it will pick up from where it left off even after a restart.

This project uses Bun, and relies on `bun:sqlite` for the KV store. It won't work with Node or Deno.

## Configuration

The configuration is done using environment variables.

### Required

-   `AUTH_URL`: The URL of the IMAP server in the format `imaps://user:pass@host:port/mailbox`.
    -   Remember to URL-encode the username and password.
    -   If no port is provided, it will default to `993` for `imaps:` and `143` for `imap:`.
    -   If the protocol is `imaps:`, it will use TLS. Otherwise, it will use an unencrypted connection and upgrade to STARTTLS.
    -   If no mailbox is specified, it will default to `INBOX`.
-   `BOT_TOKEN`: The token of the Telegram bot.
-   `CHAT_ID`: The ID of the Telegram chat.

### Optional

-   `KV_STORE`: The path to the KV store (default: `kv.sqlite`).
-   `WAIT_AFTER_MESSAGE`: The number of milliseconds to wait after sending a message to avoid rate limiting (default: `100`).
-   `BATCH_SIZE`: The number of messages to process at a time (default: `20`).
-   `NOOP_INTERVAL`: The number of milliseconds to wait between NOOP commands (default: `60000` (1 minute)).

Env vars can be set in a `.env` file or exported in your shell. Bun will automatically pick them up.

## Usage

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Gotchas

1. The first time you enable mkr/mail, it will fetch all unread emails. To avoid this (and since my primary email has thousands of unread emails I don't want to hear about on Telegram), I've restricted it to start by fetching emails from today. If mkr/mail has previously been run, it'll have a `lastSeenUid` in the KV store, and will not restrict itself to today. The limitation only applies to the first run.

2. The IMAP spec [RFC 3501](https://datatracker.ietf.org/doc/html/rfc3501#section-2.3.1.1) says that `uid`s must be sequential and unique within a mailbox. However, it allows for a `UIDVALIDITY` mechanism, which it discourages.

    > Ideally, unique identifiers SHOULD persist at all
    > times. Although this specification recognizes that failure
    > to persist can be unavoidable in certain server
    > environments, it STRONGLY ENCOURAGES message store
    > implementation techniques that avoid this problem.

    `mkr/mail` simply assumes that `uid`s won't change or be out of order to keep track of the last seen email.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
