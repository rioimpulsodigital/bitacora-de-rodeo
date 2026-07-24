// Portada de selección de módulo. Puramente presentacional: no
// conoce nada de Rescate ni de Rodeo, solo la lista de módulos
// registrados (ver app.js). Agregar un módulo nuevo a la portada
// es registrarlo — este archivo no cambia.

export function tplPortada(modules) {
  const cards = modules.map(m => `
          <button class="portal-option" style="background:${m.color};" onclick="App.selectModulo('${m.id}')">
            <span class="portal-option-dot"></span>
            <div class="portal-option-body">
              <div class="portal-option-title">${m.icon} ${m.portalTitle}</div>
              <div class="portal-option-subtitle">${m.portalSubtitle}</div>
            </div>
            <span class="portal-option-arrow">→</span>
          </button>`).join('');

  return `
      <div class="idle-screen" style="gap:28px;">
        <div style="text-align:center;">
          <img src="img/branding/BIT-logo-isotipo-transparente.png" alt="" class="portal-isotipo">
          <span class="portal-logo">Bitácora de Rodeo</span>
          <div class="portal-title">¿Con qué proyecto vas a trabajar hoy?</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;width:100%;max-width:360px;">${cards}
        </div>
      </div>`;
}
