import React, { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Loader2, X } from "lucide-react";
import { dbSelect, dbInsert, dbUpdate, dbDelete } from "../lib/api";

const BRAND = "#9E191B";
const VERDE = "#3F7268";
const AMBAR = "#D9A441";

function calcularEstatus(fechaUltimo, frecuenciaDias) {
  if (!fechaUltimo) return { estatus: "sin_dato", diasRestantes: null };
  const ultimo = new Date(fechaUltimo + "T00:00:00");
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diasTranscurridos = Math.round((hoy - ultimo) / 86400000);
  const diasRestantes = frecuenciaDias - diasTranscurridos;
  if (diasRestantes < 0) return { estatus: "rojo", diasRestantes };
  if (diasRestantes <= 10) return { estatus: "amarillo", diasRestantes };
  return { estatus: "verde", diasRestantes };
}

const COLOR = { verde: VERDE, amarillo: AMBAR, rojo: BRAND, sin_dato: "#9C9585" };
const ETIQUETA = {
  verde: (d) => `En ${d} días`,
  amarillo: (d) => (d === 0 ? "Hoy" : `En ${d} días`),
  rojo: (d) => `Vencido ${Math.abs(d)} días`,
  sin_dato: () => "Sin mantenimiento previo",
};

export default function Equipos({ session, onBack }) {
  const { accessToken, profile } = session;
  const esAdmin = profile.rol === "admin";

  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | rojo | amarillo

  const [formAbierto, setFormAbierto] = useState(false);
  const [fTipo, setFTipo] = useState("");
  const [fNumero, setFNumero] = useState("");
  const [fClienteId, setFClienteId] = useState("");
  const [fSucursal, setFSucursal] = useState("");
  const [fFrecuencia, setFFrecuencia] = useState(90);
  const [fUltimoMant, setFUltimoMant] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (esAdmin) {
          const cs = await dbSelect(accessToken, "clientes", "select=*&order=nombre.asc");
          setClientes(cs);
        }
        const eq = await dbSelect(accessToken, "equipos", "select=*,clientes(nombre)&order=created_at.desc");
        setEquipos(eq);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken, esAdmin]);

  const crearEquipo = async () => {
    if (!fTipo.trim() || !fNumero.trim() || !fClienteId) {
      setError("Tipo de equipo, número identificador y cliente son obligatorios");
      return;
    }
    setError("");
    try {
      const [e] = await dbInsert(accessToken, "equipos", {
        tipo_equipo: fTipo, numero_identificador: fNumero, cliente_id: fClienteId,
        sucursal: fSucursal, frecuencia_dias: parseInt(fFrecuencia, 10) || 90,
        fecha_ultimo_mantenimiento: fUltimoMant || null,
      });
      const cli = clientes.find((c) => c.id === fClienteId);
      setEquipos((prev) => [{ ...e, clientes: cli ? { nombre: cli.nombre } : null }, ...prev]);
      setFTipo(""); setFNumero(""); setFClienteId(""); setFSucursal(""); setFFrecuencia(90); setFUltimoMant("");
      setFormAbierto(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const borrarEquipo = async (id) => {
    if (!window.confirm("¿Borrar este equipo? También se desvincula de cualquier reporte fotográfico que lo tuviera asignado.")) return;
    try {
      await dbDelete(accessToken, "equipos", `id=eq.${id}`);
      setEquipos((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const conEstatus = equipos.map((e) => ({ ...e, ...calcularEstatus(e.fecha_ultimo_mantenimiento, e.frecuencia_dias) }));
  const visibles = conEstatus.filter((e) => (filtro === "todos" ? true : e.estatus === filtro));
  const nOptimo = conEstatus.filter((e) => e.estatus === "verde").length;
  const nProximo = conEstatus.filter((e) => e.estatus === "amarillo").length;
  const nVencido = conEstatus.filter((e) => e.estatus === "rojo").length;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "#1C2A3E" }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Mantenimiento preventivo</span>
      </div>

      {error && (
        <div style={{ background: "#FBEAE5", color: "#B5482F", fontSize: 12.5, padding: "8px 10px", borderRadius: 4, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <PillResumen n={nOptimo} label="Óptimo" color={VERDE} bg="#E8F0EC" onClick={() => setFiltro("verde")} activo={filtro === "verde"} />
        <PillResumen n={nProximo} label="Próximo" color={AMBAR} bg="#FBF1DE" onClick={() => setFiltro("amarillo")} activo={filtro === "amarillo"} />
        <PillResumen n={nVencido} label="Vencido" color={BRAND} bg="#FBEAE5" onClick={() => setFiltro("rojo")} activo={filtro === "rojo"} />
      </div>
      {filtro !== "todos" && (
        <button onClick={() => setFiltro("todos")} style={{ ...chipStyle, marginBottom: 14 }}>Ver todos</button>
      )}

      {esAdmin && (
        formAbierto ? (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ ...cardHeaderStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>NUEVO EQUIPO</span>
              <button onClick={() => setFormAbierto(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A5A2E" }}><X size={14} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <input value={fTipo} onChange={(e) => setFTipo(e.target.value)} placeholder="Tipo de equipo (ej. Minisplit, Cuarto frío)" style={{ ...inputStyle, marginBottom: 10 }} />
              <input value={fNumero} onChange={(e) => setFNumero(e.target.value)} placeholder="Número identificador (ej. EQ-0031)" style={{ ...inputStyle, marginBottom: 10 }} />
              <select value={fClienteId} onChange={(e) => setFClienteId(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
                <option value="">Selecciona cliente...</option>
                {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
              <input value={fSucursal} onChange={(e) => setFSucursal(e.target.value)} placeholder="Sucursal / ubicación" style={{ ...inputStyle, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Frecuencia (días)</div>
                  <input type="number" value={fFrecuencia} onChange={(e) => setFFrecuencia(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Último mantenimiento</div>
                  <input type="date" value={fUltimoMant} onChange={(e) => setFUltimoMant(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <button onClick={crearEquipo} style={{ ...primaryBtnStyle, width: "100%" }}>Guardar equipo</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setFormAbierto(true)} style={{ ...primaryBtnStyle, width: "100%", marginBottom: 16 }}>
            <Plus size={15} /> Nuevo equipo
          </button>
        )
      )}

      {loading ? (
        <Loader2 className="spin-icon" size={20} />
      ) : visibles.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9C9585" }}>No hay equipos que mostrar.</div>
      ) : (
        visibles.map((e) => (
          <div key={e.id} style={{ display: "flex", background: "#fff", borderRadius: 8, marginBottom: 10, overflow: "hidden", boxShadow: "0 1px 2px rgba(28,42,62,0.04)" }}>
            <div style={{ width: 5, background: COLOR[e.estatus] }} />
            <div style={{ padding: "12px 14px", flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2A3E" }}>{e.tipo_equipo}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#9C9585" }}>{e.numero_identificador}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 3, whiteSpace: "nowrap",
                    fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", color: "#fff", background: COLOR[e.estatus],
                  }}>
                    {ETIQUETA[e.estatus](e.diasRestantes)}
                  </span>
                  {esAdmin && (
                    <button onClick={() => borrarEquipo(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B5482F" }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: "#6B6656", marginTop: 6 }}>
                {e.clientes?.nombre}{e.sucursal ? ` — ${e.sucursal}` : ""}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0EDE4", fontSize: 11 }}>
                <div><span style={{ color: "#9C9585" }}>Último: </span><span style={{ color: "#1C2A3E", fontWeight: 600 }}>{e.fecha_ultimo_mantenimiento || "—"}</span></div>
                <div><span style={{ color: "#9C9585" }}>Frecuencia: </span><span style={{ color: "#1C2A3E", fontWeight: 600 }}>{e.frecuencia_dias} días</span></div>
              </div>
            </div>
          </div>
        ))
      )}
      <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PillResumen({ n, label, color, bg, onClick, activo }) {
  return (
    <button onClick={onClick} style={{ background: bg, border: activo ? `2px solid ${color}` : "2px solid transparent", borderRadius: 8, padding: "10px 8px", textAlign: "center", cursor: "pointer" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{n}</div>
      <div style={{ fontSize: 9.5, fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", color, opacity: 0.85, marginTop: 2 }}>{label}</div>
    </button>
  );
}

const cardStyle = { background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, overflow: "hidden" };
const cardHeaderStyle = { padding: "10px 16px", background: "#EFEAE0", borderBottom: "1px dashed #C9C2B0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: "#8A5A2E" };
const inputStyle = { width: "100%", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 10px", fontSize: 13.5, outline: "none" };
const labelStyle = { fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E", marginBottom: 4 };
const primaryBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: BRAND, color: "#fff", border: "none", borderRadius: 4, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const chipStyle = { fontSize: 11.5, fontWeight: 600, padding: "6px 12px", borderRadius: 14, border: "1px solid #E4DFD2", color: "#4A4438", background: "#fff", cursor: "pointer" };
