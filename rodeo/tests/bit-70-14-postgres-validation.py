"""BIT-70-14: validate the published SQL on disposable localhost PostgreSQL.

Usage: python rodeo/tests/bit-70-14-postgres-validation.py --pg-bin PATH
Requires only Python stdlib and local PostgreSQL binaries. No remote DB URLs.
"""

import argparse
import hashlib
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
from types import SimpleNamespace
import json


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "rodeo/tests/bit-70-14-postgres-fixture.sql"
MIGRATION = ROOT / "rodeo/js/modules/visitas/migration-BIT-70-05-rls-visitas.sql"
ROLLBACK = ROOT / "rodeo/js/modules/visitas/rollback-BIT-70-05-rls-visitas.sql"
EST_A = "11111111-1111-4111-8111-111111111111"
EST_B = "22222222-2222-4222-8222-222222222222"
VIS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
VIS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
VIS_FREE = "ffffffff-ffff-4fff-8fff-fffffffffff0"
OBS_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
OBS_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
OBS_NULL = "ffffffff-ffff-4fff-8fff-fffffffffff6"
USERS = {
    "ADMINISTRADOR": "00000000-0000-4000-8000-000000000001",
    "PROFESIONAL": "00000000-0000-4000-8000-000000000002",
    "OPERADOR_CAMPO": "00000000-0000-4000-8000-000000000003",
}
CHECK_COUNT = 0


def digest(path):
    data = path.read_bytes()
    return len(data), hashlib.sha256(data).hexdigest()


def free_loopback_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class LocalPostgres:
    def __init__(self, pg_bin, base):
        self.bin = pg_bin
        self.data = base / "data"
        self.log = base / "postgres.log"
        self.port = free_loopback_port()
        self.started = False
        self.env = os.environ.copy()
        for key in tuple(self.env):
            if key.startswith("PG"):
                self.env.pop(key)
        self.env["PATH"] = str(pg_bin) + os.pathsep + self.env.get("PATH", "")

    def executable(self, name):
        suffix = ".exe" if os.name == "nt" else ""
        path = self.bin / (name + suffix)
        if not path.is_file():
            raise FileNotFoundError(path)
        return str(path)

    def command(self, name, *args, ok=True):
        result = subprocess.run(
            [self.executable(name), *map(str, args)],
            env=self.env, text=True, encoding="utf-8", errors="replace",
            capture_output=True, timeout=120,
        )
        if ok and result.returncode:
            raise AssertionError(
                f"{name} failed ({result.returncode}):\n{result.stdout}\n{result.stderr}"
            )
        return result

    def start(self):
        self.command("initdb", "-D", self.data, "-U", "postgres", "-A", "trust",
                     "--encoding=UTF8", "--no-instructions")
        self.command("pg_ctl", "-D", self.data, "-l", self.log, "-w", "start",
                     "-o", f"-h 127.0.0.1 -p {self.port}")
        self.started = True

    def stop(self):
        if self.started:
            self.command("pg_ctl", "-D", self.data, "-m", "immediate", "-w", "stop")
            self.started = False

    def psql(self, sql=None, file=None):
        args = ["-X", "-q", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1",
                "-v", "VERBOSITY=verbose", "-h", "127.0.0.1", "-p", self.port,
                "-U", "postgres", "-d", "postgres"]
        if sql is not None:
            args += ["-c", sql]
        else:
            args += ["-f", file]
        return self.command("psql", *args, ok=False)

    def file(self, path):
        result = self.psql(file=path)
        if result.returncode:
            raise AssertionError(f"SQL file {path.name} failed:\n{result.stdout}\n{result.stderr}")


class PGlitePostgres:
    """Run the same assertions on PostgreSQL compiled to local WebAssembly."""

    def __init__(self, module):
        self.module = module
        self.process = None

    def start(self):
        env = os.environ.copy()
        env["BIT70_PGLITE_MODULE"] = str(self.module)
        self.process = subprocess.Popen(
            ["node", str(Path(__file__).with_name("bit-70-14-pglite-bridge.cjs"))],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", env=env,
        )
        ready = self.process.stdout.readline()
        if not ready or json.loads(ready).get("ready") is not True:
            raise AssertionError(f"PGlite failed to start: {self.process.stderr.read()}")

    def stop(self):
        if self.process and self.process.poll() is None:
            self.call({"op": "close"})
            self.process.stdin.close()
            self.process.wait(timeout=10)

    def call(self, payload):
        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise AssertionError(f"PGlite bridge exited: {self.process.stderr.read()}")
        return SimpleNamespace(**json.loads(line))

    def psql(self, sql=None, file=None):
        if file is not None:
            return self.call({"op": "file", "path": str(file)})
        return self.call({"op": "sql", "sql": sql})

    def file(self, path):
        result = self.psql(file=path)
        if result.returncode:
            raise AssertionError(f"SQL file {path.name} failed:\n{result.stderr}")


