"""BIT-70-21 focused security checks on a fictional disposable PostgreSQL.

Usage: python rodeo/tests/bit-70-21-postgres-validation.py --pglite-module PATH
No production URL or credentials are accepted.
"""

import argparse
import importlib.util
from pathlib import Path
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
spec = importlib.util.spec_from_file_location("bit70_20", HERE / "bit-70-20-postgres-validation.py")
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)

A, B = prior.A, prior.B
ANIMAL = prior.ANIMAL_A
USER = prior.USER
PHOTO = prior.PHOTO_DEST


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pglite-module", type=Path, required=True)
    args = parser.parse_args()
    pg = prior.prior.PGlitePostgres(args.pglite_module.resolve())
    pg.start()
    try:
        for path in (prior.BASE, prior.R01, prior.F07, prior.EXT):
            pg.file(path)
        prior.check(pg, "fixture: professional has both establishments",
                    "INSERT INTO public.perfiles_establecimientos VALUES "
                    f"('{USER['PROFESIONAL']}','{B}')")
        prior.check(pg, "fixture: one-establishment professionals",
                    "INSERT INTO public.perfiles(id,rol) VALUES "
                    f"('{USER['PROFESIONAL_B']}','PROFESIONAL'),"
                    f"('{USER['PROFESIONAL_A']}','PROFESIONAL'); "
                    "INSERT INTO public.perfiles_establecimientos VALUES "
                    f"('{USER['PROFESIONAL_B']}','{B}'),"
                    f"('{USER['PROFESIONAL_A']}','{A}')")
        prior.check(pg, "fixture: historical Observation links Patient",
                    f"BEGIN; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                    "UPDATE public.observaciones_campo "
                    f"SET animal_id='{ANIMAL}' "
                    "WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; COMMIT;")
        for path in (prior.R03, prior.R02, prior.R04_LOTES,
                     prior.R04_TUTORES, prior.R02_PACIENTES):
            pg.file(path)
        print("PASS baseline SQL and complemented transfer migration")

        prior.check(pg, "null role denied before touching Patient",
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',NULL,NULL)",
                    role="authenticated", error="42501")
        prior.check(pg, "unknown role denied despite access to both",
                    "BEGIN; INSERT INTO public.perfiles(id,rol) VALUES "
                    "('99999999-7777-4777-8777-777777777777','DESCONOCIDO'); "
                    "INSERT INTO public.perfiles_establecimientos VALUES "
                    f"('99999999-7777-4777-8777-777777777777','{A}'),"
                    f"('99999999-7777-4777-8777-777777777777','{B}'); "
                    "SET ROLE authenticated; "
                    "SET request.jwt.claim.sub='99999999-7777-4777-8777-777777777777'; "
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',NULL,NULL); ROLLBACK;",
                    error="42501")
        prior.check(pg, "active Lot closed, Tutor cleared, history remains at origin",
                    "BEGIN; SET ROLE authenticated; "
                    f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',NULL,NULL) IS NULL; "
                    "RESET ROLE; SELECT a.establecimiento_actual_id, "
                    "a.tutor_responsable_id IS NULL AS tutor_clear, "
                    "la.fecha_fin IS NOT NULL AS lot_closed, "
                    "ac.establecimiento_id AS attention_est,oc.establecimiento_id AS observation_est "
                    "FROM public.animales a JOIN public.lotes_animales la ON la.animal_id=a.id "
                    "JOIN public.atenciones_clinicas ac ON ac.animal_id=a.id "
                    "JOIN public.observaciones_campo oc ON oc.animal_id=a.id "
                    f"WHERE a.id='{ANIMAL}'; ROLLBACK;",
                    output=f"t\n{B}|t|t|{A}|{A}")
        prior.check(pg, "destination-only user cannot read origin history",
                    "BEGIN; SET ROLE authenticated; "
                    f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',NULL,NULL) IS NULL; "
                    f"SET request.jwt.claim.sub='{USER['PROFESIONAL_B']}'; "
                    "SELECT (SELECT count(*) FROM public.atenciones_clinicas "
                    f"WHERE animal_id='{ANIMAL}') AS attentions, "
                    "(SELECT count(*) FROM public.observaciones_campo "
                    f"WHERE animal_id='{ANIMAL}') AS observations, "
                    f"(SELECT count(*) FROM public.animales WHERE id='{ANIMAL}') AS patients; ROLLBACK;",
                    output="t\n0|0|1")
        prior.check(pg, "origin-only user sees history without destination Patient fields",
                    "BEGIN; SET ROLE authenticated; "
                    f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',NULL,NULL) IS NULL; "
                    f"SET request.jwt.claim.sub='{USER['PROFESIONAL_A']}'; "
                    "SELECT count(*), bool_and(a.id IS NULL) AS patient_hidden "
                    "FROM public.atenciones_clinicas ac LEFT JOIN public.animales a ON a.id=ac.animal_id "
                    f"WHERE ac.animal_id='{ANIMAL}'; ROLLBACK;",
                    output="t\n1|t")
        for table, fields in (
            ("atenciones_clinicas", "notas"),
            ("observaciones_campo", "descripcion"),
        ):
            prior.check(pg, f"new origin {table} link rejected",
                        "BEGIN; SET ROLE authenticated; "
                        f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                        f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',NULL,NULL); "
                        f"INSERT INTO public.{table}(id,establecimiento_id,animal_id,{fields}) "
                        f"VALUES (gen_random_uuid(),'{A}','{ANIMAL}','nuevo'); ROLLBACK;",
                        error="Paciente fuera del establecimiento del nuevo registro")
            prior.check(pg, f"new destination {table} link allowed",
                        "BEGIN; SET ROLE authenticated; "
                        f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                        f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',NULL,NULL) IS NULL; "
                        f"SET request.jwt.claim.sub='{USER['PROFESIONAL_B']}'; "
                        f"INSERT INTO public.{table}(id,establecimiento_id,animal_id,{fields}) "
                        f"VALUES (gen_random_uuid(),'{B}','{ANIMAL}','nuevo') RETURNING establecimiento_id; "
                        "ROLLBACK;", output=f"t\n{B}")
        prior.check(pg, "existing origin Attention remains editable",
                    "BEGIN; SET ROLE authenticated; "
                    f"SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',NULL,NULL) IS NULL; "
                    f"SET request.jwt.claim.sub='{USER['PROFESIONAL_A']}'; "
                    "UPDATE public.atenciones_clinicas SET notas='editado' "
                    "WHERE id='11111111-7777-4777-8777-777777777777' RETURNING establecimiento_id; "
                    "ROLLBACK;", output=f"t\n{A}")
        prior.check(pg, "shared photo path prevented by unique index",
                    f"BEGIN; UPDATE public.animales SET foto_path='{A}/old.jpg' "
                    f"WHERE id='{ANIMAL}'; "
                    "INSERT INTO public.animales(id,establecimiento_actual_id,foto_path) "
                    f"VALUES(gen_random_uuid(),'{A}','{A}/old.jpg'); ROLLBACK;",
                    error="23505")
        prior.check(pg, "fictional destination Storage object and owner",
                    "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES "
                    f"('paciente-fotos','{PHOTO}','{USER['PROFESIONAL']}')")
        prior.check(pg, "photo path for another Patient denied",
                    f"BEGIN; UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL}'; "
                    f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',"
                    f"'{A}/old.jpg','{B}/{prior.ANIMAL_B}/wrong.jpg'); ROLLBACK;",
                    error="22023")
        prior.check(pg, "photo object owned by different uploader denied",
                    "BEGIN; INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES "
                    f"('paciente-fotos','{B}/{ANIMAL}/other.jpg','{USER['ADMINISTRADOR']}'); "
                    f"UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL}'; "
                    f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',"
                    f"'{A}/old.jpg','{B}/{ANIMAL}/other.jpg'); ROLLBACK;",
                    error="23503")
        prior.check(pg, "owned destination photo accepted",
                    f"BEGIN; UPDATE public.animales SET foto_path='{A}/old.jpg' WHERE id='{ANIMAL}'; "
                    f"SET ROLE authenticated; SET request.jwt.claim.sub='{USER['PROFESIONAL']}'; "
                    f"SELECT public.bit70_trasladar_paciente('{ANIMAL}','{A}','{B}',"
                    f"'{A}/old.jpg','{PHOTO}'); ROLLBACK;", output=f"{A}/old.jpg")
        prior.file_check(pg, "independent supplemented transfer rollback",
                         prior.R02_PACIENTES_ROLLBACK)
        prior.check(pg, "rollback preserved existing R03 and F07 guards",
                    "SELECT to_regprocedure('public.bit70_validar_lote_animal_activo()') "
                    "IS NOT NULL AS r03, "
                    "to_regprocedure('public.bit70_visitas_bloquear_cambio_establecimiento()') "
                    "IS NOT NULL AS f07", output="t|t")
        print("RESULT focused BIT-70-21 checks PASS; fictional database discarded")
    finally:
        pg.stop()


if __name__ == "__main__":
    main()
