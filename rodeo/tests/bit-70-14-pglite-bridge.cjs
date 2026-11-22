// IPC adapter for the BIT-70-14 Python assertions. PostgreSQL stays in memory.
// BIT70_PGLITE_MODULE points to a local @electric-sql/pglite dist/index.cjs.
const fs = require('node:fs');
const readline = require('node:readline');
const { PGlite } = require(process.env.BIT70_PGLITE_MODULE);

function field(value) {
  if (value === null || value === undefined) return '';
  if (value === true) return 't';
  if (value === false) return 'f';
  return String(value);
}

(async () => {
  const db = new PGlite();
  console.log(JSON.stringify({ ready: true }));
  for await (const line of readline.createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.op === 'close') {
      await db.close();
      console.log(JSON.stringify({ returncode: 0, stdout: '', stderr: '' }));
      break;
    }
    try {
      const sql = message.op === 'file'
        ? fs.readFileSync(message.path, 'utf8') : message.sql;
      const results = await db.exec(sql);
      const rows = results.flatMap((result) => result.rows ?? []);
      const stdout = rows.map((row) => Object.values(row).map(field).join('|')).join('\n');
      console.log(JSON.stringify({ returncode: 0, stdout, stderr: '' }));
    } catch (error) {
      try { await db.exec('ROLLBACK'); } catch { /* no active transaction */ }
      console.log(JSON.stringify({ returncode: 3, stdout: '',
        stderr: `${error.code ?? ''} ${error.message}` }));
    }
  }
})().catch((error) => { console.error(error); process.exit(1); });
