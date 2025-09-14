export const serialize = (obj: unknown): string =>
  JSON.stringify(obj, (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value
  );
