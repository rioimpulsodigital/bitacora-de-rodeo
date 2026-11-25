"""BIT-70-20 focused SQL validation on fictional disposable PostgreSQL.

Usage: python rodeo/tests/bit-70-20-postgres-validation.py --pglite-module PATH
No production URL or credentials are accepted.
"""

import argparse
import hashlib
import importlib.util
from pathlib import Path
import re
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
BASE = HERE / "bit-70-14-postgres-fixture.sql"
EXT = HERE / "bit-70-20-postgres-fixture.sql"
R01 = ROOT / "rodeo/js/modules/visitas/migration-BIT-70-05-rls-visitas.sql"
F07 = ROOT / "rodeo/js/modules/visitas/migration-BIT-70-18-visitas-establecimiento-inmutable.sql"
R03 = ROOT / "rodeo/js/modules/animales/migration-BIT-70-20-R03-coherencia-lotes.sql"
R03_ROLLBACK = ROOT / "rodeo/js/modules/animales/rollback-BIT-70-20-R03-coherencia-lotes.sql"
R02 = ROOT / "rodeo/js/modules/animales/migration-BIT-70-20-R02-establecimientos-inmutables.sql"
R02_ROLLBACK = ROOT / "rodeo/js/modules/animales/rollback-BIT-70-20-R02-establecimientos-inmutables.sql"
R04_LOTES = ROOT / "rodeo/js/modules/animales/migration-BIT-70-20-R04-permisos-lotes.sql"
R04_LOTES_ROLLBACK = ROOT / "rodeo/js/modules/animales/rollback-BIT-70-20-R04-permisos-lotes.sql"
R04_TUTORES = ROOT / "rodeo/js/modules/animales/migration-BIT-70-20-R04-vinculos-tutores.sql"
R04_TUTORES_ROLLBACK = ROOT / "rodeo/js/modules/animales/rollback-BIT-70-20-R04-vinculos-tutores.sql"
R02_PACIENTES = ROOT / "rodeo/js/modules/animales/migration-BIT-70-20-R02-traslado-pacientes.sql"
R02_PACIENTES_ROLLBACK = ROOT / "rodeo/js/modules/animales/rollback-BIT-70-20-R02-traslado-pacientes.sql"
A = "11111111-1111-4111-8111-111111111111"
B = "22222222-2222-4222-8222-222222222222"
ANIMAL_A = "11111111-cccc-4ccc-8ccc-cccccccccccc"
ANIMAL_B = "22222222-dddd-4ddd-8ddd-dddddddddddd"
LOTE_A = "11111111-eeee-4eee-8eee-eeeeeeeeeeee"
LOTE_B = "22222222-ffff-4fff-8fff-ffffffffffff"
MEMBER_A = "11111111-9999-4999-8999-999999999999"
PHOTO_DEST = f"{B}/{ANIMAL_A}/new.jpg"
USER = {
    "ADMINISTRADOR": "00000000-0000-4000-8000-000000000001",
    "PROFESIONAL": "00000000-0000-4000-8000-000000000002",
    "OPERADOR_CAMPO": "00000000-0000-4000-8000-000000000003",
    "PROFESIONAL_B": "00000000-0000-4000-8000-000000000004",
    "PROFESIONAL_A": "00000000-0000-4000-8000-000000000005",
}

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("bit70_pg14", HERE / "bit-70-14-postgres-validation.py")
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
COUNT = 0


def check(pg, label, sql, *, role=None, output=None, error=None):
    global COUNT
    if role:
        sql = (f"BEGIN; SET ROLE {'authenticated' if role in USER else role}; "
               + (f"SET request.jwt.claim.sub='{USER[role]}'; " if role in USER
                  else "SET request.jwt.claim.sub=''; ")
               + sql + "; ROLLBACK;")
    result = pg.psql(sql=sql)
    if error:
        if result.returncode == 0 or not re.search(error, result.stderr):
            raise AssertionError(f"{label}: expected {error}, got {result.stdout!r} {result.stderr!r}")
    elif result.returncode:
        raise AssertionError(f"{label}: {result.stderr}")
    elif output is not None and result.stdout.strip() != output:
        raise AssertionError(f"{label}: expected {output!r}, got {result.stdout.strip()!r}")
    COUNT += 1
    print("PASS", label)


