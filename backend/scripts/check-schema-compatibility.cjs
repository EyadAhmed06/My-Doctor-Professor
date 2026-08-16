require("dotenv").config();

const databaseHost = process.env.DB_HOST?.trim().toLowerCase();
if (databaseHost?.endsWith(".rds.amazonaws.com")) {
  process.env.DB_SSL_ENABLED = "true";
}

require("ts-node/register/transpile-only");

const { AppDataSource } = require("../src/database/data-source");

const sslMode = AppDataSource.options.ssl ? "encrypted" : "unencrypted";
console.log(
  `Schema check target: ${AppDataSource.options.username}@${AppDataSource.options.host}:` +
    `${AppDataSource.options.port}/${AppDataSource.options.database} (${sslMode})`,
);

const normalizeExpectedType = (column) => {
  const type = column.type;
  if (type === Number) return "integer";
  if (type === String) return "character varying";
  if (type === Boolean) return "boolean";
  if (type === Date) return "timestamp without time zone";

  const normalized = String(type).toLowerCase();
  const aliases = {
    int: "integer",
    int4: "integer",
    varchar: "character varying",
    character: "character",
    char: "character",
    decimal: "numeric",
    timestamp: "timestamp without time zone",
    timestamptz: "timestamp with time zone",
    time: "time without time zone",
    enum: "user-defined",
  };
  return aliases[normalized] ?? normalized;
};

const qualifiedTableName = (metadata) =>
  metadata.schema
    ? `${metadata.schema}.${metadata.tableName}`
    : metadata.tableName;

const toStringArray = (value) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  const contents =
    value.startsWith("{") && value.endsWith("}") ? value.slice(1, -1) : value;
  if (!contents) return [];
  return contents.split(",").map((item) => item.replace(/^"|"$/g, ""));
};

