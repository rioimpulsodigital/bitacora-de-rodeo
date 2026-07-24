// Backend del módulo Rescate Equino Municipalidad (Google Apps
// Script propio). Ningún otro módulo debería importar este
// archivo, ni este archivo debería saber nada de otros módulos.

const URL_GS = "https://script.google.com/macros/s/AKfycbyUqWLiXTcw0o5cjRyrlZuR9Y-cmP2IHManoRFLUOgzo27vPGdTm-liw6-Sn3UM36s7/exec";

export async function saveJornada({ date, arrival, departure, activities, duration }) {
  const params = new URLSearchParams({
    action: 'save',
    date, arrival, departure, activities,
    duration: String(duration),
  });
  const res = await fetch(`${URL_GS}?${params}`);
  return res.json();
}

export async function fetchReport(type, date) {
  let url = `${URL_GS}?action=report&type=${type}`;
  if (date) url += `&date=${date}`;
  const res = await fetch(url);
  return res.json();
}
