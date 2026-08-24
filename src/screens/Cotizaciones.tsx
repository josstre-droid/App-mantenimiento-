import React, { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Loader2, ChevronDown, Printer } from "lucide-react";
import { dbSelect, dbInsert, dbUpdate, dbDelete } from "../lib/api";
import BloqueFirma from "../components/BloqueFirma";

const BRAND = "#9E191B";
const ESTATUS_LABEL = { borrador: "Borrador", enviada: "Enviada", aprobada: "Aprobada", rechazada: "Rechazada" };
const ESTATUS_COLOR = { borrador: "#9C9585", enviada: "#B08A3E", aprobada: "#3F7268", rechazada: "#B5482F" };
const money = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

const CLAUSULA_ALCANCE =
  "El alcance de la cotización presentada se limita al análisis de la información proporcionada por el cliente. " +
  "De ser necesaria la modificación, ajuste o adición de conceptos, esto repercutirá en el importe de la propuesta.";

export default function Cotizaciones({ session, onBack }) {
  const { accessToken, profile, cliente } = session;
  const puedeEditar = profile.rol === "admin" || profile.rol === "tecnico";
  const puedeFirmar = profile.rol === "cliente" ? !!cliente?.firma_cotizaciones : false;

  const [clientes, setClientes] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [trabajoId, setTrabajoId] = useState(null);
  const [cotizacion, setCotizacion] = useState(null);
  const [partidas, setPartidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [nuevoFolio, setNuevoFolio] = useState("");
  const [nuevoClienteId, setNuevoClienteId] = useState("");
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (puedeEditar) {
          const cs = await dbSelect(accessToken, "clientes", "select=*&order=nombre.asc");
          setClientes(cs);
        }
        const ts = await dbSelect(accessToken, "trabajos", "select=*,clientes(nombre)&order=created_at.desc");
        setTrabajos(ts);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarCotizacion = async (tId) => {
    setLoading(true);
    setError("");
    try {
      const cot = await dbSelect(accessToken, "cotizaciones", `select=*&trabajo_id=eq.${tId}&order=created_at.desc&limit=1`);
      const ps = await dbSelect(accessToken, "partidas", `select=*&trabajo_id=eq.${tId}&order=numero.asc`);
      setCotizacion(cot[0] || null);
      setPartidas(ps);
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
      nombre: nuevoClienteNombre, ve_cotizaciones: true, ve_ordenes: false,
      firma_reportes: true, firma_cotizaciones: true, ve_estado_cuenta: false,
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
      cargarCotizacion(t.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const crearCotizacion = async () => {
    try {
      const [c] = await dbInsert(accessToken, "cotizaciones", {
        trabajo_id: trabajoId, folio: `COT-${Date.now().toString().slice(-6)}`,
        subtotal: 0, aplica_iva: true, iva: 0, total: 0, estatus: "borrador",
      });
      setCotizacion(c);
    } catch (e) {
      setError(e.message);
    }
  };

  const recalcular = async (listaPartidas, aplicaIvaOverride) => {
    const aplicaIva = aplicaIvaOverride !== undefined ? aplicaIvaOverride : cotizacion.aplica_iva;
    const subtotal = listaPartidas.reduce((sum, p) => sum + Number(p.cantidad || 0) * Number(p.precio_unitario || 0), 0);
    const iva = aplicaIva ? subtotal * 0.16 : 0;
    const total = subtotal + iva;
    if (cotizacion) {
      try {
        await dbUpdate(accessToken, "cotizaciones", `id=eq.${cotizacion.id}`, { subtotal, iva, total, aplica_iva: aplicaIva });
        setCotizacion((c) => ({ ...c, subtotal, iva, total, aplica_iva: aplicaIva }));
      } catch (e) {
        setError(e.message);
      }
    }
  };

  const toggleIva = (checked) => recalcular(partidas, checked);

  const agregarPartida = async () => {
    const numero = partidas.length + 1;
    try {
      const [p] = await dbInsert(accessToken, "partidas", {
        trabajo_id: trabajoId, cotizacion_id: cotizacion.id, numero,
        descripcion: "", detalle: "", cantidad: 1, precio_unitario: 0,
      });
      const nuevas = [...partidas, p];
      setPartidas(nuevas);
      recalcular(nuevas);
    } catch (e) {
      setError(e.message);
    }
  };

  const actualizarPartida = async (id, campo, valor) => {
    const nuevas = partidas.map((p) => (p.id === id ? { ...p, [campo]: valor } : p));
    setPartidas(nuevas);
    try {
      await dbUpdate(accessToken, "partidas", `id=eq.${id}`, { [campo]: valor });
      if (campo === "cantidad" || campo === "precio_unitario") recalcular(nuevas);
    } catch (e) {
      setError(e.message);
    }
  };

  const borrarPartida = async (id) => {
    const nuevas = partidas.filter((p) => p.id !== id);
    setPartidas(nuevas);
    try {
      await dbDelete(accessToken, "partidas", `id=eq.${id}`);
      recalcular(nuevas);
    } catch (e) {
      setError(e.message);
    }
  };

  const cambiarEstatus = async (estatus) => {
    try {
      await dbUpdate(accessToken, "cotizaciones", `id=eq.${cotizacion.id}`, { estatus });
      setCotizacion((c) => ({ ...c, estatus }));
    } catch (e) {
      setError(e.message);
    }
  };

  const actualizarCampoCotizacion = async (campo, valor) => {
    setCotizacion((c) => ({ ...c, [campo]: valor }));
    try {
      await dbUpdate(accessToken, "cotizaciones", `id=eq.${cotizacion.id}`, { [campo]: valor });
    } catch (e) {
      setError(e.message);
    }
  };

  const guardarFirmaDibujada = async (dataUrl) => {
    try {
      await dbUpdate(accessToken, "cotizaciones", `id=eq.${cotizacion.id}`, {
        firma_tipo: "dibujada", firma_dato: dataUrl,
        firma_nombre: cliente?.nombre || "", firma_fecha: new Date().toISOString(),
      });
      setCotizacion((c) => ({ ...c, firma_tipo: "dibujada", firma_dato: dataUrl, firma_nombre: cliente?.nombre || "" }));
    } catch (e) {
      setError(e.message);
    }
  };

  const guardarFirmaTexto = async (nombre) => {
    try {
      await dbUpdate(accessToken, "cotizaciones", `id=eq.${cotizacion.id}`, {
        firma_tipo: "texto", firma_nombre: nombre, firma_fecha: new Date().toISOString(),
      });
      setCotizacion((c) => ({ ...c, firma_tipo: "texto", firma_nombre: nombre }));
    } catch (e) {
      setError(e.message);
    }
  };

  const trabajo = trabajos.find((t) => t.id === trabajoId);

  // ---------- Vista: elegir / crear trabajo ----------
  if (!trabajoId) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
        <BackBar onBack={onBack} title="Cotizaciones" />
        {error && <ErrorBox text={error} />}

        {puedeEditar && (
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
        )}

        <div style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E", margin: "20px 0 8px" }}>
          TRABAJOS EXISTENTES
        </div>
        {loading && <Loader2 className="spin-icon" size={18} />}
        {!loading && trabajos.length === 0 && <div style={{ fontSize: 13, color: "#9C9585" }}>Aún no hay trabajos.</div>}
        {trabajos.map((t) => (
          <button key={t.id} onClick={() => cargarCotizacion(t.id)} style={trabajoBtnStyle}>
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, fontWeight: 600 }}>{t.folio}</div>
              <div style={{ fontSize: 12, color: "#6B6656" }}>{t.clientes?.nombre || "—"}</div>
            </div>
            <ChevronDown size={16} style={{ transform: "rotate(-90deg)", color: "#9C9585" }} />
          </button>
        ))}
        <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ---------- Vista: cotización del trabajo ----------
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div className="no-print">
        <BackBar onBack={() => setTrabajoId(null)} title={trabajo?.folio || "Trabajo"} />
        {error && <ErrorBox text={error} />}
      </div>

      {loading ? (
        <Loader2 className="spin-icon no-print" size={20} />
      ) : !cotizacion ? (
        <div className="no-print" style={{ fontSize: 13, color: "#6B6656" }}>
          Este trabajo aún no tiene cotización.
          {puedeEditar && (
            <button onClick={crearCotizacion} style={{ ...primaryBtnStyle, marginTop: 12 }}>
              <Plus size={15} /> Crear cotización
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="no-print" style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600 }}>{cotizacion.folio}</div>
                <div style={{ fontSize: 12, color: "#6B6656" }}>{trabajo?.clientes?.nombre}</div>
              </div>
              {puedeEditar ? (
                <select
                  value={cotizacion.estatus}
                  onChange={(e) => cambiarEstatus(e.target.value)}
                  style={{ ...inputStyle, width: "auto", fontWeight: 600, color: ESTATUS_COLOR[cotizacion.estatus], borderColor: ESTATUS_COLOR[cotizacion.estatus] }}
                >
                  {Object.entries(ESTATUS_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              ) : (
                <span style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: "#fff", background: ESTATUS_COLOR[cotizacion.estatus], padding: "4px 10px", borderRadius: 3 }}>
                  {ESTATUS_LABEL[cotizacion.estatus]}
                </span>
              )}
            </div>
          </div>

          <div style={cardStyle}>
            <div className="no-print" style={cardHeaderStyle}>CONCEPTOS</div>
            <div style={{ padding: 16 }}>
              {partidas.map((p, idx) => (
                <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #F0EDE4" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A5A2E", paddingTop: 9, width: 22 }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div style={{ flex: 1 }}>
                    {puedeEditar ? (
                      <>
                        <input defaultValue={p.descripcion} onBlur={(e) => actualizarPartida(p.id, "descripcion", e.target.value)} placeholder="Descripción del concepto" style={{ ...inputStyle, marginBottom: 6 }} />
                        <input defaultValue={p.detalle} onBlur={(e) => actualizarPartida(p.id, "detalle", e.target.value)} placeholder="Detalle adicional (opc.)" style={{ ...inputStyle, marginBottom: 6, fontSize: 12, color: "#6B6656" }} />
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{p.descripcion || "(sin descripción)"}</div>
                        {p.detalle && <div style={{ fontSize: 12, color: "#9C9585", marginBottom: 4 }}>{p.detalle}</div>}
                      </>
                    )}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "#6B6656", marginTop: 4 }}>
                      {puedeEditar ? (
                        <>
                          <input type="number" defaultValue={p.cantidad} onBlur={(e) => actualizarPartida(p.id, "cantidad", parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 60, padding: "5px 6px" }} />
                          <span>×</span>
                          <input type="number" defaultValue={p.precio_unitario} onBlur={(e) => actualizarPartida(p.id, "precio_unitario", parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 90, padding: "5px 6px" }} />
                          <span style={{ marginLeft: "auto", fontWeight: 600, color: "#1C2A3E" }}>
                            {money(p.cantidad * p.precio_unitario)}
                          </span>
                        </>
                      ) : (
                        <span>{p.cantidad} × {money(p.precio_unitario)} = <b>{money(p.cantidad * p.precio_unitario)}</b></span>
                      )}
                    </div>
                  </div>
                  {puedeEditar && (
                    <button onClick={() => borrarPartida(p.id)} className="no-print" style={{ background: "none", border: "none", cursor: "pointer", color: "#B5482F", paddingTop: 6 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              {puedeEditar && (
                <button onClick={agregarPartida} className="no-print" style={{ ...secondaryBtnStyle, width: "100%", justifyContent: "center", padding: 10 }}>
                  <Plus size={14} /> Agregar concepto
                </button>
              )}

              {puedeEditar && (
                <label className="no-print" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#4A4438", marginTop: 14 }}>
                  <input type="checkbox" checked={cotizacion.aplica_iva} onChange={(e) => toggleIva(e.target.checked)} />
                  Aplicar IVA (16%)
                </label>
              )}

              <div style={{ marginTop: 14, paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6B6656", marginBottom: 4 }}>
                  <span>Subtotal</span><span>{money(cotizacion.subtotal)}</span>
                </div>
                {cotizacion.aplica_iva && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6B6656", marginBottom: 4 }}>
                    <span>IVA (16%)</span><span>{money(cotizacion.iva)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 14, borderTop: `2px solid ${BRAND}` }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Total</span>
                  <span style={{ fontWeight: 700, fontSize: 17, color: BRAND }}>{money(cotizacion.total)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div className="no-print" style={cardHeaderStyle}>CONDICIONES</div>
            <div style={{ padding: 16 }}>
              <CondicionCampo
                label="Tiempo de ejecución"
                valor={cotizacion.tiempo_ejecucion}
                editable={puedeEditar}
                placeholder="ej. 5 días hábiles a partir del anticipo"
                onGuardar={(v) => actualizarCampoCotizacion("tiempo_ejecucion", v)}
              />
              <CondicionCampo
                label="Forma de pago"
                valor={cotizacion.forma_pago}
                editable={puedeEditar}
                placeholder="ej. 50% anticipo, 50% contra entrega"
                onGuardar={(v) => actualizarCampoCotizacion("forma_pago", v)}
              />
              <CondicionCampo
                label="Condiciones adicionales (opcional)"
                valor={cotizacion.condiciones_adicionales}
                editable={puedeEditar}
                placeholder="Cualquier condición extra para este trabajo..."
                multilinea
                onGuardar={(v) => actualizarCampoCotizacion("condiciones_adicionales", v)}
              />
              <div style={{ fontSize: 11, color: "#9C9585", lineHeight: 1.6, marginTop: 14, paddingTop: 12, borderTop: "1px dashed #E4DFD2" }}>
                {CLAUSULA_ALCANCE}
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div className="no-print" style={cardHeaderStyle}>FIRMA DE CONFORMIDAD</div>
            <div style={{ padding: 16 }}>
              <BloqueFirma
                firma={cotizacion.firma_tipo ? { tipo: cotizacion.firma_tipo, dato: cotizacion.firma_dato, nombre_cliente: cotizacion.firma_nombre } : null}
                puedeFirmar={puedeFirmar}
                onFirmaDibujada={guardarFirmaDibujada}
                onFirmaTexto={guardarFirmaTexto}
              />
            </div>
          </div>

          <button onClick={() => window.print()} className="no-print" style={{ ...secondaryBtnStyle, marginTop: 16 }}>
            <Printer size={14} /> Exportar PDF
          </button>
        </>
      )}
      <style>{`
        .spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
        @media print { .no-print { display: none !important; } }
      `}</style>
    </div>
  );
}

function CondicionCampo({ label, valor, editable, placeholder, multilinea, onGuardar }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      {editable ? (
        multilinea ? (
          <textarea defaultValue={valor || ""} onBlur={(e) => onGuardar(e.target.value)} placeholder={placeholder} rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        ) : (
          <input defaultValue={valor || ""} onBlur={(e) => onGuardar(e.target.value)} placeholder={placeholder} style={inputStyle} />
        )
      ) : (
        <div style={{ fontSize: 13.5, color: valor ? "#1C2A3E" : "#9C9585" }}>{valor || "—"}</div>
      )}
    </div>
  );
}

function BackBar({ onBack, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "#1C2A3E" }}>
        <ArrowLeft size={20} />
      </button>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
    </div>
  );
}
function ErrorBox({ text }) {
  return (
    <div style={{ background: "#FBEAE5", color: "#B5482F", fontSize: 12.5, padding: "8px 10px", borderRadius: 4, marginBottom: 14 }}>
      {text}
    </div>
  );
}

const cardStyle = { background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, overflow: "hidden" };
const cardHeaderStyle = { padding: "10px 16px", background: "#EFEAE0", borderBottom: "1px dashed #C9C2B0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: "#8A5A2E" };
const inputStyle = { width: "100%", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 10px", fontSize: 13.5, outline: "none" };
const primaryBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: BRAND, color: "#fff", border: "none", borderRadius: 4, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const secondaryBtnStyle = { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#1C2A3E", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" };
const trabajoBtnStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, padding: "12px 14px", marginBottom: 8, cursor: "pointer" };
