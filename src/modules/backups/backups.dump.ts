import { Client } from "pg";

export async function generateSqlDump(connectionString: string): Promise<string> {
  const client = new Client({ connectionString, statement_timeout: 60_000, query_timeout: 60_000 });
  await client.connect();
  try {
    let sqlDump = `-- PostgreSQL Database Backup\n`;
    sqlDump += `-- Generated: ${new Date().toISOString()}\n\n`;

    const tablesResult = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`
    );

    for (const { tablename } of tablesResult.rows) {
      const createTableResult = await client.query<{ create_statement: string }>(
        `
        SELECT
          'CREATE TABLE ' || quote_ident(table_name) || ' (' ||
          string_agg(
            quote_ident(column_name) || ' ' ||
            data_type ||
            CASE WHEN character_maximum_length IS NOT NULL
              THEN '(' || character_maximum_length || ')'
              ELSE ''
            END ||
            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
            ', '
          ) || ');' as create_statement
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        GROUP BY table_name;
        `,
        [tablename]
      );

      if (createTableResult.rows.length > 0) {
        sqlDump += `\n-- Table: ${tablename}\n`;
        sqlDump += `DROP TABLE IF EXISTS ${tablename} CASCADE;\n`;
        sqlDump += createTableResult.rows[0]!.create_statement + "\n\n";
      }

      const dataResult = await client.query<Record<string, unknown>>(`SELECT * FROM ${tablename}`);
      if (dataResult.rows.length > 0) {
        sqlDump += `-- Data for ${tablename}\n`;
        for (const row of dataResult.rows) {
          const columns = Object.keys(row);
          const values = columns.map((col) => {
            const val = (row as any)[col];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return String(val);
          });
          sqlDump += `INSERT INTO ${tablename} (${columns.join(", ")}) VALUES (${values.join(", ")});\n`;
        }
        sqlDump += "\n";
      }
    }

    const constraintsResult = await client.query<{ constraint_def: string }>(
      `
      SELECT
        'ALTER TABLE ' || tc.table_name || ' ADD CONSTRAINT ' ||
        tc.constraint_name || ' ' ||
        CASE
          WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'PRIMARY KEY (' || kcu.column_name || ')'
          WHEN tc.constraint_type = 'FOREIGN KEY' THEN
            'FOREIGN KEY (' || kcu.column_name || ') REFERENCES ' ||
            ccu.table_name || '(' || ccu.column_name || ')'
          WHEN tc.constraint_type = 'UNIQUE' THEN 'UNIQUE (' || kcu.column_name || ')'
          ELSE ''
        END || ';' as constraint_def
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public'
      AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE');
      `
    );

    if (constraintsResult.rows.length > 0) {
      sqlDump += `\n-- Constraints\n`;
      for (const { constraint_def } of constraintsResult.rows) {
        sqlDump += constraint_def + "\n";
      }
    }

    return sqlDump;
  } finally {
    await client.end();
  }
}

