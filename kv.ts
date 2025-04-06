// Vendored from https://github.com/redraskal/bun-kv
// Copyright (c) 2023 Benjamin Ryan
// MIT License

import Database from "bun:sqlite";

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export class KV<Store extends Record<string, JSONValue>> {
	readonly #database: Database;
	readonly #table: string;
	#select;
	#set;
	#delete;

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
		this.#select = this.#database.query(`SELECT value FROM ${this.#table} WHERE key = $key`);
		this.#set = this.#database.query(`INSERT OR REPLACE INTO ${this.#table} (key, value) VALUES ($key, $value)`);
		this.#delete = this.#database.query(`DELETE FROM ${this.#table} WHERE key = $key`);
	}

	get<K extends keyof Store & string>(key: K): Store[K] | undefined {
		const row = this.#select.get(key) as { value: string } | null;
		return row?.value ? JSON.parse(row.value) : undefined;
	}

	set<K extends keyof Store & string>(key: K, value: Store[K]) {
		return this.#set.run(key, JSON.stringify(value));
	}

	remove<K extends keyof Store & string>(key: K) {
		return this.#delete.run(key);
	}
}
