import React, { useState } from "react";
import { LogOut, FileText, Camera, DollarSign, Receipt, Scale, Loader2, AlertCircle } from "lucide-react";
import logo from "./assets/logo.png";
import { login, dbSelect } from "./lib/api";
import ReportesFotograficos from "./screens/ReportesFotograficos";
import Cotizaciones from "./screens/Cotizaciones";
import GastosIngresos from "./screens/GastosIngresos";
import Cobranza from "./screens/Cobranza";
import Balance from "./screens/Balance";

async function getProfile(accessToken, userId) {
  const data = await dbSelect(accessToken, "profiles", `id=eq.${userId}&select=*`);
  return data[0] || null;
}

async function getCliente(accessToken, clienteId) {
  if (!clienteId) return null;
  const data = await dbSelect(accessToken, "clientes", `id=eq.${clienteId}&select=*`);
  return data[0] || null;
}

const ROL_LABEL = { admin: "Administrador", tecnico: "Técnico", cliente: "Cliente" };
const ROL_COLOR = { admin: "#C9433F", tecnico: "#3F7268", cliente: "#5A6B8C" };
const BRAND = "#9E191B";

export default function App() {
  const [session, setSession] = useState(null); // { accessToken, user, profile, cliente }
  const [vista, setVista] = useState("dashboard"); // dashboard | reportes | cotizaciones | gastos | cobranza
  const [vistaParams, setVistaParams] = useState(null);
  const navegarA = (v, params) => { setVistaParams(params || null); setVista(v); };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const auth = await login(email, password);
      const profile = await getProfile(auth.access_token, auth.user.id);
      if (!profile) {
        throw new Error(
          "Tu cuenta existe pero no tiene un perfil asignado. Pide al administrador que te dé de alta en la tabla profiles."
        );
      }
      const cliente =
        profile.rol === "cliente"
          ? await getCliente(auth.access_token, profile.cliente_id)
          : null;
      setSession({ accessToken: auth.access_token, user: auth.user, profile, cliente });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setVista("dashboard");
    setEmail("");
    setPassword("");
  };

  const styles = {
    page: {
      fontFamily: "'IBM Plex Sans', sans-serif",
      background: "#F7F5F0",
      minHeight: "100vh",
      color: "#1C2A3E",
    },
  };

  if (!session) {
    return (
      <div
        style={{
          ...styles.page,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`}</style>
        <form
          onSubmit={handleLogin}
          style={{
            background: "#fff",
            border: "1px solid #E4DFD2",
            borderRadius: 8,
            padding: 32,
            width: "100%",
            maxWidth: 360,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <img src={logo} alt="Logo" style={{ height: 30, width: "auto" }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>App de Mantenimiento</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#6B6656", marginBottom: 22 }}>
            Inicia sesión con tu cuenta
          </div>

          <label style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E" }}>
            CORREO
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid #E4DFD2",
              borderRadius: 4,
              padding: "9px 10px",
              fontSize: 14,
              marginTop: 4,
              marginBottom: 14,
              outline: "none",
            }}
          />

          <label style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E" }}>
            CONTRASEÑA
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid #E4DFD2",
              borderRadius: 4,
              padding: "9px 10px",
              fontSize: 14,
              marginTop: 4,
              marginBottom: 18,
              outline: "none",
            }}
          />

          {error && (
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "flex-start",
                background: "#FBEAE5",
                color: "#B5482F",
                fontSize: 12.5,
                padding: "8px 10px",
                borderRadius: 4,
                marginBottom: 14,
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: BRAND,
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "11px",
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading && <Loader2 size={15} className="spin" />}
            {loading ? "Entrando..." : "Iniciar sesión"}
          </button>
          <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </form>
      </div>
    );
  }

  // ---------- Dashboard según rol ----------
  const { profile, cliente } = session;
  const rol = profile.rol;

  const modulosAdmin = [
    { icon: FileText, label: "Cotizaciones" },
    { icon: Camera, label: "Reportes fotográficos" },
    { icon: DollarSign, label: "Gastos e ingresos" },
    { icon: Receipt, label: "Cobranza" },
    { icon: Scale, label: "Balance" },
  ];
  const modulosTecnico = [
    { icon: FileText, label: "Mis órdenes de trabajo" },
    { icon: Camera, label: "Reportes fotográficos" },
  ];
  const modulosCliente = [
    cliente?.ve_ordenes && { icon: FileText, label: "Mis órdenes" },
    cliente?.ve_cotizaciones && { icon: FileText, label: "Mis cotizaciones" },
    { icon: Camera, label: "Reportes fotográficos" }, // siempre visible para poder firmar
    cliente?.ve_estado_cuenta && { icon: Receipt, label: "Estado de cuenta" },
  ].filter(Boolean);

  const modulos = rol === "admin" ? modulosAdmin : rol === "tecnico" ? modulosTecnico : modulosCliente;

  return (
    <div style={styles.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`}</style>
      <div
        style={{
          background: "#1C2A3E",
          color: "#F7F5F0",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={logo} alt="Logo" style={{ height: 24, width: "auto" }} />
          <span style={{ fontWeight: 600 }}>App de Mantenimiento</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace",
              background: ROL_COLOR[rol],
              color: "#1C2A3E",
              padding: "3px 8px",
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            {ROL_LABEL[rol]}
          </span>
          <span style={{ fontSize: 13 }}>{profile.nombre || session.user.email}</span>
          <button
            onClick={handleLogout}
            style={{
              background: "none",
              border: "1px solid #3A4A63",
              color: "#F7F5F0",
              borderRadius: 4,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <LogOut size={13} /> Salir
          </button>
        </div>
      </div>

      {vista === "reportes" ? (
        <ReportesFotograficos session={session} onBack={() => setVista("dashboard")} />
      ) : vista === "cotizaciones" ? (
        <Cotizaciones session={session} onBack={() => setVista("dashboard")} />
      ) : vista === "gastos" ? (
        <GastosIngresos session={session} onBack={() => setVista("dashboard")} />
      ) : vista === "cobranza" ? (
        <Cobranza session={session} onBack={() => setVista("dashboard")} />
      ) : vista === "balance" ? (
        <Balance session={session} onBack={() => setVista("dashboard")} />
      ) : (
        <div style={{ maxWidth: 760, margin: "28px auto", padding: "0 20px" }}>
          <div style={{ fontSize: 13, color: "#6B6656", marginBottom: 18 }}>
            Bienvenido — estos son tus módulos disponibles según tu rol y permisos.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 14,
            }}
          >
            {modulos.map((m, i) => {
              const activo = m.label === "Reportes fotográficos" || m.label === "Cotizaciones" || m.label === "Mis cotizaciones" || m.label === "Gastos e ingresos" || m.label === "Cobranza" || m.label === "Estado de cuenta" || m.label === "Balance";
              const destino = m.label.includes("otizaciones") ? "cotizaciones"
                : m.label === "Gastos e ingresos" ? "gastos"
                : (m.label === "Cobranza" || m.label === "Estado de cuenta") ? "cobranza"
                : m.label === "Balance" ? "balance"
                : "reportes";
              return (
                <div
                  key={i}
                  onClick={() => activo && setVista(destino)}
                  style={{
                    background: "#fff",
                    border: "1px solid #E4DFD2",
                    borderRadius: 6,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    cursor: activo ? "pointer" : "default",
                    opacity: activo ? 1 : 0.55,
                  }}
                >
                  <m.icon size={20} color={BRAND} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</span>
                  <span style={{ fontSize: 11.5, color: "#9C9585" }}>
                    {activo ? "Disponible" : "Próximamente"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
