// BIT-75 — Backend privilegiado de administracion de usuarios.
// Handler neutral (Request -> Response, solo fetch/Web APIs): corre igual como Supabase Edge Function
// (index.ts) y en Node para las pruebas del Lab. La service_role vive SOLO aqui (secreto del servidor):
// nunca llega al navegador. Cada peticion valida identidad, perfil activo y rol ADMINISTRADOR.
// No devuelve ni registra contrasenas, tokens ni enlaces de acceso: la credencial la elige el propio
// usuario desde el correo de recuperacion.

const ROLES = ['ADMINISTRADOR', 'PROFESIONAL', 'OPERADOR_CAMPO', 'ASISTENTE_VETERINARIO'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>()"',;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const MAX_BODY = 8 * 1024;
const BAN_LARGO = '876000h'; // ~100 anios: bloqueo de Auth equivalente a inactivo

class ApiError extends Error {
  constructor(status, codigo, mensaje) { super(mensaje); this.status = status; this.codigo = codigo; }
}
const bad = (m, c = 'solicitud_invalida') => new ApiError(400, c, m);

export function crearHandler({ supabaseUrl, serviceKey, anonKey, origenesPermitidos = [], redirectTo, fetchFn = fetch }) {
  if (!supabaseUrl || !serviceKey || !anonKey || !redirectTo) throw new Error('configuracion incompleta');
  const base = supabaseUrl.replace(/\/$/, '');
  const svcH = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const r = await fetchFn(`${base}/rest/v1/${path}`, {
      method, headers: { ...svcH, ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* no JSON */ }
    if (!r.ok) { const e = new Error(j?.message ?? `rest ${r.status}`); e.status = r.status; e.pg = j?.code; throw e; }
    return j;
  }
  const rpc = (fn, args = {}) => rest(`rpc/${fn}`, { method: 'POST', body: args });
  async function authAdmin(path, { method = 'GET', body } = {}) {
    const r = await fetchFn(`${base}/auth/v1${path}`, { method, headers: svcH, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* no JSON */ }
    return { ok: r.ok, status: r.status, json: j };
  }

  // Auditoria: nunca rompe la operacion; jamas incluye secretos (solo claves fijas por accion).
  async function auditar(actor, destino, accion, resultado, detalle = {}) {
    try {
      await rest('usuarios_auditoria', { method: 'POST', prefer: 'return=minimal',
        body: { actor_id: actor ?? null, destino_id: destino ?? null, accion, resultado, detalle } });
    } catch { /* la auditoria fallida no debe filtrar informacion ni tumbar la respuesta */ }
  }

  async function identificar(req) {
    const h = req.headers.get('authorization') ?? '';
    const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(h);
    if (!m) throw new ApiError(401, 'sin_sesion', 'Sesion requerida');
    const r = await fetchFn(`${base}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${m[1]}` } });
    if (!r.ok) throw new ApiError(401, 'sesion_invalida', 'Sesion invalida o vencida');
    const u = await r.json();
    if (!u?.id || u.is_anonymous) throw new ApiError(401, 'sesion_invalida', 'Sesion invalida');
    const p = (await rest(`perfiles?id=eq.${u.id}&select=id,rol,activo`))?.[0] ?? null;
    return { id: u.id, perfil: p };
  }

  const getPerfil = async (id) => (await rest(`perfiles?id=eq.${id}&select=id,nombre,rol,activo`))?.[0] ?? null;
  async function validarEstablecimientos(ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || !ids.every((x) => typeof x === 'string' && UUID.test(x)))
      throw bad('Indicá al menos un establecimiento válido');
    const unicos = [...new Set(ids.map((x) => x.toLowerCase()))];
    const filas = await rest(`establecimientos?id=in.(${unicos.join(',')})&select=id`);
    if (filas.length !== unicos.length) throw bad('Algún establecimiento no existe', 'establecimiento_inexistente');
    return unicos;
  }
  const exigirUuid = (v) => { if (typeof v !== 'string' || !UUID.test(v)) throw bad('Usuario inválido'); return v.toLowerCase(); };
  const exigirRol = (v) => { if (!ROLES.includes(v)) throw bad('Rol inválido'); return v; };
  const exigirNombre = (v) => {
    const n = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    if (n.length < 2 || n.length > 120 || /[<>]/.test(n)) throw bad('Nombre inválido (2 a 120 caracteres)');
    return n;
  };

  async function enviarRecuperacion(email) {
    const r = await fetchFn(`${base}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    return r.ok ? 'ok' : (r.status === 429 ? 'limite' : 'fallo');
  }
  async function bloquearAuth(id, bloquear) {
    const r = await authAdmin(`/admin/users/${id}`, { method: 'PUT', body: { ban_duration: bloquear ? BAN_LARGO : 'none' } });
    return r.ok;
  }

  const acciones = {
    async listar() {
      return { usuarios: await rpc('bit75_listar_usuarios') };
    },

    async crear(ctx, b) {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      if (!EMAIL.test(email)) throw bad('Email inválido');
      const nombre = exigirNombre(b.nombre); const rol = exigirRol(b.rol);
      const ests = await validarEstablecimientos(b.establecimientos);
      const existente = (await rpc('bit75_buscar_usuario', { p_email: email }))?.[0] ?? null;
      if (existente?.tiene_perfil) throw new ApiError(409, 'ya_existe', 'Ya existe un usuario con ese email');
      if (existente && !existente.origen_acreditado) {
        // Cuenta Auth preexistente sin perfil y NO originada en un alta parcial propia verificable: no se adopta,
        // no se modifica su credencial ni se le envia nada. Requiere resolucion manual autorizada fuera del modulo.
        await auditar(ctx.actor, existente.id, 'crear', 'denegado', { motivo: 'cuenta_preexistente_no_acreditada' });
        throw new ApiError(409, 'cuenta_preexistente', 'Ya existe una cuenta de acceso con ese email que no fue creada por este módulo. Pedí una revisión al responsable de infraestructura.');
      }

      const etapas = { auth: 'ok', perfil: 'pendiente', vinculos: 'pendiente', correo: 'pendiente' };
      let id = existente?.id;
      try {
        if (!id) {
          // La marca de origen va en app_metadata (solo la clave de servicio puede escribirla) y no hay credencial.
          const r = await authAdmin('/admin/users', { method: 'POST', body: { email, email_confirm: true, app_metadata: { bit75_alta: 'admin-usuarios' } } });
          if (!r.ok || !r.json?.id) throw new ApiError(502, 'auth_fallo', 'No se pudo crear la cuenta de acceso');
          id = r.json.id;
          // Traza verificable de la alta en curso (permite reanudarla si se interrumpe).
          await auditar(ctx.actor, id, 'crear', 'parcial', { etapas: { auth: 'creada' }, rol });
        } else etapas.auth = 'reanudada';
        // Idempotente: reintentar la misma alta completa lo que falte (merge por PK / ignorar duplicados).
        await rest('perfiles?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
          body: { id, nombre, rol, activo: true } });
        etapas.perfil = 'ok';
        await rest('establecimientos_usuarios?on_conflict=perfil_id,establecimiento_id', { method: 'POST',
          prefer: 'resolution=ignore-duplicates,return=minimal',
          body: ests.map((e) => ({ perfil_id: id, establecimiento_id: e })) });
        etapas.vinculos = 'ok';
      } catch (e) {
        await auditar(ctx.actor, id, 'crear', 'error', { etapas, rol, motivo: e.codigo ?? e.pg ?? 'fallo' });
        if (e instanceof ApiError) throw e;
        // La cuenta de acceso queda SIN perfil (sin ningun acceso). Reintentar la misma alta la completa.
        throw new ApiError(500, 'alta_parcial', 'El alta quedó incompleta; reintentá con los mismos datos para completarla');
      }
      // 'aceptado' = Auth acepto el pedido de envio; NO acredita entrega al buzon (depende del SMTP del proyecto).
      const envio = await enviarRecuperacion(email);
      const enviado = envio === 'ok';
      etapas.correo = enviado ? 'aceptado' : (envio === 'limite' ? 'limite_de_envios' : 'fallido');
      await auditar(ctx.actor, id, 'crear', enviado ? 'ok' : 'parcial', { etapas, rol, establecimientos: ests.length });
      return { id, estado: enviado ? 'PENDIENTE_PRIMER_INGRESO' : 'CREADO_SIN_CORREO', correo_aceptado: enviado };
    },

    async reenviar(ctx, b) {
      const id = exigirUuid(b.usuario_id);
      const p = await getPerfil(id);
      if (!p) throw new ApiError(404, 'no_encontrado', 'Usuario no encontrado');
      if (!p.activo) throw new ApiError(409, 'usuario_inactivo', 'El usuario está inactivo');
      const u = await authAdmin(`/admin/users/${id}`);
      if (!u.ok || !u.json?.email) throw new ApiError(404, 'no_encontrado', 'Usuario no encontrado');
      const envio = await enviarRecuperacion(u.json.email);
      await auditar(ctx.actor, id, 'reenviar', envio === 'ok' ? 'ok' : 'error', envio === 'ok' ? {} : { motivo: envio });
      if (envio === 'limite') throw new ApiError(429, 'limite_de_envios', 'Se pidieron demasiados correos seguidos: esperá un minuto y reintentá');
      if (envio !== 'ok') throw new ApiError(502, 'correo_fallido', 'No se pudo enviar el correo');
      return { correo_aceptado: true };
    },

    async actualizar(ctx, b) {
      const id = exigirUuid(b.usuario_id);
      const p = await getPerfil(id);
      if (!p) throw new ApiError(404, 'no_encontrado', 'Usuario no encontrado');
      const cambios = {};
      if (b.nombre !== undefined) cambios.nombre = exigirNombre(b.nombre);
      if (b.rol !== undefined && b.rol !== p.rol) {
        cambios.rol = exigirRol(b.rol);
        if (id === ctx.actor) throw new ApiError(409, 'autocambio', 'No podés cambiar tu propio rol');
        if (p.rol === 'PROFESIONAL') {
          const des = await rest(`bit56_validadores?perfil_id=eq.${id}&select=establecimiento_id`);
          if (des.length) throw new ApiError(409, 'designacion_vigente', 'Es PROFESIONAL validador designado: revocá la designación antes de cambiar el rol');
        }
      }
      if (!Object.keys(cambios).length) throw bad('Sin cambios');
      try { await rest(`perfiles?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: cambios }); }
      catch (e) {
        await auditar(ctx.actor, id, 'actualizar', 'error', { campos: Object.keys(cambios), motivo: e.pg ?? 'fallo' });
        if (e.pg === '23514') throw new ApiError(409, 'ultimo_admin', 'No se puede degradar al último ADMINISTRADOR activo');
        throw new ApiError(500, 'fallo_interno', 'No se pudo actualizar');
      }
      await auditar(ctx.actor, id, 'actualizar', 'ok', { campos: Object.keys(cambios), rol_nuevo: cambios.rol, rol_anterior: cambios.rol ? p.rol : undefined });
      return { ok: true };
    },

    async establecimientos(ctx, b) {
      const id = exigirUuid(b.usuario_id);
      if (!(await getPerfil(id))) throw new ApiError(404, 'no_encontrado', 'Usuario no encontrado');
      const nuevos = await validarEstablecimientos(b.establecimientos);
      const actuales = (await rest(`establecimientos_usuarios?perfil_id=eq.${id}&select=establecimiento_id`)).map((x) => x.establecimiento_id);
      const quitar = actuales.filter((e) => !nuevos.includes(e));
      const agregar = nuevos.filter((e) => !actuales.includes(e));
      if (quitar.length) {
        const des = await rest(`bit56_validadores?perfil_id=eq.${id}&establecimiento_id=in.(${quitar.join(',')})&select=establecimiento_id`);
        if (des.length) throw new ApiError(409, 'designacion_vigente', 'No se puede quitar un establecimiento donde es validador designado');
      }
      try {
        if (agregar.length) await rest('establecimientos_usuarios?on_conflict=perfil_id,establecimiento_id', { method: 'POST',
          prefer: 'resolution=ignore-duplicates,return=minimal', body: agregar.map((e) => ({ perfil_id: id, establecimiento_id: e })) });
        if (quitar.length) await rest(`establecimientos_usuarios?perfil_id=eq.${id}&establecimiento_id=in.(${quitar.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
      } catch (e) {
        await auditar(ctx.actor, id, 'establecimientos', 'error', { agregar: agregar.length, quitar: quitar.length, motivo: e.pg ?? 'fallo' });
        throw new ApiError(500, 'fallo_parcial', 'Asignación incompleta; reintentá para completarla');
      }
      await auditar(ctx.actor, id, 'establecimientos', 'ok', { agregar: agregar.length, quitar: quitar.length });
      return { agregados: agregar.length, quitados: quitar.length };
    },

    async desactivar(ctx, b) { return cambiarActivo(ctx, b, false); },
    async activar(ctx, b) { return cambiarActivo(ctx, b, true); },
  };

  // Desactivar: primero el perfil (corta RLS/RPC de inmediato) y despues el bloqueo de Auth
  // (impide renovar el token). Si el bloqueo falla, queda contenido por RLS y se informa 'parcial'.
  async function cambiarActivo(ctx, b, activo) {
    const id = exigirUuid(b.usuario_id); const accion = activo ? 'activar' : 'desactivar';
    const p = await getPerfil(id);
    if (!p) throw new ApiError(404, 'no_encontrado', 'Usuario no encontrado');
    if (!activo && id === ctx.actor) throw new ApiError(409, 'autodesactivacion', 'No podés desactivar tu propia cuenta');
    try { await rest(`perfiles?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { activo } }); }
    catch (e) {
      await auditar(ctx.actor, id, accion, 'error', { motivo: e.pg ?? 'fallo' });
      if (e.pg === '23514') throw new ApiError(409, 'ultimo_admin', 'No se puede desactivar al último ADMINISTRADOR activo');
      throw new ApiError(500, 'fallo_interno', 'No se pudo actualizar');
    }
    const authOk = await bloquearAuth(id, !activo);
    await auditar(ctx.actor, id, accion, authOk ? 'ok' : 'parcial', { auth_bloqueo: authOk });
    return { activo, bloqueo_auth: authOk };
  }

  return async function handler(req) {
    const origen = req.headers.get('origin');
    const cors = {
      'Access-Control-Allow-Origin': origen && origenesPermitidos.includes(origen) ? origen : 'null',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
    };
    const resp = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return resp(405, { error: 'metodo_no_permitido' });
    let actor = null;
    try {
      const ctxId = await identificar(req);
      actor = ctxId.id;
      const texto = await req.text();
      if (texto.length > MAX_BODY) throw new ApiError(413, 'cuerpo_excesivo', 'Solicitud demasiado grande');
      let body; try { body = JSON.parse(texto || '{}'); } catch { throw bad('JSON inválido'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Solicitud inválida');
      const accion = body.accion;
      if (typeof accion !== 'string' || !Object.hasOwn(acciones, accion)) throw bad('Acción desconocida');
      if (!ctxId.perfil || ctxId.perfil.rol !== 'ADMINISTRADOR' || ctxId.perfil.activo !== true) {
        await auditar(actor, null, 'denegado', 'denegado', { accion_solicitada: accion.slice(0, 30), rol: ctxId.perfil?.rol ?? 'SIN_PERFIL', activo: ctxId.perfil?.activo ?? null });
        throw new ApiError(403, 'no_autorizado', 'No autorizado');
      }
      const out = await acciones[accion]({ actor }, body);
      return resp(200, { ok: true, ...out });
    } catch (e) {
      if (e instanceof ApiError) return resp(e.status, { ok: false, error: e.codigo, mensaje: e.message });
      return resp(500, { ok: false, error: 'fallo_interno', mensaje: 'Error interno' }); // sin detalles internos
    }
  };
}
