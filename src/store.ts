import Database from "bun:sqlite";

export class Store {
	readonly #database: Database;
	#kv;

	constructor(filename: string) {
		this.#database = new Database(filename);

		this.#database
			.prepare(
				`
					CREATE TABLE IF NOT EXISTS kv (
						key TEXT NOT NULL PRIMARY KEY,
						value TEXT NOT NULL
					) WITHOUT ROWID;
				`,
			)
			.run();

		this.#kv = {
			select: this.#database.prepare(`SELECT value FROM kv WHERE key = ?`),
			set: this.#database.prepare(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`),
			delete: this.#database.prepare(`DELETE FROM kv WHERE key = ?`),
		};
	}

	getUid(): number | undefined {
		const row = this.#kv.select.get("lastSeenUid") as { value: string } | null;
		return row?.value ? JSON.parse(row.value) : undefined;
	}

	setUid(value: number) {
		return this.#kv.set.run("lastSeenUid", JSON.stringify(value));
	}

	deinit() {
		this.#database.close();
	}
}

export const init = (filename: string) => new Store(filename);
