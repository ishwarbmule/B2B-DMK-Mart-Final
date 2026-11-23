/**
 * ERP MySQL direct connector — the owner shares the ERP database over the
 * network (remote MySQL feature). This module is the ONLY place that talks to it.
 *
 * STRICT RULE (owner's requirement): the ERP database is NEVER modified by this
 * website. Stocks, prices, orders — everything on the ERP side changes only
 * inside the ERP software itself. The website:
 *   - only ever SELECT / SHOW / DESCRIBE / EXPLAIN (assertReadOnly),
 *   - never allows stacked statements (multipleStatements OFF),
 *   - validates every identifier (assertIdentifier),
 *   - pushes nothing back. Website orders live in Neon; the owner's team enters
 *     them in the ERP software, ERP stock reduces there, the next sync reads it.
 *
 * Credentials: env ERP_MYSQL_* first (Vercel), Setting table fallback
 * (erp_db_host/port/user/password/name — Admin → ERP Data form, masked).
 */
import mysql from "mysql2/promise";
import { db } from "@/lib/db";

// ───────── connection config ─────────

export type ErpConn = { host: string; port: number; user: string; password: string; database: string };

/** Resolve ERP MySQL credentials: env vars win, Setting table is the fallback. */
export async function erpConn(): Promise<ErpConn | null> {
  const envHost = process.env.ERP_MYSQL_HOST;
  const envUser = process.env.ERP_MYSQL_USER;
  const envDb = process.env.ERP_MYSQL_DATABASE;
  if (envHost && envUser && envDb) {
    return {
      host: envHost,
      port: Number(process.env.ERP_MYSQL_PORT || 3306),
      user: envUser,
      password: process.env.ERP_MYSQL_PASSWORD || "",
      database: envDb,
    };
  }
  const keys = ["erp_db_host", "erp_db_port", "erp_db_user", "erp_db_password", "erp_db_name"];
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const host = map.get("erp_db_host");
  const user = map.get("erp_db_user");
  const database = map.get("erp_db_name");
  if (!host || !user || !database) return null;
  return {
    host,
    port: Number(map.get("erp_db_port") || 3306),
    user,
    password: map.get("erp_db_password") || "",
    database,
  };
}

let pool: mysql.Pool | null = null;
let poolKey = "";

/** Pooled ERP connection — recreated automatically when credentials change. */
export async function erpPool(): Promise<mysql.Pool> {
  const conn = await erpConn();
  if (!conn) throw new Error("ERP MySQL not configured — paste credentials in Admin → ERP Data");
  const key = `${conn.host}:${conn.port}/${conn.database}|${conn.user}`;
  if (pool && poolKey === key) return pool;
  if (pool) await pool.end().catch(() => { /* ignore */ });
  pool = mysql.createPool({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: conn.database,
    waitForConnections: true,
    connectionLimit: 3, // Hostinger shared MySQL — keep the footprint tiny
    connectTimeout: 15000,
    multipleStatements: false, // hard block stacked statements
    dateStrings: false,
  });
  poolKey = key;
  return pool;
}

export async function closeErpPool(): Promise<void> {
  if (pool) await pool.end().catch(() => { /* ignore */ });
  pool = null;
  poolKey = "";
}

// ───────── read-only enforcement ─────────

const READ_ONLY_RE = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;

/** Throw unless the statement is guaranteed read-only. */
export function assertReadOnly(sql: string): void {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (!READ_ONLY_RE.test(trimmed)) {
    throw new Error("BLOCKED: the ERP MySQL connection is strictly read-only");
  }
  if (trimmed.includes(";")) {
    throw new Error("BLOCKED: multiple SQL statements are not allowed on the ERP connection");
  }
}

/** Only bare identifiers (letters, digits, _, $) survive this. */
export function assertIdentifier(name: string): string {
  if (!/^[\w$]+$/.test(name)) throw new Error(`Blocked identifier: ${name}`);
  return name;
}

// ───────── status / explorer (all read-only) ─────────

export type ErpStatus = {
  configured: boolean;
  connected: boolean;
  error?: string;
  version?: string;
  database?: string;
  host?: string;
  tables?: number;
};