def case(pg, label, query, role=None, output=None, error=None):
    global CHECK_COUNT
    if role:
        sql = ("BEGIN; SET ROLE authenticated; "
               f"SET request.jwt.claim.sub = '{USERS[role]}'; {query}; ROLLBACK;")
    else:
        sql = query
    result = pg.psql(sql=sql)
    if error:
        if result.returncode == 0 or not re.search(error, result.stderr):
            raise AssertionError(f"{label}: expected {error}, got {result.returncode}"
                                 f"\n{result.stdout}\n{result.stderr}")
    elif result.returncode != 0:
        raise AssertionError(f"{label}: unexpected SQL error\n{result.stdout}\n{result.stderr}")
    elif output is not None and result.stdout.strip() != output:
        raise AssertionError(f"{label}: expected {output!r}, got {result.stdout.strip()!r}")
    CHECK_COUNT += 1
    print(f"PASS {label}")
    return result.stdout.strip()


def validate_integrated(pg):
    case(pg, "integrated policy catalog", "SELECT count(*) FROM pg_policies "
         "WHERE schemaname='public' AND tablename='visitas' "
         "AND coalesce(qual,with_check) LIKE '%get_mi_rol%'", output="4")
    case(pg, "trigger binding", "SELECT tgfoid::regprocedure FROM pg_trigger "
         "WHERE tgrelid='public.observaciones_campo'::regclass "
         "AND tgname='observaciones_campo_validar_coherencia_visita'",
         output="bit70_observaciones_validar_visita_rls()")
    case(pg, "effective execute denied", "SELECT "
         "has_function_privilege('anon','public.bit70_observaciones_validar_visita_rls()','EXECUTE') AS anon_execute,"
         "has_function_privilege('authenticated','public.bit70_observaciones_validar_visita_rls()','EXECUTE') AS authenticated_execute,"
         "has_function_privilege('service_role','public.bit70_observaciones_validar_visita_rls()','EXECUTE') AS service_execute",
         output="f|f|f")
    case(pg, "owner-only function ACL", "SELECT bool_and(a.grantee=p.proowner) "
         "FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a "
         "WHERE p.oid='public.bit70_observaciones_validar_visita_rls()'::regprocedure",
         output="t")

    for role, expected in (("ADMINISTRADOR", "3"), ("PROFESIONAL", "2"),
                           ("OPERADOR_CAMPO", "0")):
        case(pg, f"{role} visit SELECT", "SELECT count(*) FROM public.visitas",
             role=role, output=expected)
    case(pg, "admin cannot read inaccessible C", "SELECT count(*) FROM public.visitas "
         "WHERE establecimiento_id='33333333-3333-4333-8333-333333333333'",
         role="ADMINISTRADOR", output="0")
    case(pg, "professional cannot read B", "SELECT count(*) FROM public.visitas "
         f"WHERE establecimiento_id='{EST_B}'", role="PROFESIONAL", output="0")

    for role in ("ADMINISTRADOR", "PROFESIONAL"):
        case(pg, f"{role} visit INSERT A", "INSERT INTO public.visitas(id,establecimiento_id) "
             f"VALUES ('ffffffff-ffff-4fff-8fff-fffffffffff1','{EST_A}') RETURNING id",
             role=role, output="ffffffff-ffff-4fff-8fff-fffffffffff1")
        case(pg, f"{role} visit UPDATE A", "UPDATE public.visitas SET descripcion='edit' "
             f"WHERE id='{VIS_A}' RETURNING id", role=role, output=VIS_A)
        case(pg, f"{role} visit DELETE A", f"DELETE FROM public.visitas WHERE id='{VIS_FREE}' "
             "RETURNING id", role=role, output=VIS_FREE)
    case(pg, "operator visit INSERT denied", "INSERT INTO public.visitas(id,establecimiento_id) "
         f"VALUES ('ffffffff-ffff-4fff-8fff-fffffffffff2','{EST_A}')",
         role="OPERADOR_CAMPO", error=r"42501")
    case(pg, "operator visit UPDATE denied", "UPDATE public.visitas SET descripcion='edit' "
         f"WHERE id='{VIS_A}' RETURNING id", role="OPERADOR_CAMPO", output="")
    case(pg, "operator visit DELETE denied", f"DELETE FROM public.visitas WHERE id='{VIS_FREE}' "
         "RETURNING id", role="OPERADOR_CAMPO", output="")
    case(pg, "professional visit INSERT B denied", "INSERT INTO public.visitas(id,establecimiento_id) "
         f"VALUES ('ffffffff-ffff-4fff-8fff-fffffffffff3','{EST_B}')",
         role="PROFESIONAL", error=r"42501")
    case(pg, "professional visit UPDATE B denied", "UPDATE public.visitas SET descripcion='edit' "
         f"WHERE id='{VIS_B}' RETURNING id", role="PROFESIONAL", output="")
    case(pg, "professional visit DELETE B denied", f"DELETE FROM public.visitas WHERE id='{VIS_B}' "
         "RETURNING id", role="PROFESIONAL", output="")

    for role, obs in (("ADMINISTRADOR", OBS_B), ("PROFESIONAL", OBS_A),
                      ("OPERADOR_CAMPO", OBS_A)):
        case(pg, f"{role} observation edit keeps link", "UPDATE public.observaciones_campo "
             f"SET descripcion='edit' WHERE id='{obs}' RETURNING visita_id",
             role=role, output=VIS_B if obs == OBS_B else VIS_A)
    case(pg, "professional cannot edit observation B", "UPDATE public.observaciones_campo "
         f"SET descripcion='edit' WHERE id='{OBS_B}' RETURNING id",
         role="PROFESIONAL", output="")
    case(pg, "operator observation without link", "INSERT INTO public.observaciones_campo "
         "(id,establecimiento_id,visita_id) VALUES "
         f"('ffffffff-ffff-4fff-8fff-fffffffffff4','{EST_A}',NULL) RETURNING id",
         role="OPERADOR_CAMPO", output="ffffffff-ffff-4fff-8fff-fffffffffff4")
    case(pg, "operator cannot create linked observation", "INSERT INTO public.observaciones_campo "
         "(id,establecimiento_id,visita_id) VALUES "
         f"('ffffffff-ffff-4fff-8fff-fffffffffff5','{EST_A}','{VIS_A}')",
         role="OPERADOR_CAMPO", error=r"42501")
    case(pg, "operator cannot unlink visit", "UPDATE public.observaciones_campo "
         f"SET visita_id=NULL WHERE id='{OBS_A}'", role="OPERADOR_CAMPO", error=r"42501")
    case(pg, "operator cannot link existing observation", "UPDATE public.observaciones_campo "
         f"SET visita_id='{VIS_A}' WHERE id='{OBS_NULL}'",
         role="OPERADOR_CAMPO", error=r"42501")
    case(pg, "professional can unlink visit", "UPDATE public.observaciones_campo "
         f"SET visita_id=NULL WHERE id='{OBS_A}' RETURNING id", role="PROFESIONAL", output=OBS_A)
    for role in ("ADMINISTRADOR", "PROFESIONAL"):
        case(pg, f"{role} can link existing observation", "UPDATE public.observaciones_campo "
             f"SET visita_id='{VIS_A}' WHERE id='{OBS_NULL}' RETURNING visita_id",
             role=role, output=VIS_A)
        case(pg, f"{role} can create linked observation", "INSERT INTO public.observaciones_campo "
             "(id,establecimiento_id,visita_id) VALUES "
             f"('ffffffff-ffff-4fff-8fff-fffffffffff7','{EST_A}','{VIS_A}') "
             "RETURNING visita_id", role=role, output=VIS_A)
    case(pg, "admin cannot link across establishments", "UPDATE public.observaciones_campo "
         f"SET visita_id='{VIS_B}' WHERE id='{OBS_A}'", role="ADMINISTRADOR", error=r"23514")
    case(pg, "professional cannot link nonexistent visit", "UPDATE public.observaciones_campo "
         "SET visita_id='99999999-9999-4999-8999-999999999999' "
         f"WHERE id='{OBS_A}'", role="PROFESIONAL", error=r"23514")
    case(pg, "observation establishment immutable", "UPDATE public.observaciones_campo "
         f"SET establecimiento_id='{EST_B}' WHERE id='{OBS_A}'",
         role="ADMINISTRADOR", error=r"42501")


