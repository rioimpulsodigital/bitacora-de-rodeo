// Portada de selección de módulo. Puramente presentacional: no
// conoce nada de Rescate ni de Rodeo, solo la lista de módulos
// registrados (ver app.js). Agregar un módulo nuevo a la portada
// es registrarlo — este archivo no cambia.

export function tplPortada(modules) {
  const cards = modules.map(m => `
          <button class="rpt-option" style="border-left:4px solid ${m.color};padding:22px 20px;" onclick="App.selectModulo('${m.id}')">
            <div style="text-align:left;">
              <div style="font-size:15px;font-weight:bold;">${m.icon} ${m.portalTitle}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px;">${m.portalSubtitle}</div>
            </div>
            <span style="font-size:20px;color:${m.color}">→</span>
          </button>`).join('');

  return `
      <div class="idle-screen" style="gap:28px;">
        <div style="text-align:center;">
          <div style="font-size:11px;color:var(--faint);letter-spacing:0.14em;text-transform:uppercase;margin-bottom:8px;">Bitácora de Rodeo</div>
          <div style="font-size:14px;color:var(--muted);">Selecciona con qué proyecto vas a trabajar</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;width:100%;max-width:360px;">${cards}
        </div>
      </div>`;
}
