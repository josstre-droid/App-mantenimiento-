import React, { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Loader2, ChevronDown, Printer } from "lucide-react";
import { dbSelect, dbInsert, dbUpdate, dbDelete, deleteFoto } from "../lib/api";
import BloqueFirma from "../components/BloqueFirma";
import logo from "../assets/logo.png";

const BRAND = "#9E191B";
const ESTATUS_LABEL = { borrador: "Borrador", enviada: "Enviada", aprobada: "Aprobada", rechazada: "Rechazada" };
const ESTATUS_COLOR = { borrador: "#9C9585", enviada: "#B08A3E", aprobada: "#3F7268", rechazada: "#B5482F" };
const money = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

// Agrupa partidas consecutivas que comparten la misma categoría (si no tienen, van sueltas)
function agruparPorCategoria(partidas) {
  const grupos = [];
  let actual = null;
  partidas.forEach((p, idx) => {
    const cat = (p.categoria || "").trim();
    if (cat && actual && actual.categoria === cat) {
      actual.items.push({ p, idx });
    } else {
      actual = { categoria: cat || null, items: [{ p, idx }] };
      grupos.push(actual);
    }
  });
  return grupos;
}

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
        const ts = await dbSelect(
          accessToken,
          "trabajos",
          "select=*,clientes(nombre,direccion),cotizaciones(estatus,folio,created_at)&order=created_at.desc&cotizaciones.order=created_at.desc&cotizaciones.limit=1"
        );
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
        descripcion: "", detalle: "", categoria: "", cantidad: 1, unidad: "PZA", precio_unitario: 0,
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

  const borrarTrabajo = async () => {
    const ok = window.confirm(
      `¿Borrar por completo el trabajo ${trabajo?.folio}? Esto elimina la cotización, sus conceptos, y también el reporte fotográfico (fotos y firmas) de este trabajo. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    try {
      if (partidas.length > 0) {
        const ids = partidas.map((p) => p.id).join(",");
        const fotos = await dbSelect(accessToken, "reporte_fotos", `select=url_foto&partida_id=in.(${ids})`);
        await Promise.all(fotos.map((f) => deleteFoto(accessToken, f.url_foto).catch(() => {})));
      }
      await dbDelete(accessToken, "trabajos", `id=eq.${trabajoId}`);
      setTrabajos((prev) => prev.filter((t) => t.id !== trabajoId));
      setTrabajoId(null);
      setCotizacion(null);
      setPartidas([]);
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
        {trabajos.map((t) => {
          const cot = t.cotizaciones?.[0];
          return (
            <button key={t.id} onClick={() => cargarCotizacion(t.id)} style={trabajoBtnStyle}>
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, fontWeight: 600 }}>{t.folio}</div>
                <div style={{ fontSize: 12, color: "#6B6656" }}>{t.clientes?.nombre || "—"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {cot ? (
                  <span style={{
                    fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
                    color: "#fff", background: ESTATUS_COLOR[cot.estatus], padding: "3px 8px", borderRadius: 3,
                  }}>
                    {ESTATUS_LABEL[cot.estatus]}
                  </span>
                ) : (
                  <span style={{ fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", color: "#C9C2B0" }}>
                    sin cotización
                  </span>
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

          <div style={cardStyle} className="no-print">
            <div className="no-print" style={cardHeaderStyle}>CONCEPTOS</div>
            <div style={{ padding: 16 }}>
              {agruparPorCategoria(partidas).map((grupo, gIdx) => {
                const subtotalGrupo = grupo.items.reduce((s, { p }) => s + Number(p.cantidad || 0) * Number(p.precio_unitario || 0), 0);
                return (
                  <div key={gIdx}>
                    {grupo.categoria && (
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: "#FAF8F4", borderRadius: 4, padding: "6px 10px", margin: "12px 0 4px",
                      }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: "#9E191B", textTransform: "uppercase" }}>
                          {grupo.categoria}
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "#6B6656" }}>{money(subtotalGrupo)}</span>
                      </div>
                    )}
                    {grupo.items.map(({ p, idx }) => (
                      <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #F0EDE4" }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A5A2E", paddingTop: 9, width: 22 }}>
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <div style={{ flex: 1 }}>
                          {puedeEditar ? (
                            <>
                              <input defaultValue={p.descripcion} onBlur={(e) => actualizarPartida(p.id, "descripcion", e.target.value)} placeholder="Descripción del concepto" style={{ ...inputStyle, marginBottom: 6 }} />
                              <input defaultValue={p.detalle} onBlur={(e) => actualizarPartida(p.id, "detalle", e.target.value)} placeholder="Detalle adicional (opc.)" style={{ ...inputStyle, marginBottom: 6, fontSize: 12, color: "#6B6656" }} />
                              <input
                                list="categorias-usadas"
                                defaultValue={p.categoria}
                                onBlur={(e) => actualizarPartida(p.id, "categoria", e.target.value)}
                                placeholder="Categoría (opcional, ej. Plomería)"
                                style={{ ...inputStyle, marginBottom: 6, fontSize: 11.5, color: "#9E191B", padding: "6px 10px" }}
                              />
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
                                <input type="number" defaultValue={p.cantidad} onBlur={(e) => actualizarPartida(p.id, "cantidad", parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 55, padding: "5px 6px" }} />
                                <input
                                  list="unidades-medida"
                                  defaultValue={p.unidad || "PZA"}
                                  onBlur={(e) => actualizarPartida(p.id, "unidad", e.target.value || "PZA")}
                                  style={{ ...inputStyle, width: 62, padding: "5px 6px" }}
                                />
                                <span>×</span>
                                <input type="number" defaultValue={p.precio_unitario} onBlur={(e) => actualizarPartida(p.id, "precio_unitario", parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: 85, padding: "5px 6px" }} />
                                <span style={{ marginLeft: "auto", fontWeight: 700, color: BRAND }}>
                                  {money(p.cantidad * p.precio_unitario)}
                                </span>
                              </>
                            ) : (
                              <span>{p.cantidad} {p.unidad} × {money(p.precio_unitario)} = <b style={{ color: BRAND }}>{money(p.cantidad * p.precio_unitario)}</b></span>
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
                  </div>
                );
              })}
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

          <div style={{ ...cardStyle, marginTop: 16 }} className="no-print">
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

          <div style={{ ...cardStyle, marginTop: 16 }} className="no-print">
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

          {/* ---------- Vista de impresión pulida ---------- */}
          <div className="print-only pdf-hoja">
            <div className="pdf-encabezado">
              <img src={logo} alt="Logo" className="pdf-logo" />
              <div className="pdf-meta">
                <div className="pdf-titulo">COTIZACIÓN</div>
                <div className="pdf-folio">{cotizacion.folio}</div>
                <div className="pdf-fecha">
                  {new Date(cotizacion.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
            </div>
            <div className="pdf-franja" />

            <div className="pdf-datos">
              <div>
                <div className="pdf-label">Cliente</div>
                <div className="pdf-valor">{trabajo?.clientes?.nombre || "—"}</div>
              </div>
              <div>
                <div className="pdf-label">Folio de trabajo</div>
                <div className="pdf-valor">{trabajo?.folio}</div>
              </div>
              <div>
                <div className="pdf-label">Dirección</div>
                <div className="pdf-valor">{trabajo?.clientes?.direccion || "—"}</div>
              </div>
              <div>
                <div className="pdf-label">Estatus</div>
                <div className="pdf-valor" style={{ color: ESTATUS_COLOR[cotizacion.estatus], fontWeight: 700 }}>
                  {ESTATUS_LABEL[cotizacion.estatus]}
                </div>
              </div>
            </div>

            {agruparPorCategoria(partidas).map((grupo, gIdx) => {
              const subtotalGrupo = grupo.items.reduce((s, { p }) => s + Number(p.cantidad || 0) * Number(p.precio_unitario || 0), 0);
              return (
                <div key={gIdx}>
                  {grupo.categoria && (
                    <div className="pdf-grupo-header">
                      <span className="pdf-grupo-nombre">{grupo.categoria}</span>
                      <span className="pdf-grupo-subtotal">{money(subtotalGrupo)}</span>
                    </div>
                  )}
                  {grupo.items.map(({ p, idx }) => (
                    <div key={p.id} className="pdf-concepto-fila">
                      <div className="pdf-concepto-num">{String(idx + 1).padStart(2, "0")}</div>
                      <div className="pdf-concepto-info">
                        <div className="pdf-concepto-titulo">{p.descripcion || "(sin descripción)"}</div>
                        {p.detalle && <div className="pdf-concepto-detalle">{p.detalle}</div>}
                        <div className="pdf-concepto-cantidad">{p.cantidad} {p.unidad} × {money(p.precio_unitario)}</div>
                      </div>
                      <div className="pdf-concepto-importe">{money(p.cantidad * p.precio_unitario)}</div>
                    </div>
                  ))}
                </div>
              );
            })}

            <div className="pdf-totales-wrap">
              <div className="pdf-totales-box">
                <div className="pdf-totales-fila"><span>Subtotal</span><span>{money(cotizacion.subtotal)}</span></div>
                {cotizacion.aplica_iva && (
                  <div className="pdf-totales-fila"><span>IVA (16%)</span><span>{money(cotizacion.iva)}</span></div>
                )}
                <div className="pdf-totales-final"><span>Total</span><span>{money(cotizacion.total)}</span></div>
              </div>
            </div>

            {(cotizacion.tiempo_ejecucion || cotizacion.forma_pago) && (
              <div className="pdf-condiciones">
                <div className="pdf-cond-card">
                  <div className="pdf-label">Tiempo de ejecución</div>
                  <div className="pdf-cond-valor">{cotizacion.tiempo_ejecucion || "—"}</div>
                </div>
                <div className="pdf-cond-card">
                  <div className="pdf-label">Forma de pago</div>
                  <div className="pdf-cond-valor">{cotizacion.forma_pago || "—"}</div>
                </div>
              </div>
            )}

            <div className="pdf-clausula">
              <b>1.</b> {CLAUSULA_ALCANCE}
              {cotizacion.condiciones_adicionales && (<><br /><br /><b>2.</b> {cotizacion.condiciones_adicionales}</>)}
            </div>

            <div className="pdf-pie">
              <div className="pdf-validez">Cotización válida por 15 días</div>
              <div className="pdf-firma">
                {cotizacion.firma_tipo === "dibujada" && cotizacion.firma_dato ? (
                  <img src={cotizacion.firma_dato} alt="firma" style={{ height: 46 }} />
                ) : cotizacion.firma_tipo === "texto" ? (
                  <div style={{ fontSize: 12 }}>☑ {cotizacion.firma_nombre}</div>
                ) : null}
                <div className="pdf-firma-linea" />
                <div className="pdf-firma-label">Firma de conformidad</div>
              </div>
            </div>
          </div>

          <button onClick={() => window.print()} className="no-print" style={{ ...secondaryBtnStyle, marginTop: 16 }}>
            <Printer size={14} /> Exportar PDF
          </button>
          {puedeEditar && (
            <button onClick={borrarTrabajo} className="no-print" style={{ ...secondaryBtnStyle, marginTop: 10, color: "#B5482F", borderColor: "#F0C9C2" }}>
              <Trash2 size={14} /> Borrar trabajo completo (cotización + reporte)
            </button>
          )}
        </>
      )}
      <datalist id="categorias-usadas">
        {[...new Set(partidas.map((p) => (p.categoria || "").trim()).filter(Boolean))].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="unidades-medida">
        <option value="PZA" />
        <option value="m²" />
        <option value="m³" />
        <option value="ml" />
        <option value="lote" />
        <option value="servicio" />
        <option value="hr" />
        <option value="día" />
        <option value="kg" />
        <option value="global" />
      </datalist>
      <style>{`
        .spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff; }
        }
        .pdf-hoja { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; padding: 12px 4px; }
        .pdf-encabezado { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .pdf-logo { height: 46px; width: auto; }
        .pdf-meta { text-align: right; padding-top: 2px; }
        .pdf-titulo { font-family: "Courier New", monospace; font-size: 11px; letter-spacing: 1.5px; color: ${BRAND}; font-weight: 700; }
        .pdf-folio { font-family: "Courier New", monospace; font-size: 18px; font-weight: 700; color: #1C2A3E; margin-top: 4px; }
        .pdf-fecha { font-size: 12px; color: #9C9585; margin-top: 4px; }
        .pdf-franja { height: 4px; background: linear-gradient(90deg, ${BRAND}, #C9433F); border-radius: 4px; margin-bottom: 22px; }
        .pdf-datos { background: #FAF8F4; border-radius: 8px; padding: 16px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 24px; }
        .pdf-label { font-family: "Courier New", monospace; font-size: 9.5px; letter-spacing: 0.6px; color: ${BRAND}; text-transform: uppercase; margin-bottom: 3px; font-weight: 700; }
        .pdf-valor { font-size: 13px; color: #1C2A3E; font-weight: 500; }
        .pdf-grupo-header { display: flex; justify-content: space-between; align-items: center; background: #FAF8F4; border-radius: 4px; padding: 6px 10px; margin: 14px 0 4px; }
        .pdf-grupo-nombre { font-family: "Courier New", monospace; font-size: 10.5px; font-weight: 700; color: ${BRAND}; text-transform: uppercase; letter-spacing: 0.4px; }
        .pdf-grupo-subtotal { font-size: 11.5px; font-weight: 600; color: #6B6656; }
        .pdf-concepto-fila { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid #F0EDE4; }
        .pdf-concepto-num { width: 22px; height: 22px; border-radius: 50%; background: #FAF8F4; color: ${BRAND}; display: flex; align-items: center; justify-content: center; font-family: "Courier New", monospace; font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
        .pdf-concepto-info { flex: 1; }
        .pdf-concepto-titulo { font-size: 12.5px; font-weight: 600; color: #1C2A3E; line-height: 1.4; }
        .pdf-concepto-detalle { font-size: 11px; color: #9C9585; margin-top: 2px; }
        .pdf-concepto-cantidad { font-size: 10.5px; color: #9C9585; margin-top: 4px; font-family: "Courier New", monospace; }
        .pdf-concepto-importe { font-size: 13px; font-weight: 700; color: ${BRAND}; white-space: nowrap; }
        .pdf-totales-wrap { display: flex; justify-content: flex-end; margin-top: 6px; }
        .pdf-totales-box { width: 250px; background: #FAF8F4; border-radius: 8px; padding: 14px 18px; }
        .pdf-totales-fila { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11.5px; color: #6B6656; }
        .pdf-totales-final { display: flex; justify-content: space-between; padding-top: 8px; margin-top: 6px; border-top: 2px solid ${BRAND}; }
        .pdf-totales-final span:first-child { font-weight: 700; font-size: 13px; color: #1C2A3E; }
        .pdf-totales-final span:last-child { font-weight: 800; font-size: 18px; color: ${BRAND}; }
        .pdf-condiciones { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 26px; }
        .pdf-cond-card { background: #FAF8F4; border-radius: 8px; padding: 12px 14px; }
        .pdf-cond-valor { font-size: 11.5px; color: #1C2A3E; line-height: 1.5; }
        .pdf-clausula { margin-top: 18px; padding: 12px 16px; background: #FBF6F0; border-left: 3px solid #E0983A; border-radius: 4px; font-size: 9.5px; color: #8A7A5E; line-height: 1.6; }
        .pdf-pie { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; }
        .pdf-validez { font-size: 9.5px; color: #9C9585; }
        .pdf-firma { text-align: center; }
        .pdf-firma-linea { width: 170px; border-bottom: 1px solid #D9D3C4; margin: 4px 0 6px; }
        .pdf-firma-label { font-size: 9px; color: #9C9585; }
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
