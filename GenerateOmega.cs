using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Text;
using Microsoft.Data.SqlClient;

class GenerateOmega
{
    static void Main()
    {
        string connStr = @"Data Source=.\SQLEXPRESS;Initial Catalog=Omega;Integrated Security=True;Connect Timeout=60;Encrypt=False";
        string outDir = @"D:\Sushite\Omega_export";
        Directory.CreateDirectory(outDir);
        string schemaFile = Path.Combine(outDir, "Omega_schema.sql");
        string logFile = Path.Combine(outDir, "export_log.txt");

        using (var log = new StreamWriter(logFile, false, Encoding.UTF8))
        {
            log.WriteLine("Export Omega dimulai: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
        }

        var warnings = new List<string>();
        int tableCount = 0, viewCount = 0, procCount = 0, idxCount = 0;

        using (var conn = new SqlConnection(connStr))
        {
            conn.Open();
            log("Koneksi berhasil ke Omega", logFile);
            using (var fs = new StreamWriter(schemaFile, false, Encoding.UTF8))
            {
                fs.WriteLine("-- =============================================================");
                fs.WriteLine("-- Database: Omega (master data)");
                fs.WriteLine("-- Dibuat dari SQL Server 2019 Express (compatibility 100)");
                fs.WriteLine("-- Target: SQL Server 2005 - run this script on the production server");
                fs.WriteLine("-- File: Omega_schema.sql");
                fs.WriteLine("-- CATATAN: datetimeoffset diganti ke datetime (tidak ada di 2005)");
                fs.WriteLine("-- =============================================================");
                fs.WriteLine("USE [Omega];");
                fs.WriteLine("GO");
                fs.WriteLine();

                // 1. Drop tables views procedures triggers (IF EXISTS - SQL 2005 syntax)
                // Tables - get list sorted for dependency order (child tables first for drops)
                var tables = new List<string>();
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name FROM sys.tables
                      WHERE name NOT LIKE 'dtproperties' AND name NOT LIKE 'sysdiagrams'
                      ORDER BY name", conn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read()) tables.Add(r.GetString(0));
                }
                // note: for drops order reversed (children first) - simplified: use CASCADE via FK drops
                fs.WriteLine("-- 1. Drop existing objects (FK constraints first, then tables)");
                fs.WriteLine("/* Drop foreign keys (if any) */");
                // FK drops handled by dropping constraints
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name + ']|[' + t.name + ']'
                      FROM sys.foreign_keys fk
                      INNER JOIN sys.tables t ON fk.parent_object_id = t.object_id
                      ORDER BY t.name", conn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var fkName = r.GetString(0); // schema.name
                        var parts = fkName.Split(']');
                        var schema = parts[0]; var constraint = parts[1].Replace('|','.');
                        // r.GetString format: schema.constraint]|table
                        // parse back
                        var raw = r.GetString(0);
                        var pipe = raw.IndexOf("]|");
                        if (pipe > 0)
                        {
                            var cname = raw.Substring(0, pipe);
                            var tname = raw.Substring(pipe + 2);
                            fs.WriteLine("IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = N'" + cname.Substring(cname.IndexOf('.')+1) + "' AND parent_object_id = OBJECT_ID(N'[" + tname + "]'))");
                            fs.WriteLine("ALTER TABLE [" + tname + "] DROP CONSTRAINT [" + cname.Substring(cname.IndexOf('.')+1) + "];");
                            fs.WriteLine("GO");
                        }
                    }
                }
                fs.WriteLine();

                // Delete data? Not for schema-only. Skip.

                // Drop triggers
                var triggers = new List<string>();
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name FROM sys.triggers WHERE parent_class = 1 AND is_ms_shipped = 0", conn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read()) triggers.Add(r.GetString(0));
                }
                foreach (var trg in triggers)
                {
                    var name = trg.Split('.')[1];
                    fs.WriteLine("IF EXISTS (SELECT * FROM sys.triggers WHERE name = N'" + name + "') DROP TRIGGER [" + trg + "];");
                    fs.WriteLine("GO");
                }
                fs.WriteLine();

                // Drop views & procedures
                var views = new List<string>();
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name FROM sys.views", conn))
                using (var r = cmd.ExecuteReader()) { while (r.Read()) views.Add(r.GetString(0)); }
                foreach (var v in views)
                {
                    var name = v.Split('.')[1];
                    fs.WriteLine("IF EXISTS (SELECT * FROM sys.views WHERE name = N'" + name + "') DROP VIEW [" + v + "];");
                    fs.WriteLine("GO");
                }
                var procs = new List<string>();
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name FROM sys.procedures WHERE type='P'", conn))
                using (var r = cmd.ExecuteReader()) { while (r.Read()) procs.Add(r.GetString(0)); }
                foreach (var p in procs)
                {
                    var name = p.Split('.')[1];
                    fs.WriteLine("IF EXISTS (SELECT * FROM sys.procedures WHERE name = N'" + name + "' AND type = 'P') DROP PROCEDURE [" + p + "];");
                    fs.WriteLine("GO");
                }
                fs.WriteLine();