const main = async () => {
  const failures = [];
  await AppDataSource.initialize();

  try {
    const columns = await AppDataSource.query(`
      SELECT table_schema, table_name, column_name, is_nullable, data_type,
        udt_name, character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = current_schema()
    `);
    const columnByKey = new Map(
      columns.map((column) => [
        `${column.table_name}.${column.column_name}`,
        column,
      ]),
    );

    const enumRows = await AppDataSource.query(`
      SELECT type_name,
        array_agg(enum_value::text ORDER BY enum_order)::text[] AS enum_values
      FROM (
        SELECT type.typname AS type_name, enum.enumlabel AS enum_value,
          enum.enumsortorder AS enum_order
        FROM pg_type type
        JOIN pg_enum enum ON enum.enumtypid = type.oid
        JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
        WHERE namespace.nspname = current_schema()
      ) values_by_type
      GROUP BY type_name
    `);
    const enumValues = new Map(
      enumRows.map((row) => [row.type_name, toStringArray(row.enum_values)]),
    );

    const foreignKeys = await AppDataSource.query(`
      SELECT source.relname AS table_name,
        array_agg(source_column.attname::text ORDER BY source_key.ordinality)::text[] AS columns,
        target.relname AS referenced_table,
        array_agg(target_column.attname::text ORDER BY source_key.ordinality)::text[]
          AS referenced_columns,
        constraint_record.confdeltype AS delete_action
      FROM pg_constraint constraint_record
      JOIN pg_class source ON source.oid = constraint_record.conrelid
      JOIN pg_namespace namespace ON namespace.oid = source.relnamespace
      JOIN pg_class target ON target.oid = constraint_record.confrelid
      JOIN unnest(constraint_record.conkey) WITH ORDINALITY source_key(attnum, ordinality)
        ON TRUE
      JOIN unnest(constraint_record.confkey) WITH ORDINALITY target_key(attnum, ordinality)
        ON target_key.ordinality = source_key.ordinality
      JOIN pg_attribute source_column
        ON source_column.attrelid = source.oid AND source_column.attnum = source_key.attnum
      JOIN pg_attribute target_column
        ON target_column.attrelid = target.oid AND target_column.attnum = target_key.attnum
      WHERE constraint_record.contype = 'f' AND namespace.nspname = current_schema()
      GROUP BY source.relname, target.relname, constraint_record.oid,
        constraint_record.confdeltype
    `);
    const deleteActions = {
      a: "NO ACTION",
      r: "RESTRICT",
      c: "CASCADE",
      n: "SET NULL",
      d: "SET DEFAULT",
    };
    for (const foreignKey of foreignKeys) {
      foreignKey.columns = toStringArray(foreignKey.columns);
      foreignKey.referenced_columns = toStringArray(
        foreignKey.referenced_columns,
      );
    }

    for (const metadata of AppDataSource.entityMetadatas) {
      const table = qualifiedTableName(metadata);
      for (const expected of metadata.columns) {
        const actual = columnByKey.get(
          `${metadata.tableName}.${expected.databaseName}`,
        );
        if (!actual) {
          failures.push(
            `${table}.${expected.databaseName}: required column is missing`,
          );
          continue;
        }

        const expectedType = normalizeExpectedType(expected);
        const reportedType = actual.data_type.toLowerCase();
        const actualType =
          reportedType === "user-defined" && expectedType !== "user-defined"
            ? actual.udt_name.toLowerCase()
            : reportedType;
        if (actualType !== expectedType) {
          failures.push(
            `${table}.${expected.databaseName}: expected ${expectedType}, ` +
              `found ${actual.data_type}${reportedType === "user-defined" ? ` (${actual.udt_name})` : ""}`,
          );
        }

        const expectedNullable = expected.isNullable ? "YES" : "NO";
        if (actual.is_nullable !== expectedNullable) {
          failures.push(
            `${table}.${expected.databaseName}: expected nullable=${expected.isNullable}, ` +
              `found nullable=${actual.is_nullable === "YES"}`,
          );
        }

        if (
          expected.length &&
          Number(expected.length) !== actual.character_maximum_length
        ) {
          failures.push(
            `${table}.${expected.databaseName}: expected length ${expected.length}, ` +
              `found ${actual.character_maximum_length}`,
          );
        }

        if (
          expected.precision !== undefined &&
          expected.precision !== null &&
          Number(expected.precision) !== actual.numeric_precision
        ) {
          failures.push(
            `${table}.${expected.databaseName}: expected precision ${expected.precision}, ` +
              `found ${actual.numeric_precision}`,
          );
        }
        if (
          expected.scale !== undefined &&
          expected.scale !== null &&
          Number(expected.scale) !== actual.numeric_scale
        ) {
          failures.push(
            `${table}.${expected.databaseName}: expected scale ${expected.scale}, ` +
              `found ${actual.numeric_scale}`,
          );
        }

        if (expectedType === "user-defined") {
          const expectedEnum = [...new Set((expected.enum ?? []).map(String))];
          const actualEnum = enumValues.get(actual.udt_name) ?? [];
          if (expectedEnum.join("\u0000") !== actualEnum.join("\u0000")) {
            failures.push(
              `${table}.${expected.databaseName}: enum ${actual.udt_name} values differ; ` +
                `expected [${expectedEnum.join(", ")}], found [${actualEnum.join(", ")}]`,
            );
          }
        }
      }

      for (const expected of metadata.foreignKeys) {
        const expectedColumns = expected.columns.map(
          (column) => column.databaseName,
        );
        const referencedColumns = expected.referencedColumns.map(
          (column) => column.databaseName,
        );
        const match = foreignKeys.find(
          (actual) =>
            actual.table_name === metadata.tableName &&
            actual.referenced_table ===
              expected.referencedEntityMetadata.tableName &&
            actual.columns.join("\u0000") === expectedColumns.join("\u0000") &&
            actual.referenced_columns.join("\u0000") ===
              referencedColumns.join("\u0000"),
        );
        if (!match) {
          failures.push(
            `${table}(${expectedColumns.join(", ")}): required foreign key to ` +
              `${expected.referencedEntityMetadata.tableName}(${referencedColumns.join(", ")}) is missing`,
          );
          continue;
        }
        const expectedDelete = (expected.onDelete ?? "NO ACTION").toUpperCase();
        const actualDelete = deleteActions[match.delete_action];
        if (actualDelete !== expectedDelete) {
          failures.push(
            `${table}(${expectedColumns.join(", ")}): expected ON DELETE ${expectedDelete}, ` +
              `found ${actualDelete}`,
          );
        }
      }
    }

    if (failures.length) {
      console.error("Schema compatibility validation failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `Schema compatibility validated for ${AppDataSource.entityMetadatas.length} entities ` +
        `without weakening database-only constraints or indexes.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
};

main().catch((error) => {
  console.error("Schema compatibility validation failed unexpectedly:", error);
  process.exitCode = 1;
});