/** Flatten any error (incl. Node AggregateError from multi-IP connects) into readable text. */
export function erpErrorText(e: unknown): string {
  if (e instanceof AggregateError && Array.isArray(e.errors)) {
    return e.errors.map((x) => (x instanceof Error ? `${x.message}${(x as NodeJS.ErrnoException).code ? ` [${(x as NodeJS.ErrnoException).code}]` : ""}` : String(x))).join("; ");
  }
  if (e instanceof Error) {
    const code = (e as NodeJS.ErrnoException).code;
    return `${e.message}${code && !e.message.includes(code) ? ` [${code}]` : ""}`;
  }
  return String(e);
}

/** Quick connectivity probe: SELECT VERSION() + table count. */
export async function testErpConnection(): Promise<ErpStatus> {
  try {
    const conn = await erpConn();
    if (!conn) return { configured: false, connected: false, error: "No credentials saved" };
    const p = await erpPool();
    const [vRows] = await p.query<mysql.RowDataPacket[]>("SELECT VERSION() AS v");
    const [tRows] = await p.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()"
    );
    return {
      configured: true,
      connected: true,
      version: String(vRows[0]?.v ?? ""),
      database: conn.database,
      host: `${conn.host}:${conn.port}`,
      tables: Number(tRows[0]?.n ?? 0),
    };
  } catch (e) {
    return { configured: true, connected: false, error: erpErrorText(e) };
  }
}

export async function listErpTables(): Promise<{ name: string; rows: number | null }[]> {
  const p = await erpPool();
  // NOTE: alias must NOT be `rows` — reserved keyword in MariaDB (Hostinger ERP runs MariaDB).
  const [rows] = await p.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS name, table_rows AS row_count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  return rows.map((r) => ({ name: String(r.name), rows: r.row_count === null ? null : Number(r.row_count) }));
}

export async function describeErpTable(table: string): Promise<{ field: string; type: string; null: string; key: string }[]> {
  const t = assertIdentifier(table);
  const p = await erpPool();
  const [rows] = await p.query<mysql.RowDataPacket[]>("DESCRIBE `" + t + "`");
  return rows.map((r) => ({ field: String(r.Field), type: String(r.Type), null: String(r.Null), key: String(r.Key ?? "") }));
}

export async function countErpTable(table: string): Promise<number> {
  const t = assertIdentifier(table);
  const p = await erpPool();
  const [rows] = await p.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${t}\``);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Internal read-only query runner (SELECT only, bound params). Used by the
 * sync engine for ERP-side JOINs (e.g. godown ⇄ firm lookups). Every statement
 * here is built in code from validated identifiers — never from user input.
 */
export async function erpQuery(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  assertReadOnly(sql);
  const p = await erpPool();
  const [rows] = await p.query<mysql.RowDataPacket[]>(sql, params);
  return rows as unknown as Record<string, unknown>[];
}

/**
 * Generic ticked-column page fetch: SELECT the mapped + ticked columns from an
 * ERP table with LIMIT/OFFSET. Used by the sync engine AND the admin data
 * browser ("ticked columns appear on the admin panel").
 */
export async function fetchErpPage(
  table: string,
  columns: string[],
  opts: { limit?: number; offset?: number; orderBy?: string; searchCol?: string; search?: string; extraWhere?: string; extraParams?: unknown[] } = {}
): Promise<Record<string, unknown>[]> {
  const t = assertIdentifier(table);
  const cols = columns.length ? columns.map(assertIdentifier) : ["*"];
  const p = await erpPool();
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 1000);
  const offset = Math.max(0, opts.offset ?? 0);
  const colList = cols.includes("*") ? "*" : cols.map((c) => "`" + c + "`").join(", ");
  let sql = `SELECT ${colList} FROM \`${t}\``;
  const params: unknown[] = [];
  const wheres: string[] = [];
  if (opts.searchCol && opts.search) {
    const sc = assertIdentifier(opts.searchCol);
    wheres.push(`CAST(\`${sc}\` AS CHAR) LIKE ?`);
    params.push(`%${opts.search}%`);
  }
  // extraWhere is generated internally (assertIdentifier-checked columns only)
  // with bound params — the ERP stays strictly read-only
  if (opts.extraWhere) wheres.push(opts.extraWhere);
  if (wheres.length) sql += ` WHERE ${wheres.join(" AND ")}`;
  if (opts.extraParams?.length) params.push(...opts.extraParams);
  if (opts.orderBy) sql += ` ORDER BY \`${assertIdentifier(opts.orderBy)}\``;
  sql += ` LIMIT ${limit} OFFSET ${offset}`;
  const [rows] = await p.query<mysql.RowDataPacket[]>(sql, params);
  return rows as unknown as Record<string, unknown>[];
}
