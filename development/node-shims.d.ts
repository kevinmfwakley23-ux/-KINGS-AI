
declare const process: any;
declare function require(id: string): any;
declare class Buffer extends Uint8Array {
  constructor(value?: any);
  toString(encoding?: string): string;
  subarray(begin?: number, end?: number): Buffer;
  static from(value: any, encoding?: string): Buffer;
  static byteLength(value: any, encoding?: string): number;
}
declare namespace NodeJS { type Signals = string; interface ProcessEnv { [key: string]: string | undefined } type ReadableStream = any }
declare const __dirname: string;
declare const __filename: string;

declare module "node:fs" {
  export const existsSync: any;
  export const readFileSync: any;
  export const writeFileSync: any;
  export const mkdirSync: any;
  export const statSync: any;
  export const readdirSync: any;
  export const rmSync: any;
  export const realpathSync: any;
}
declare module "node:fs/promises" {
  export const access: any;
  export const mkdir: any;
  export const mkdtemp: any;
  export const readFile: any;
  export const readdir: any;
  export const realpath: any;
  export const rm: any;
  export const stat: any;
  export const symlink: any;
  export const writeFile: any;
}
declare module "node:path" {
  export const basename: any;
  export const dirname: any;
  export const isAbsolute: any;
  export const join: any;
  export const relative: any;
  export const resolve: any;
}
declare module "node:os" {
  export const homedir: any;
  export const tmpdir: any;
}
declare module "node:child_process" {
  export const spawn: any;
  export type ChildProcessWithoutNullStreams = any;
}
declare module "node:readline" {
  export const createInterface: any;
}
declare module "node:dns/promises" {
  export const lookup: any;
}
