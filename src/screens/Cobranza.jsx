import React, { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Loader2, ChevronDown, X } from "lucide-react";
import { dbSelect, dbInsert, dbUpdate, dbDelete } from "../lib/api";

const BRAND = "#9E191B";
const VERDE = "#3F7268";
const AMBAR = "#B08A3E";
const ESTATUS_LABEL = { pendiente: "Pendiente", pagado: "Pagado", vencido: "Vencido" };
const ESTATUS_COLOR = { pendiente: AMBAR, pagado: VERDE, vencido: BRAND };
const money = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
const hoy = () => new Date().toISOString().slice(0, 10);

export default function Cobranza({ session, onBack }) {
  const { profile } = session;
  if (profile.rol !== "admin") {
    return <EstadoCuentaCliente session={session} onBack={onBack} />;
  }
  return <CobranzaAdmin session={session} onBack={onBack} />;
}

// ============================================================
// VISTA ADMIN — gestiona cargos por trabajo
// ============================================================
function CobranzaAdmin({ session, onBack }) {
  const { accessToken } = session;

  const [clientes, setClientes] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [trabajoId, setTrabajoId] = useState(null);
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [nuevoFolio, setNuevoFolio] = useState("");
  const [nuevoClienteId, setNuevoClienteId] = useState("");
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);

  const [formAbierto, setFormAbierto] = useState(false);
  const [fConcepto, setFConcepto] = useState("");
  const [fMonto, setFMonto] = useState("");
  const [fFechaVencimiento, setFFechaVencimiento] = useState(hoy());

  useEffect(() => {
    (async () => {
      try {
        const cs = await dbSelect(accessToken, "clientes", "select=*&order=nombre.asc");
        setClientes(cs);
        const ts = await dbSelect(
          accessToken,
          "trabajos",
          "select=*,clientes(nombre),cobranza(estatus)&order=created_at.desc"
        );
        setTrabajos(ts);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken]);

  const cargarCargos = async (tId) => {
    setLoading(true);
    setError("");
    try {
      const cs = await dbSelect(accessToken, "cobranza", `select=*&trabajo_id=eq.${tId}&order=fecha_vencimiento.asc`);
      setCargos(cs);
      setTrabajoId(tId);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const crearCliente = async () => {
    if (!nuevoClienteNombre.trim()) return;
    const [c] = await dbInsert(accessToken, "clientes", {
      nombre: nuevoClienteNombre, ve_cotizaciones: false, ve_ordenes: false,
      firma_reportes: true, firma_cotizaciones: false, ve_estado_cuenta: true,
    });
    setClientes((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setNuevoClienteId(c.id);
    setNuevoClienteNombre("");
    setMostrarNuevoCliente(false);
  };

  const crearTrabajo = async () => {
    if (!nuevoFolio.trim() || !nuevoClienteId) {
      setError("Folio y cliente son obligatorios");
      return;
    }
    setError("");
    try {
      const [t] = await dbInsert(accessToken, "trabajos", { folio: nuevoFolio, cliente_id: nuevoClienteId });
      setTrabajos((prev) => [t, ...prev]);
      setNuevoFolio("");
      setNuevoClienteId("");
      cargarCargos(t.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const agregarCargo = async () => {
    const monto = parseFloat(fMonto);
    if (!fConcepto.trim() || !monto || monto <= 0) {
      setError("Concepto y monto (mayor a cero) son obligatorios");
      return;
    }
    setError("");
    try {
      const [c] = await dbInsert(accessToken, "cobranza", {
        trabajo_id: trabajoId, concepto: fConcepto, monto,
        fecha_vencimiento: fFechaVencimiento, estatus: "pendiente",
      });
      setCargos((prev) => [...prev, c]);
      setFConcepto("");
      setFMonto("");
      setFFechaVencimiento(hoy());
      setFormAbierto(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const cambiarEstatus = async (id, estatus) => {
    const fecha_pago = estatus === "pagado" ? hoy() : null;
    setCargos((prev) => prev.map((c) => (c.id === id ? { ...c, estatus, fecha_pago } : c)));
    try {
      await dbUpdate(accessToken, "cobranza", `id=eq.${id}`, { estatus, fecha_pago });
    } catch (e) {
      setError(e.message);
    }
  };

  const borrarCargo = async (id) => {
    if (!window.confirm("¿Borrar este cargo?")) return;
    setCargos((prev) => prev.filter((c) => c.id !== id));
    try {
      await dbDelete(accessToken, "cobranza", `id=eq.${id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const trabajo = trabajos.find((t) => t.id === trabajoId);
  const programado = cargos.reduce((s, c) => s + Number(c.monto), 0);
  const pagado = cargos.filter((c) => c.estatus === "pagado").reduce((s, c) => s + Number(c.monto), 0);
  const pendiente = programado - pagado;

  // ---------- Elegir / crear trabajo ----------
  if (!trabajoId) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
        <BackBar onBack={onBack} title="Cobranza" />
        {error && <ErrorBox text={error} />}

        <div style={cardStyle}>
          <div style={cardHeaderStyle}>NUEVO TRABAJO</div>
          <div style={{ padding: 16 }}>
            <input value={nuevoFolio} onChange={(e) => setNuevoFolio(e.target.value)} placeholder="Folio (ej. OT-2026-020)" style={inputStyle} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <select value={nuevoClienteId} onChange={(e) => setNuevoClienteId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">Selecciona cliente...</option>
                {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
              <button onClick={() => setMostrarNuevoCliente((v) => !v)} style={secondaryBtnStyle}>+ cliente</button>
            </div>
            {mostrarNuevoCliente && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input value={nuevoClienteNombre} onChange={(e) => setNuevoClienteNombre(e.target.value)} placeholder="Nombre del nuevo cliente" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={crearCliente} style={secondaryBtnStyle}>Agregar</button>
              </div>
            )}
            <button onClick={crearTrabajo} style={{ ...primaryBtnStyle, marginTop: 14, width: "100%" }}>
              <Plus size={15} /> Crear trabajo y continuar
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E", margin: "20px 0 8px" }}>
          TRABAJOS EXISTENTES
        </div>
        {loading && <Loader2 className="spin-icon" size={18} />}
        {!loading && trabajos.length === 0 && <div style={{ fontSize: 13, color: "#9C9585" }}>Aún no hay trabajos.</div>}
        {trabajos.map((t) => {
          const estatusList = (t.cobranza || []).map((c) => c.estatus);
          const badge = estatusList.includes("vencido") ? "vencido"
            : estatusList.includes("pendiente") ? "pendiente"
            : estatusList.length > 0 ? "pagado" : null;
          return (
            <button key={t.id} onClick={() => cargarCargos(t.id)} style={trabajoBtnStyle}>
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, fontWeight: 600 }}>{t.folio}</div>
                <div style={{ fontSize: 12, color: "#6B6656" }}>{t.clientes?.nombre || "—"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {badge ? (
                  <span style={{ fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: "#fff", background: ESTATUS_COLOR[badge], padding: "3px 8px", borderRadius: 3 }}>
                    {ESTATUS_LABEL[badge]}
                  </span>
                ) : (
                  <span style={{ fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", color: "#C9C2B0" }}>sin cargos</span>
                )}
                <ChevronDown size={16} style={{ transform: "rotate(-90deg)", color: "#9C9585" }} />
              </div>
            </button>
          );
        })}
        <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ---------- Cargos del trabajo ----------
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <BackBar onBack={() => setTrabajoId(null)} title={trabajo?.folio || "Trabajo"} />
      {error && <ErrorBox text={error} />}

      <div style={{ fontSize: 12.5, color: "#6B6656", marginBottom: 14 }}>{trabajo?.clientes?.nombre}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
        <ResumenCard label="Programado" valor={programado} color="#1C2A3E" />
        <ResumenCard label="Pagado" valor={pagado} color={VERDE} />
        <ResumenCard label="Pendiente" valor={pendiente} color={pendiente > 0 ? BRAND : "#1C2A3E"} />
      </div>

      {loading ? (
        <Loader2 className="spin-icon" size={20} />
      ) : (
        <>
          {cargos.map((c) => (
            <div key={c.id} style={{ ...cardStyle, marginBottom: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1C2A3E" }}>{c.concepto}</div>
                  <div style={{ fontSize: 11.5, color: "#9C9585", marginTop: 3 }}>
                    Vence: {c.fecha_vencimiento}{c.fecha_pago ? ` · Pagado: ${c.fecha_pago}` : ""}
                  </div>
                </div>
                <button onClick={() => borrarCargo(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B5482F" }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: "#1C2A3E" }}>{money(c.monto)}</span>
                <select
                  value={c.estatus}
                  onChange={(e) => cambiarEstatus(c.id, e.target.value)}
                  style={{
                    ...inputStyle, width: "auto", fontSize: 12, fontWeight: 600, padding: "6px 10px",
                    color: ESTATUS_COLOR[c.estatus], borderColor: ESTATUS_COLOR[c.estatus],
                  }}
                >
                  {Object.entries(ESTATUS_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
            </div>
          ))}

          {formAbierto ? (
            <div style={cardStyle}>
              <div style={{ ...cardHeaderStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>NUEVO CARGO</span>
                <button onClick={() => setFormAbierto(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A5A2E" }}><X size={14} /></button>
              </div>
              <div style={{ padding: 16 }}>
                <input value={fConcepto} onChange={(e) => setFConcepto(e.target.value)} placeholder="Concepto (ej. Anticipo 50%)" style={{ ...inputStyle, marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="number" value={fMonto} onChange={(e) => setFMonto(e.target.value)} placeholder="Monto" style={{ ...inputStyle, flex: 1 }} />
                  <input type="date" value={fFechaVencimiento} onChange={(e) => setFFechaVencimiento(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                </div>
                <button onClick={agregarCargo} style={{ ...primaryBtnStyle, width: "100%", marginTop: 10 }}>Guardar cargo</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setFormAbierto(true)} style={{ ...secondaryBtnStyle, width: "100%", justifyContent: "center", padding: 12 }}>
              <Plus size={15} /> Agregar cargo
            </button>
          )}
        </>
      )}
      <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ============================================================
// VISTA CLIENTE — solo lectura, todos sus trabajos juntos
// ============================================================
function EstadoCuentaCliente({ session, onBack }) {
  const { accessToken } = session;
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const cs = await dbSelect(accessToken, "cobranza", "select=*,trabajos(folio)&order=fecha_vencimiento.asc");
        setCargos(cs);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken]);

  const programado = cargos.reduce((s, c) => s + Number(c.monto), 0);
  const pagado = cargos.filter((c) => c.estatus === "pagado").reduce((s, c) => s + Number(c.monto), 0);
  const pendiente = programado - pagado;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <BackBar onBack={onBack} title="Mi estado de cuenta" />
      {error && <ErrorBox text={error} />}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        <ResumenCard label="Pagado" valor={pagado} color={VERDE} />
        <ResumenCard label="Pendiente" valor={pendiente} color={pendiente > 0 ? BRAND : "#1C2A3E"} />
      </div>

      {loading ? (
        <Loader2 className="spin-icon" size={20} />
      ) : cargos.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9C9585" }}>No tienes cargos registrados.</div>
      ) : (
        cargos.map((c) => (
          <div key={c.id} style={{ ...cardStyle, marginBottom: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1C2A3E" }}>{c.concepto}</div>
                <div style={{ fontSize: 11.5, color: "#9C9585", marginTop: 3 }}>
                  {c.trabajos?.folio} · Vence: {c.fecha_vencimiento}
                </div>
              </div>
              <span style={{ fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: "#fff", background: ESTATUS_COLOR[c.estatus], padding: "3px 8px", borderRadius: 3, whiteSpace: "nowrap" }}>
                {ESTATUS_LABEL[c.estatus]}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#1C2A3E", marginTop: 8 }}>{money(c.monto)}</div>
          </div>
        ))
      )}
      <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ResumenCard({ label, valor, color }) {
  return (
    <div style={{ background: "#FAF8F4", borderRadius: 8, padding: "12px 10px" }}>
      <div style={{ fontSize: 9.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{money(valor)}</div>
    </div>
  );
}
function BackBar({ onBack, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "#1C2A3E" }}><ArrowLeft size={20} /></button>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
    </div>
  );
}
function ErrorBox({ text }) {
  return <div style={{ background: "#FBEAE5", color: "#B5482F", fontSize: 12.5, padding: "8px 10px", borderRadius: 4, marginBottom: 14 }}>{text}</div>;
}

const cardStyle = { background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, overflow: "hidden" };
const cardHeaderStyle = { padding: "10px 16px", background: "#EFEAE0", borderBottom: "1px dashed #C9C2B0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: "#8A5A2E" };
const inputStyle = { width: "100%", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 10px", fontSize: 13.5, outline: "none" };
const primaryBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: BRAND, color: "#fff", border: "none", borderRadius: 4, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const secondaryBtnStyle = { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#1C2A3E", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" };
const trabajoBtnStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, padding: "12px 14px", marginBottom: 8, cursor: "pointer" };
