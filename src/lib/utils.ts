import type { SvelteURLSearchParams } from 'svelte/reactivity';
import type { Default, Primitive, Schema, SchemaOutput } from './types.js';
import { coercePrimitive, validateEnum } from './coerce.js';

export const debounce = (fn: () => void, delay: number | false) => {
	let timeout: number;
	// if no delay, no debounce
	if (delay === false) {
		return () => {};
	}
	return () => {
		clearTimeout(timeout);
		timeout = setTimeout(fn, delay);
	};
};

export const stringifyPrimitive = (primitiveType: Primitive, value: any): string | null => {
	switch (primitiveType) {
		case 'string': {
			return !value ? null : String(value);
		}
		case 'number': {
			return value === null ? null : value || value === 0 ? value.toString() : null;
		}
		case 'date': {
			const isDate = value && value instanceof Date && !isNaN(value.getTime());
			return value === null ? null : isDate ? value.toISOString() : null;
		}
		case 'boolean': {
			return value === null ? null : value ? 'true' : 'false';
		}
		default: {
			// it is an enum
			return validateEnum(primitiveType, value) ? value : null;
		}
	}
};

const getSearchParams = (data: string | URL | URLSearchParams | SvelteURLSearchParams) => {
	return typeof data === 'string'
		? new URL(data).searchParams
		: data instanceof URL
			? data.searchParams
			: data;
};

export const parseURL = <
	S extends Schema,
	D extends Default<S> | undefined,
	Enforce extends boolean = false
>(
	data: string | URL | URLSearchParams | SvelteURLSearchParams,
	schema: S,
	defaultValue?: D
): SchemaOutput<S, D, Enforce> => {
	const searchParams = getSearchParams(data);
	const paths = Array.from(searchParams.entries());
	const result: any = {};
	const pathMap = new Map(paths);

	const parseSchemaRecursive = (
		currentSchema: any,
		currentResult: any,
		currentPath: string = '',
		defaultSchema: any
	) => {
		for (const [key, schemaType] of Object.entries(currentSchema)) {
			const newPath = currentPath ? `${currentPath}.${key}` : key;
			const defaultValue = defaultSchema?.[key];
			const isArray = Array.isArray(schemaType);
			const type = isArray ? schemaType[0] : schemaType;
			const primitive = isPrimitive(type) ? type : undefined;
			const schema = isPrimitive(type) ? undefined : type;

			if (primitive) {
				if (isArray) {
					currentResult[key] = [];
					for (let i = 0; ; i++) {
						const arrayPath = `${newPath}.${i}`;
						const value = pathMap.get(arrayPath);
						if (!value && !defaultValue?.[i]) break;
						currentResult[key].push(
							coercePrimitive(primitive as Primitive, value, defaultValue?.[i])
						);
					}
				} else {
					// Handle primitive types
					const value = pathMap.get(newPath);
					currentResult[key] = coercePrimitive(schemaType as Primitive, value, defaultValue);
				}
			} else if (schema) {
				if (isArray) {
					// Handle array types
					currentResult[key] = [];

					for (let i = 0; ; i++) {
						const arrayPath = `${newPath}.${i}`;
						const hasPaths = Array.from(pathMap.keys()).some((path) => path.startsWith(arrayPath));
						if (!defaultValue?.[i] && !hasPaths) break;
						currentResult[key][i] = {};
						parseSchemaRecursive(schema, currentResult[key][i], arrayPath, defaultValue?.[i]);
					}
				} else {
					currentResult[key] = {};
					parseSchemaRecursive(schemaType, currentResult[key], newPath, defaultValue);
				}
			}
		}
	};

	parseSchemaRecursive(schema, result, '', defaultValue);
	return result;
};

export const isValidPath = (path: string, schema: Schema): boolean => {
	const parts = path.split('.');
	let currentSchema: any = schema;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (typeof currentSchema === 'string') return false;

		if (Array.isArray(currentSchema)) {
			if (!/^\d+$/.test(part)) return false;
			currentSchema = currentSchema[0];
			continue;
		}

		if (typeof currentSchema !== 'object' || currentSchema === null || !(part in currentSchema)) {
			return false;
		}

		currentSchema = currentSchema[part];
	}

	return true;
};

export const isPrimitive = (value: any): value is Primitive => {
	return (
		['string', 'number', 'date', 'boolean'].includes(value) ||
		(value.startsWith?.('<') && value.endsWith?.('>'))
	);
};
