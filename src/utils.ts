export const ensureArray = <T>(value: T | T[] | undefined): T[] => {
	if (value == undefined) return [];
	if (Array.isArray(value)) return value;
	return [value];
};

export const trunc = (text: string, maxLength: number) => {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength) + "...";
};

export const formatBytes = (bytes: number) => {
	if (bytes < 1024) return `${bytes} bytes`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
};

type MaybePromise<T> = T | Promise<T>;

export const pipe = (...fs: (() => MaybePromise<void>)[]) => {
	return async () => {
		for (const f of fs) await f();
	};
};
