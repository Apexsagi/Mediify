declare module 'node:sqlite' {
  export interface StatementSync {
    run(...params: Array<string | number | bigint | Uint8Array | null>): {
      changes: number | bigint;
      lastInsertRowid: number | bigint;
    };
    get(...params: Array<string | number | bigint | Uint8Array | null>): Record<string, unknown> | undefined;
    all(...params: Array<string | number | bigint | Uint8Array | null>): Array<Record<string, unknown>>;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