def validate_rollback(pg):
    case(pg, "rollback four baseline policies", "SELECT count(*) FROM pg_policies "
         "WHERE schemaname='public' AND tablename='visitas' "
         "AND regexp_replace(coalesce(qual,with_check,''),'[[:space:]]+','','g')="
         "'tiene_acceso_establecimiento(establecimiento_id)'", output="4")
    case(pg, "rollback trigger binding", "SELECT tgfoid::regprocedure FROM pg_trigger "
         "WHERE tgrelid='public.observaciones_campo'::regclass "
         "AND tgname='observaciones_campo_validar_coherencia_visita'",
         output="observaciones_campo_validar_coherencia_visita()")
    case(pg, "new trigger function removed", "SELECT "
         "to_regprocedure('public.bit70_observaciones_validar_visita_rls()') IS NULL",
         output="t")
    case(pg, "operator visit access restored", "SELECT count(*) FROM public.visitas",
         role="OPERADOR_CAMPO", output="2")
    case(pg, "operator observation edit after rollback", "UPDATE public.observaciones_campo "
         f"SET descripcion='edit' WHERE id='{OBS_A}' RETURNING id",
         role="OPERADOR_CAMPO", output=OBS_A)


def validate_drift_guards(pg):
    case(pg, "make fictional baseline drift", "ALTER POLICY visitas_select ON public.visitas "
         "USING (true)")
    failed = pg.psql(file=MIGRATION)
    if failed.returncode == 0 or "policies de visitas distintas del baseline" not in failed.stderr:
        raise AssertionError(f"migration accepted baseline drift: {failed.stderr}")
    print("PASS migration rejects altered baseline atomically")
    case(pg, "failed migration created no function", "SELECT "
         "to_regprocedure('public.bit70_observaciones_validar_visita_rls()') IS NULL",
         output="t")
    case(pg, "restore fictional baseline", "ALTER POLICY visitas_select ON public.visitas "
         "USING (public.tiene_acceso_establecimiento(establecimiento_id))")
    pg.file(MIGRATION)
    print("PASS migration after baseline restoration")
    case(pg, "make fictional integrated drift", "ALTER POLICY visitas_update ON public.visitas "
         "WITH CHECK (true)")
    failed = pg.psql(file=ROLLBACK)
    if failed.returncode == 0 or "policies distintas del estado esperado" not in failed.stderr:
        raise AssertionError(f"rollback accepted integrated drift: {failed.stderr}")
    print("PASS rollback rejects altered integrated policy atomically")
    case(pg, "failed rollback keeps new function", "SELECT "
         "to_regprocedure('public.bit70_observaciones_validar_visita_rls()') IS NOT NULL",
         output="t")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    engine = parser.add_mutually_exclusive_group(required=True)
    engine.add_argument("--pg-bin", type=Path)
    engine.add_argument("--pglite-module", type=Path)
    args = parser.parse_args()
    for path in (FIXTURE, MIGRATION, ROLLBACK):
        size, sha = digest(path)
        print(f"ARTIFACT {path.name} {size} bytes SHA256 {sha}")
    with tempfile.TemporaryDirectory(prefix="bit70-pg14-") as temp:
        pg = (LocalPostgres(args.pg_bin.resolve(), Path(temp)) if args.pg_bin
              else PGlitePostgres(args.pglite_module.resolve()))
        try:
            pg.start()
            print("POSTGRES", pg.psql(sql="SELECT version()").stdout.strip())
            pg.file(FIXTURE)
            print("PASS fictional baseline fixture")
            pg.file(MIGRATION)
            print("PASS complete migration")
            validate_integrated(pg)
            pg.file(ROLLBACK)
            print("PASS complete rollback")
            validate_rollback(pg)
            validate_drift_guards(pg)
        finally:
            pg.stop()
    print(f"RESULT {CHECK_COUNT} SQL cases passed; complete migration, rollback and "
          "two drift guards passed; disposable database removed")


if __name__ == "__main__":
    main()
