export const SUPABASE_URL = "https://iwxstzjdcuuptkncexod.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eHN0empkY3V1cHRrbmNleG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NDA4MjEsImV4cCI6MjEwMzExNjgyMX0.UqBmpvyXiNZCUFLOF2IKB0JUARmnTRsCidkLDMwX9G0";

const authHeaders = (accessToken) => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${accessToken}`,
});

// ---------- Autenticación ----------
export async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || "Correo o contraseña incorrectos");
  }
  return data; // { access_token, user }
}

// ---------- Base de datos (REST genérico / PostgREST) ----------
export async function dbSelect(accessToken, table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: authHeaders(accessToken),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Error al leer ${table}`);
  return data;
}

export async function dbInsert(accessToken, table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Error al guardar en ${table}`);
  return data;
}

export async function dbUpdate(accessToken, table, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Error al actualizar ${table}`);
  return data;
}

export async function dbDelete(accessToken, table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Error al borrar en ${table}`);
  }
}

// ---------- Almacenamiento de fotos ----------
const BUCKET = "reportes-fotos";

export async function uploadFoto(accessToken, partidaId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${partidaId}/${Date.now()}-${safeName}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Error al subir la foto");
  }
  return path;
}

export async function getSignedUrl(accessToken, path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Error al obtener la foto");
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}

export async function deleteFoto(accessToken, path) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}
