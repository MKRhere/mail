import Database from "bun:sqlite";

export class Store {
	readonly #database: Database;
	readonly #table: string;
	#uid;

	constructor(filename: string, table?: string) {
		this.#database = new Database(filename);
		this.#table = table || "kv";
		this.#database
			.prepare(
				`
					CREATE TABLE IF NOT EXISTS ${this.#table} (
						key TEXT NOT NULL PRIMARY KEY,
						value TEXT NOT NULL
					) WITHOUT ROWID;
				`,
			)
			.run();

		this.#uid = {
			select: this.#database.prepare(`SELECT value FROM ${this.#table} WHERE key = ?`),
			set: this.#database.prepare(`INSERT OR REPLACE INTO ${this.#table} (key, value) VALUES (?, ?)`),
			delete: this.#database.prepare(`DELETE FROM ${this.#table} WHERE key = ?`),
		};
	}

	getUid(): number | undefined {
		const row = this.#uid.select.get("lastSeenUid") as { value: string } | null;
		return row?.value ? JSON.parse(row.value) : undefined;
	}

	setUid(value: number) {
		return this.#uid.set.run("lastSeenUid", JSON.stringify(value));
	}
}
