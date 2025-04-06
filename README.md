# mkr/mail

This is a personal project to read emails from my inbox via IMAP and send them to a Telegram chat. Feel free to use it or adapt it as a starting point for your own project.

It's event-driven, so it picks up new emails as they come in. Upon encountering errors, it will automatically retry after 1s. Last seen email's seq is stored in a KV store, so it will pick up from where it left off even after a restart.

This project uses Bun, and relies on `bun:sqlite` for the KV store. It won't work with Node or Deno.

## Configuration

The configuration is done using environment variables.

-   `AUTH_URL`: The URL of the IMAP server in the format `imap://user:pass@host:port` (required). Remember to URL encode the username and password.
-   `BOT_TOKEN`: The token of the Telegram bot (required).
-   `CHAT_ID`: The ID of the Telegram chat (required).
-   `MAILBOX`: The mailbox to read emails from (default: `INBOX`).
-   `KV_STORE`: The path to the KV store (default: `kv.sqlite`).

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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