def file_check(pg, label, path, *, error=None):
    global COUNT
    result = pg.psql(file=path)
    if error:
        if result.returncode == 0 or error not in result.stderr:
            raise AssertionError(f"{label}: expected {error}, got {result.stderr!r}")
    elif result.returncode:
        raise AssertionError(f"{label}: {result.stderr}")
    COUNT += 1
    print("PASS", label)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pglite-module", type=Path, required=True)
    args = parser.parse_args()
    for path in (R03, R03_ROLLBACK, R02, R02_ROLLBACK,
                 R04_LOTES, R04_LOTES_ROLLBACK, R04_TUTORES, R04_TUTORES_ROLLBACK,
                 R02_PACIENTES, R02_PACIENTES_ROLLBACK):
        data = path.read_bytes()
        print(f"ARTIFACT {path.name} {len(data)} bytes SHA256 {hashlib.sha256(data).hexdigest()}")
    with tempfile.TemporaryDirectory(prefix="bit70-pg20-"):
        pg = prior.PGlitePostgres(args.pglite_module.resolve())
        try:
            pg.start()
            print("POSTGRES", pg.psql(sql="SELECT version()").stdout.strip())
            for path in (BASE, R01, F07, EXT):
                pg.file(path)
            print("PASS fictional R-01/P-01/F-07 baseline")
            check(pg, "grant professional access to fictional B",
                  "INSERT INTO public.perfiles_establecimientos VALUES "
                  f"('{USER['PROFESIONAL']}','{B}')")
            check(pg, "create fictional single-establishment professionals",
                  "INSERT INTO public.perfiles(id,rol) VALUES "
                  f"('{USER['PROFESIONAL_B']}','PROFESIONAL'),"
                  f"('{USER['PROFESIONAL_A']}','PROFESIONAL'); "
                  "INSERT INTO public.perfiles_establecimientos VALUES "
                  f"('{USER['PROFESIONAL_B']}','{B}'),"
                  f"('{USER['PROFESIONAL_A']}','{A}')")
            check(pg, "link fictional historical Observation to Patient A",
                  f"BEGIN; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  "UPDATE public.observaciones_campo SET "
                  f"animal_id='{ANIMAL_A}' WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' "
                  "RETURNING animal_id; COMMIT;", output=ANIMAL_A)
            cross_id = "99999999-1111-4111-8111-111111111111"
            check(pg, "baseline accepts cross-establishment active membership",
                  "INSERT INTO public.lotes_animales(id,animal_id,lote_id) VALUES "
                  f"('{cross_id}','{ANIMAL_A}','{LOTE_B}')")
            file_check(pg, "R03 preflight rejects existing active mismatch", R03,
                       error="membresias activas incoherentes")
            check(pg, "failed R03 migration leaves no function",
                  "SELECT to_regprocedure('public.bit70_validar_lote_animal_activo()') IS NULL",
                  output="t")
            check(pg, "restore fictional baseline", f"DELETE FROM public.lotes_animales WHERE id='{cross_id}'")
            file_check(pg, "complete R03 migration", R03)
            check(pg, "three R03 triggers enabled always",
                  "SELECT count(*) FROM pg_trigger WHERE "
                  "tgfoid='public.bit70_validar_lote_animal_activo()'::regprocedure "
                  "AND tgenabled='A'", output="3")
            check(pg, "R03 trigger function ACL owner only",
                  "SELECT has_function_privilege('anon',"
                  "'public.bit70_validar_lote_animal_activo()','EXECUTE') AS anon_exec,"
                  "has_function_privilege('authenticated',"
                  "'public.bit70_validar_lote_animal_activo()','EXECUTE') AS auth_exec,"
                  "has_function_privilege('service_role',"
                  "'public.bit70_validar_lote_animal_activo()','EXECUTE') AS service_exec",
                  output="f|f|f")
            file_check(pg, "R03 rejects duplicate application", R03,
                       error="objetos ya existentes")
            check(pg, "professional cannot add Patient A to Lot B",
                  "INSERT INTO public.lotes_animales(id,animal_id,lote_id) VALUES "
                  f"('99999999-2222-4222-8222-222222222222','{ANIMAL_A}','{LOTE_B}')",
                  role="PROFESIONAL", error="23514")
            check(pg, "pre-R04 operator can assign a Lot when creating Patient A",
                  "INSERT INTO public.animales(id,establecimiento_actual_id,nombre) VALUES "
                  f"('99999999-3333-4333-8333-333333333333','{A}','Alta ficticia'); "
                  "INSERT INTO public.lotes_animales(id,animal_id,lote_id) VALUES "
                  f"('99999999-5555-4555-8555-555555555555',"
                  "'99999999-3333-4333-8333-333333333333',"
                  f"'{LOTE_A}') RETURNING lote_id", role="OPERADOR_CAMPO", output=LOTE_A)
            check(pg, "retarget active membership across establishments rejected",
                  f"BEGIN; UPDATE public.lotes_animales SET lote_id='{LOTE_B}' "
                  f"WHERE id='{MEMBER_A}'; ROLLBACK;", error="23514")
            check(pg, "reopen historical membership in wrong establishment rejected",
                  f"BEGIN; INSERT INTO public.lotes_animales(id,animal_id,lote_id,fecha_fin) "
                  f"VALUES ('99999999-4444-4444-8444-444444444444','{ANIMAL_A}',"
                  f"'{LOTE_B}',now()); UPDATE public.lotes_animales SET fecha_fin=NULL "
                  "WHERE id='99999999-4444-4444-8444-444444444444'; ROLLBACK;",
                  error="23514")
            check(pg, "moving Patient with active Lot blocked by R03",
                  f"BEGIN; UPDATE public.animales SET establecimiento_actual_id='{B}' "
                  f"WHERE id='{ANIMAL_A}'; ROLLBACK;", error="23514")
            check(pg, "moving Lot with active Patient blocked by R03",
                  f"BEGIN; UPDATE public.lotes SET establecimiento_id='{B}' "
                  f"WHERE id='{LOTE_A}'; ROLLBACK;", error="23514")
            check(pg, "closed Lot history remains allowed after Patient transfer",
                  f"BEGIN; UPDATE public.lotes_animales SET fecha_fin=now() WHERE id='{MEMBER_A}'; "
                  f"UPDATE public.animales SET establecimiento_actual_id='{B}' WHERE id='{ANIMAL_A}'; "
                  "SELECT count(*) FROM public.lotes_animales la JOIN public.animales a "
                  "ON a.id=la.animal_id JOIN public.lotes l ON l.id=la.lote_id "
                  f"WHERE la.id='{MEMBER_A}' AND la.fecha_fin IS NOT NULL "
                  "AND a.establecimiento_actual_id IS DISTINCT FROM l.establecimiento_id; "
                  "ROLLBACK;", output="1")
            check(pg, "active memberships remain coherent",
                  "SELECT count(*) FROM public.lotes_animales la JOIN public.animales a "
                  "ON a.id=la.animal_id JOIN public.lotes l ON l.id=la.lote_id "
                  "WHERE la.fecha_fin IS NULL AND "
                  "a.establecimiento_actual_id IS DISTINCT FROM l.establecimiento_id",
                  output="0")
            file_check(pg, "complete R02 immutability migration", R02)
            check(pg, "three R02 triggers enabled always",
                  "SELECT count(*) FROM pg_trigger WHERE "
                  "tgfoid='public.bit70_bloquear_traslado_registro()'::regprocedure "
                  "AND tgenabled='A'", output="3")
            check(pg, "professional legitimate Attention edit",
                  "UPDATE public.atenciones_clinicas SET notas='Editada', "
                  f"establecimiento_id='{A}' WHERE id='11111111-7777-4777-8777-777777777777' "
                  "RETURNING establecimiento_id", role="PROFESIONAL", output=A)
            check(pg, "professional cannot move Attention A to B",
                  f"UPDATE public.atenciones_clinicas SET establecimiento_id='{B}' "
                  "WHERE id='11111111-7777-4777-8777-777777777777'",
                  role="PROFESIONAL", error="23514")
            check(pg, "administrator cannot move Novedad A to B",
                  f"UPDATE public.novedades_establecimiento SET establecimiento_id='{B}' "
                  "WHERE id='11111111-8888-4888-8888-888888888888'",
                  role="ADMINISTRADOR", error="23514")
            check(pg, "operator legitimate Novedad edit",
                  "UPDATE public.novedades_establecimiento SET notas='Editada' "
                  "WHERE id='11111111-8888-4888-8888-888888888888' RETURNING id",
                  role="OPERADOR_CAMPO", output="11111111-8888-4888-8888-888888888888")
            check(pg, "owner cannot move an empty Lot B",
                  f"BEGIN; UPDATE public.lotes SET establecimiento_id='{A}' "
                  f"WHERE id='{LOTE_B}'; ROLLBACK;", error="23514")
            file_check(pg, "complete R04 Lot role migration", R04_LOTES)
            check(pg, "operator still reads Lot A",
                  f"SELECT nombre FROM public.lotes WHERE id='{LOTE_A}'",
                  role="OPERADOR_CAMPO", output="Lote A ficticio")
            check(pg, "operator cannot create Lot A",
                  "INSERT INTO public.lotes(id,establecimiento_id,nombre) VALUES "
                  f"('99999999-6666-4666-8666-666666666666','{A}','Nuevo')",
                  role="OPERADOR_CAMPO", error="42501")
            check(pg, "operator cannot update Lot A",
                  f"UPDATE public.lotes SET nombre='No' WHERE id='{LOTE_A}' RETURNING id",
                  role="OPERADOR_CAMPO", output="")
            check(pg, "operator cannot delete Lot A",
                  f"DELETE FROM public.lotes WHERE id='{LOTE_A}' RETURNING id",
                  role="OPERADOR_CAMPO", output="")
            check(pg, "operator cannot assign Patient A to Lot A",
                  "INSERT INTO public.lotes_animales(id,animal_id,lote_id) VALUES "
                  f"('99999999-5555-4555-8555-555555555555','{ANIMAL_A}','{LOTE_A}')",
                  role="OPERADOR_CAMPO", error="42501")
            check(pg, "operator cannot close an active Lot membership",
                  f"UPDATE public.lotes_animales SET fecha_fin=now() "
                  f"WHERE id='{MEMBER_A}' RETURNING id",
                  role="OPERADOR_CAMPO", output="")
            for role in ("ADMINISTRADOR", "PROFESIONAL"):
                check(pg, f"{role} can edit Lot A without moving it",
                      f"UPDATE public.lotes SET nombre='Edicion' WHERE id='{LOTE_A}' "
                      "RETURNING establecimiento_id", role=role, output=A)
                check(pg, f"{role} can close a Lot membership",
                      f"UPDATE public.lotes_animales SET fecha_fin=now() "
                      f"WHERE id='{MEMBER_A}' RETURNING id", role=role,
                      output=MEMBER_A)
            check(pg, "create fictional legacy D1 Tutor mismatch",
                  f"UPDATE public.animales SET tutor_responsable_id='11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' "
                  f"WHERE id='{ANIMAL_B}'")
            file_check(pg, "complete R04 Tutor link migration", R04_TUTORES)
            check(pg, "Tutor trigger function ACL owner only",
                  "SELECT has_function_privilege('authenticated',"
                  "'public.bit70_validar_tutor_paciente()','EXECUTE')",
                  output="f")
            check(pg, "operator cannot link an existing Tutor",
                  "INSERT INTO public.personas_establecimientos(persona_id,establecimiento_id) "
                  f"VALUES ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{B}')",
                  role="OPERADOR_CAMPO", error="42501")
            check(pg, "professional can share Tutor A with B",
                  "INSERT INTO public.personas_establecimientos(persona_id,establecimiento_id) "
                  f"VALUES ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{B}') RETURNING establecimiento_id",
                  role="PROFESIONAL", output=B)
            check(pg, "operator can create Tutor with first link through RPC",
                  f"SELECT nombre FROM public.crear_persona_con_establecimiento('Tutor nuevo',NULL,NULL,'{A}')",
                  role="OPERADOR_CAMPO", output="Tutor nuevo")
            check(pg, "wrong Tutor assignment rejected",
                  f"UPDATE public.animales SET tutor_responsable_id='22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb' "
                  f"WHERE id='{ANIMAL_A}'", role="PROFESIONAL", error="23514")
            check(pg, "legitimate Patient edit keeps valid Tutor",
                  f"UPDATE public.animales SET nombre='Editado' WHERE id='{ANIMAL_A}' RETURNING id",
                  role="PROFESIONAL", output=ANIMAL_A)
            check(pg, "legacy D1 mismatch does not block unrelated edit",
                  f"UPDATE public.animales SET nombre='Legacy edit' WHERE id='{ANIMAL_B}' RETURNING id",
                  role="PROFESIONAL", output=ANIMAL_B)
            check(pg, "used Tutor link cannot be deleted",
                  "DELETE FROM public.personas_establecimientos WHERE "
                  f"persona_id='11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND establecimiento_id='{A}'",
                  role="PROFESIONAL", error="23514")
            check(pg, "Tutor link key cannot be moved",
                  "UPDATE public.personas_establecimientos "
                  f"SET establecimiento_id='{A}' WHERE "
                  f"persona_id='22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND establecimiento_id='{B}'",
                  role="PROFESIONAL", error="23514")
            file_check(pg, "complete R02 Patient transfer migration", R02_PACIENTES)
            check(pg, "Patient transfer RPC ACL limited to authenticated",
                  "SELECT has_function_privilege('anon',"
                  "'public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)','EXECUTE') AS anon,"
                  "has_function_privilege('authenticated',"
                  "'public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)','EXECUTE') AS auth,"
                  "has_function_privilege('service_role',"
                  "'public.bit70_trasladar_paciente(uuid,uuid,uuid,text,text)','EXECUTE') AS service",
                  output="f|t|f")
            check(pg, "operator cannot transfer Patient",
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',NULL,NULL)",
                  role="OPERADOR_CAMPO", error="42501")
            check(pg, "missing profile cannot transfer Patient",
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',NULL,NULL)",
                  role="authenticated", error="42501")
            check(pg, "unknown role cannot transfer Patient",
                  "BEGIN; INSERT INTO public.perfiles(id,rol) VALUES "
                  "('99999999-7777-4777-8777-777777777777','ROL_DESCONOCIDO'); "
                  "INSERT INTO public.perfiles_establecimientos VALUES "
                  f"('99999999-7777-4777-8777-777777777777','{A}'),"
                  f"('99999999-7777-4777-8777-777777777777','{B}'); "
                  "SET ROLE authenticated; SET request.jwt.claim.sub='99999999-7777-4777-8777-777777777777'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',NULL,NULL); ROLLBACK;",
                  error="42501")
            check(pg, "professional cannot move Patient directly even with both accesses",
                  f"UPDATE public.animales SET establecimiento_actual_id='{B}' WHERE id='{ANIMAL_A}'",
                  role="PROFESIONAL", error="42501")
            check(pg, "transfer rejects stale origin",
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{B}','{B}',NULL,NULL)",
                  role="PROFESIONAL", error="42501")
            check(pg, "transfer rejects destination without access",
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}',"
                  "'33333333-3333-4333-8333-333333333333',NULL,NULL)",
                  role="PROFESIONAL", error="42501")
            check(pg, "professional controlled transfer closes Lot and clears unlinked Tutor",
                  "SELECT public.bit70_trasladar_paciente("
                  f"'{ANIMAL_A}','{A}','{B}',NULL,NULL) IS NULL; RESET ROLE; "
                  "SELECT a.establecimiento_actual_id, a.tutor_responsable_id IS NULL AS tutor_clear, "
                  "la.fecha_fin IS NOT NULL AS lot_closed FROM public.animales a JOIN public.lotes_animales la "
                  f"ON la.animal_id=a.id WHERE a.id='{ANIMAL_A}'",
                  role="PROFESIONAL", output=f"t\n{B}|t|t")
            check(pg, "historical Attention and Observation stay isolated at origin",
                  "BEGIN; SET ROLE authenticated; "
                  f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',NULL,NULL) IS NULL; "
                  f"SET request.jwt.claim.sub='{USER['PROFESIONAL_B']}'; "
                  "SELECT (SELECT count(*) FROM public.atenciones_clinicas WHERE animal_id='"
                  f"{ANIMAL_A}') AS attentions,(SELECT count(*) FROM public.observaciones_campo "
                  f"WHERE animal_id='{ANIMAL_A}') AS observations,"
                  f"(SELECT count(*) FROM public.animales WHERE id='{ANIMAL_A}') AS patients; "
                  f"SET request.jwt.claim.sub='{USER['PROFESIONAL_A']}'; "
                  "SELECT (SELECT count(*) FROM public.atenciones_clinicas WHERE animal_id='"
                  f"{ANIMAL_A}') AS attentions,(SELECT count(*) FROM public.observaciones_campo "
                  f"WHERE animal_id='{ANIMAL_A}') AS observations,"
                  f"(SELECT count(*) FROM public.animales WHERE id='{ANIMAL_A}') AS patients; ROLLBACK;",
                  output="t\n0|0|1\n1|1|0")
            check(pg, "new origin Attention cannot link transferred Patient",
                  "BEGIN; SET ROLE authenticated; "
                  f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',NULL,NULL); "
                  "INSERT INTO public.atenciones_clinicas(id,establecimiento_id,animal_id,notas) "
                  f"VALUES ('99999999-8888-4888-8888-888888888888','{A}','{ANIMAL_A}','nueva'); ROLLBACK;",
                  error="23514")
            check(pg, "new origin Observation cannot link transferred Patient",
                  "BEGIN; SET ROLE authenticated; "
                  f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',NULL,NULL); "
                  "INSERT INTO public.observaciones_campo(id,establecimiento_id,animal_id,descripcion) "
                  f"VALUES ('99999999-9999-4999-8999-888888888888','{A}','{ANIMAL_A}','nueva'); ROLLBACK;",
                  error="23514")
            check(pg, "historical Attention remains editable at origin",
                  "BEGIN; SET ROLE authenticated; "
                  f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',NULL,NULL); "
                  f"SET request.jwt.claim.sub='{USER['PROFESIONAL_A']}'; "
                  "UPDATE public.atenciones_clinicas SET notas='seguimiento historico' "
                  "WHERE id='11111111-7777-4777-8777-777777777777' RETURNING establecimiento_id; ROLLBACK;",
                  output=A)
            check(pg, "photo transfer rejects missing destination copy",
                  f"BEGIN; UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL_A}'; "
                  f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}','{A}/old.jpg',NULL); ROLLBACK;",
                  error="22023")
            check(pg, "photo transfer rejects invented destination object",
                  f"BEGIN; UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL_A}'; "
                  f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',"
                  f"'{A}/old.jpg','{PHOTO_DEST}'); ROLLBACK;", error="23503")
            check(pg, "add fictional copied Storage object",
                  f"INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES"
                  f"('paciente-fotos','{PHOTO_DEST}','{USER['PROFESIONAL']}')")
            check(pg, "photo path for another Patient rejected",
                  f"BEGIN; UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL_A}'; "
                  f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',"
                  f"'{A}/old.jpg','{B}/{ANIMAL_B}/wrong.jpg'); ROLLBACK;", error="22023")
            check(pg, "photo uploaded by another user rejected",
                  "BEGIN; INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES "
                  f"('paciente-fotos','{B}/{ANIMAL_A}/other.jpg','{USER['ADMINISTRADOR']}'); "
                  f"UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL_A}'; "
                  f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',"
                  f"'{A}/old.jpg','{B}/{ANIMAL_A}/other.jpg'); ROLLBACK;", error="23503")
            check(pg, "photo path cannot be shared between Patients",
                  f"BEGIN; UPDATE public.animales SET foto_path='{A}/same.jpg' WHERE id='{ANIMAL_A}'; "
                  "INSERT INTO public.animales(id,establecimiento_actual_id,nombre,foto_path) VALUES "
                  f"('99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{A}','Otro','{A}/same.jpg'); ROLLBACK;",
                  error="23505")
            check(pg, "photo transfer accepts destination prefix and returns old path",
                  f"BEGIN; UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL_A}'; "
                  f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}','{A}/old.jpg','{PHOTO_DEST}'); "
                  "ROLLBACK;", output=f"{A}/old.jpg")
            check(pg, "photo transfer rejects stale photo path",
                  f"BEGIN; UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL_A}'; "
                  f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',"
                  f"'{A}/other.jpg','{PHOTO_DEST}'); ROLLBACK;", error="42501")
            check(pg, "direct photo update cannot cross establishment",
                  f"UPDATE public.animales SET foto_path='{B}/wrong.jpg' WHERE id='{ANIMAL_A}'",
                  role="PROFESIONAL", error="23514")
            check(pg, "Tutor retained when already linked in destination",
                  "BEGIN; INSERT INTO public.personas_establecimientos(persona_id,establecimiento_id) "
                  f"VALUES ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{B}'); "
                  f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                  f"SELECT public.bit70_trasladar_paciente('{ANIMAL_A}','{A}','{B}',NULL,NULL); "
                  f"SELECT tutor_responsable_id FROM public.animales WHERE id='{ANIMAL_A}'; ROLLBACK;",
                  output="11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
            file_check(pg, "complete independent R02 Patient rollback", R02_PACIENTES_ROLLBACK)
            check(pg, "Patient rollback leaves Tutor guard",
                  "SELECT to_regprocedure('public.bit70_validar_tutor_paciente()') IS NOT NULL",
                  output="t")
            file_check(pg, "complete independent R04 Tutor rollback", R04_TUTORES_ROLLBACK)
            check(pg, "Tutor rollback leaves Lot role policies",
                  "SELECT with_check LIKE '%get_mi_rol%' FROM pg_policies "
                  "WHERE schemaname='public' AND tablename='lotes' AND policyname='lotes_insert'",
                  output="t")
            file_check(pg, "complete independent R04 Lot rollback", R04_LOTES_ROLLBACK)
            check(pg, "R04 Lot rollback restores operator create",
                  "INSERT INTO public.lotes(id,establecimiento_id,nombre) VALUES "
                  f"('99999999-6666-4666-8666-666666666666','{A}','Nuevo') "
                  "RETURNING establecimiento_id", role="OPERADOR_CAMPO", output=A)
            check(pg, "R04 Lot rollback leaves R02 guard installed",
                  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.lotes'::regclass "
                  "AND tgname='bit70_lotes_bloquear_traslado' AND tgenabled='A'",
                  output="1")
            check(pg, "make fictional R02 rollback drift",
                  "ALTER TABLE public.lotes DISABLE TRIGGER bit70_lotes_bloquear_traslado")
            file_check(pg, "R02 rollback rejects drift atomically", R02_ROLLBACK,
                       error="objetos distintos")
            check(pg, "restore fictional R02 trigger",
                  "ALTER TABLE public.lotes ENABLE ALWAYS TRIGGER bit70_lotes_bloquear_traslado")
            file_check(pg, "complete independent R02 rollback", R02_ROLLBACK)
            check(pg, "R02 rollback keeps R03 guard function",
                  "SELECT to_regprocedure('public.bit70_validar_lote_animal_activo()') IS NOT NULL",
                  output="t")
            check(pg, "make fictional rollback drift",
                  "ALTER TABLE public.lotes DISABLE TRIGGER bit70_lotes_validar_animales_activos")
            file_check(pg, "R03 rollback rejects drift atomically", R03_ROLLBACK,
                       error="objetos distintos")
            check(pg, "failed rollback preserves guard function",
                  "SELECT to_regprocedure('public.bit70_validar_lote_animal_activo()') IS NOT NULL",
                  output="t")
            check(pg, "restore fictional R03 trigger",
                  "ALTER TABLE public.lotes ENABLE ALWAYS TRIGGER bit70_lotes_validar_animales_activos")
            file_check(pg, "complete independent R03 rollback", R03_ROLLBACK)
            check(pg, "R03 rollback leaves F07 guard installed",
                  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.visitas'::regclass "
                  "AND tgname='bit70_visitas_bloquear_cambio_establecimiento' AND tgenabled='A'",
                  output="1")
            check(pg, "R03 rollback leaves P01 function installed",
                  "SELECT to_regprocedure('public.bit70_observaciones_validar_visita_rls()') IS NOT NULL",
                  output="t")
        finally:
            pg.stop()
    print(f"RESULT {COUNT} focused SQL checks passed; fictional disposable database removed")


if __name__ == "__main__":
    main()