                // Drop tables (most dependent first)
                var tableObjs = new List<string>();
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name FROM sys.tables WHERE name NOT LIKE 'dtproperties' AND name NOT LIKE 'sysdiagrams'", conn))
                using (var r = cmd.ExecuteReader()) { while (r.Read()) tableObjs.Add(r.GetString(0)); }
                tableObjs.Reverse(); // child-ish order (imperfect but FKs dropped first)
                foreach (var t in tableObjs)
                {
                    var name = t.Split('.')[1];
                    fs.WriteLine("IF EXISTS (SELECT * FROM sys.tables WHERE name = N'" + name + "') DROP TABLE [" + t + "];");
                    fs.WriteLine("GO");
                }
                fs.WriteLine();

                // 2. Create tables
                fs.WriteLine("-- 2. Create tables (datetimeoffset -> datetime for SQL 2005 compat)");
                fs.WriteLine();
                var tableNames = new List<string>();
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name FROM sys.tables
                      WHERE name NOT LIKE 'dtproperties' AND name NOT LIKE 'sysdiagrams' ORDER BY name", conn))
                using (var r = cmd.ExecuteReader()) { while (r.Read()) tableNames.Add(r.GetString(0)); }

                foreach (var t in tableNames)
                {
                    var parts = t.Split('.');
                    string schema = parts[0], name = parts[1];
                    var cols = new List<Tuple<string,int,int,int,int,bool,string>>();
                    var pkCols = new List<string>();
                    var defaults = new List<Tuple<string,string>>();
                    using (var cmd = new SqlCommand(
                        @"SELECT c.name, c.column_id, c.max_length, c.precision, c.scale, c.is_nullable, TYPE_NAME(c.user_type_id) + CASE WHEN c.max_length > 0 AND TYPE_NAME(c.user_type_id) IN ('varchar','nvarchar','char','nchar','varbinary','binary') THEN '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length AS VARCHAR(10)) END + ')' WHEN TYPE_NAME(c.user_type_id) IN ('decimal','numeric') THEN '(' + CAST(c.precision AS VARCHAR(10)) + ',' + CAST(c.scale AS VARCHAR(10)) + ')' ELSE '' END AS typeDef
                          FROM sys.columns c
                          INNER JOIN sys.tables t ON c.object_id = t.object_id
                          INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                          WHERE s.name = @s AND t.name = @t ORDER BY c.column_id", conn))
                    {
                        cmd.Parameters.AddWithValue("@s", schema);
                        cmd.Parameters.AddWithValue("@t", name);
                        using (var r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                string typeDef = r.GetString(6).ToLower();
                                if (typeDef.StartsWith("datetimeoffset"))
                                {
                                    typeDef = "datetime";
                                    warnings.Add(string.Format("Kolom datetimeoffset di {0}.{1} -> datetime", t, r.GetString(0)));
                                }
                                cols.Add(Tuple.Create(r.GetString(0), r.GetInt32(1), r.GetInt16(2), (int)r.GetByte(3), (int)r.GetByte(4), r.GetBoolean(5), typeDef));
                            }
                        }
                    }
                    // PK
                    using (var cmd = new SqlCommand(
                        @"SELECT c.name FROM sys.index_columns ic
                          INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                          INNER JOIN sys.tables t ON ic.object_id = t.object_id
                          INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                          INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                          WHERE s.name = @s AND t.name = @t AND i.is_primary_key = 1
                          ORDER BY ic.key_ordinal", conn))
                    {
                        cmd.Parameters.AddWithValue("@s", schema);
                        cmd.Parameters.AddWithValue("@t", name);
                        using (var r = cmd.ExecuteReader()) { while (r.Read()) pkCols.Add(r.GetString(0)); }
                    }
                    // Defaults
                    using (var cmd = new SqlCommand(
                        @"SELECT OBJECT_NAME(parent_object_id) AS tbl, c.name AS col, d.definition
                          FROM sys.default_constraints d
                          INNER JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id
                          WHERE OBJECT_NAME(parent_object_id) = @t AND SCHEMA_NAME((SELECT schema_id FROM sys.tables WHERE object_id = d.parent_object_id)) = @s", conn))
                    {
                        cmd.Parameters.AddWithValue("@s", schema);
                        cmd.Parameters.AddWithValue("@t", name);
                        using (var r = cmd.ExecuteReader()) { while (r.Read()) defaults.Add(Tuple.Create(r.GetString(1), r.GetString(2))); }
                    }

                    fs.WriteLine("CREATE TABLE [" + t + "] (");
                    for (int i = 0; i < cols.Count; i++)
                    {
                        var c = cols[i];
                        string nullStr = c.Item6 ? "NULL" : "NOT NULL";
                        string comma = (i < cols.Count - 1 || pkCols.Count > 0) ? "," : "";
                        fs.WriteLine("    [" + c.Item1 + "] " + c.Item7 + " " + nullStr + comma);
                    }
                    if (pkCols.Count > 0)
                    {
                        var pkList = new List<string>();
                        foreach (var p in pkCols) pkList.Add("[" + p + "]");
                        fs.WriteLine("    CONSTRAINT [PK_" + name + "] PRIMARY KEY (" + string.Join(", ", pkList) + ")");
                    }
                    fs.WriteLine(");");
                    foreach (var def in defaults)
                    {
                        fs.WriteLine("ALTER TABLE [" + t + "] ADD CONSTRAINT [DF_" + name + "_" + def.Item1 + "] DEFAULT " + def.Item2 + " FOR [" + def.Item1 + "];");
                    }
                    fs.WriteLine("GO");
                    fs.WriteLine();
                    tableCount++;
                }

                // 3. Create non-clustered indexes (skip PK already created)
                fs.WriteLine("-- 3. Create indexes");
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(t.schema_id) + '.' + t.name AS tbl, i.name AS idx,
                      i.is_unique, i.is_primary_key,
                      STRING_AGG('[' + c.name + ']', ',') AS cols,
                      i.type_desc
                      FROM sys.indexes i
                      INNER JOIN sys.tables t ON i.object_id = t.object_id
                      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                      WHERE i.is_primary_key = 0 AND i.type IN (1,2) AND i.is_unique = 0
                      GROUP BY SCHEMA_NAME(t.schema_id), t.name, i.name, i.is_unique, i.is_primary_key, i.type_desc
                      ORDER BY tbl, idx", conn))
                {
                    try
                    {
                        using (var r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                string tbl = r.GetString(0);
                                string idx = r.GetString(1);
                                string cols = r.GetString(4);
                                string uniq = r.GetBoolean(2) ? "UNIQUE " : "";
                                fs.WriteLine("CREATE " + uniq + "INDEX [" + idx + "] ON [" + tbl + "] (" + cols + ");");
                                fs.WriteLine("GO");
                                idxCount++;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        // STRING_AGG may not exist in compat 100 for this query alternative fallback
                        log("Index generation warning: " + ex.Message, logFile);
                    }
                }

                // 4. Create views (definition from sys.sql_modules)
                fs.WriteLine("-- 4. Create views");
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name, definition FROM sys.views
                      INNER JOIN sys.sql_modules m ON views.object_id = m.object_id ORDER BY name", conn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        string v = r.GetString(0);
                        string def = r.IsDBNull(1) ? "" : r.GetString(1);
                        if (!string.IsNullOrEmpty(def))
                        {
                            fs.WriteLine("CREATE VIEW [" + v + "] AS " + def.Trim() + ";");
                            fs.WriteLine("GO");
                            viewCount++;
                        }
                    }
                }
                fs.WriteLine();

                // 5. Create stored procedures (definition)
                fs.WriteLine("-- 5. Create stored procedures");
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(schema_id) + '.' + name, definition FROM sys.procedures p
                      INNER JOIN sys.sql_modules m ON p.object_id = m.object_id WHERE p.type='P' ORDER BY name", conn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        string p = r.GetString(0);
                        string def = r.IsDBNull(1) ? "" : r.GetString(1);
                        if (!string.IsNullOrEmpty(def))
                        {
                            // def already contains CREATE PROCEDURE
                            fs.WriteLine(def.Trim() + ";");
                            fs.WriteLine("GO");
                            procCount++;
                        }
                    }
                }
                fs.WriteLine();

                // 6. Create triggers (definition)
                fs.WriteLine("-- 6. Create triggers");
                using (var cmd = new SqlCommand(
                    @"SELECT SCHEMA_NAME(parent_object_id) + '.' + OBJECT_NAME(parent_object_id) + '|' + name, definition
                      FROM sys.triggers t INNER JOIN sys.sql_modules m ON t.object_id = m.object_id
                      WHERE parent_class=1 AND is_ms_shipped=0 ORDER BY parent_object_id, name", conn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        string trg = r.GetString(0);
                        string def = r.IsDBNull(1) ? "" : r.GetString(1);
                        if (!string.IsNullOrEmpty(def))
                        {
                            // def already contains CREATE TRIGGER
                            fs.WriteLine(def.Trim() + ";");
                            fs.WriteLine("GO");
                        }
                    }
                }
                fs.WriteLine();
                fs.WriteLine("-- END OF SCHEMA SCRIPT");
            }

            log(string.Format("Selesai: tabel={0} view={1} proc={2} index={3}", tableCount, viewCount, procCount, idxCount), logFile);
            foreach (var w in warnings)
            {
                log("PERINGATAN: " + w, logFile);
            }
            log("File output: " + schemaFile, logFile);
        }
        Console.WriteLine("EXPORT_DONE tables={0} views={1} procs={2} indexes={3} warnings={4}", tableCount, viewCount, procCount, idxCount, warnings.Count);
    }

    static void log(string msg, string logFile)
    {
        File.AppendAllText(logFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + Environment.NewLine);
    }
}
