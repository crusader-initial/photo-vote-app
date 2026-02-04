/**
 * Run only the 0004 migration: add parentId to comments table.
 * Usage: npx tsx scripts/migrate-0004-comments-parent.ts
 * (Ensure .env has DATABASE_URL or run from project root with env loaded.)
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Add it to .env or environment.");
    process.exit(1);
  }
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(url);
    await conn.execute("ALTER TABLE `comments` ADD COLUMN `parentId` int");
    console.log("Migration 0004_comments_parent applied: comments.parentId added.");
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    if (msg.includes("Duplicate column") || msg.includes("already exists")) {
      console.log("Column comments.parentId already exists, skipping.");
    } else {
      console.error("Migration failed:", err);
      process.exit(1);
    }
  } finally {
    if (conn) await conn.end();
  }
  process.exit(0);
}

main();
