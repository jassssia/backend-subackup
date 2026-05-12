import { Client } from "pg";
import { env } from "../../config/env.js";
import { HttpError } from "../../http/errors.js";
import { ProjectModel } from "../projects/projects.models.js";
import { ProjectCredentialsModel } from "../credentials/credentials.models.js";
import { decryptConnectionString } from "../credentials/credentials.crypto.js";

export type DbSchema = {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      dataType: string;
      isNullable: boolean;
      defaultValue: string | null;
      isPrimaryKey: boolean;
      foreignKey?: { table: string; column: string } | null;
    }>;
  }>;
};

export async function getDatabaseSchema(userId: string, projectId: string): Promise<DbSchema> {
  const project = await ProjectModel.findOne({ _id: projectId, userId }).lean().exec();
  if (!project) throw new HttpError(404, "project_not_found", "Project not found");

  const credentials = await ProjectCredentialsModel.findOne({ projectId }).lean().exec();
  if (!credentials) throw new HttpError(400, "missing_credentials", "Project credentials not configured");

  const connectionString = decryptConnectionString(credentials.connectionStringEncrypted, credentials.iv, env.ENCRYPTION_KEY);

  const client = new Client({ connectionString, statement_timeout: 15_000, query_timeout: 15_000 });
  await client.connect();
  try {
    const tablesRes = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;`
    );

    const pkRes = await client.query<{ table_name: string; column_name: string }>(
      `
      SELECT
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY';
      `
    );
    const pkSet = new Set(pkRes.rows.map((r) => `${r.table_name}.${r.column_name}`));

    const fkRes = await client.query<{
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>(
      `
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY';
      `
    );
    const fkMap = new Map(
      fkRes.rows.map((r: { table_name: string; column_name: string; foreign_table_name: string; foreign_column_name: string }) => [
        `${r.table_name}.${r.column_name}`,
        { table: r.foreign_table_name, column: r.foreign_column_name }
      ])
    );

    const tables = [];
    for (const t of tablesRes.rows) {
      const colsRes = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: "YES" | "NO";
        column_default: string | null;
      }>(
        `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position;
        `,
        [t.tablename]
      );

      tables.push({
        name: t.tablename,
        columns: colsRes.rows.map((c) => {
          const key = `${t.tablename}.${c.column_name}`;
          return {
            name: c.column_name,
            dataType: c.data_type,
            isNullable: c.is_nullable === "YES",
            defaultValue: c.column_default,
            isPrimaryKey: pkSet.has(key),
            foreignKey: fkMap.get(key) ?? null
          };
        })
      });
    }

    return { tables };
  } finally {
    await client.end();
  }
}

