import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, Plus, Camera, Trash2, X, PenLine, Type, Loader2, ChevronDown,
} from "lucide-react";
import {
  dbSelect, dbInsert, dbUpdate, uploadFoto, getSignedUrl,
} from "../lib/api";

const BRAND = "#9E191B";

// ---------- Firma dibujada ----------
function FirmaCanvas({ onSave }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    hasStroke.current = true;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = "#1C2A3E";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    hasStroke.current = false;
  };
  const save = () => {
    if (!hasStroke.current) return;
    onSave(canvasRef.current.toDataURL());
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        style={{
          width: "100%", height: 120, background: "#fff",
          border: "1px dashed #C9C2B0", borderRadius: 4, touchAction: "none", cursor: "crosshair",
        }}
      />
      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
        <button onClick={clear} style={linkBtnStyle}>limpiar</button>
        <button onClick={save} style={{ ...linkBtnStyle, color: BRAND, fontWeight: 600 }}>
          guardar firma
        </button>
      </div>
    </div>
  );
}
const linkBtnStyle = {
  fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E",
  background: "none", border: "none", cursor: "pointer", padding: 0,
};

export default function ReportesFotograficos({ session, onBack }) {
  const { accessToken, profile, cliente } = session;
  const puedeEditar = profile.rol === "admin" || profile.rol === "tecnico";
  const puedeFirmar = profile.rol === "cliente" ? !!cliente?.firma_reportes : true;

  const [clientes, setClientes] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [trabajoId, setTrabajoId] = useState(null);
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

  const cargarPartidas = async (tId) => {
    setLoading(true);
    setError("");
    try {
      const ps = await dbSelect(accessToken, "partidas", `select=*&trabajo_id=eq.${tId}&order=numero.asc`);
      const conDetalle = await Promise.all(
        ps.map(async (p) => {
          const fotos = await dbSelect(accessToken, "reporte_fotos", `select=*&partida_id=eq.${p.id}&order=created_at.asc`);
          const fotosConUrl = await Promise.all(
            fotos.map(async (f) => ({ ...f, url: await getSignedUrl(accessToken, f.url_foto) }))
          );
          const firmasRes = await dbSelect(accessToken, "firmas", `select=*&partida_id=eq.${p.id}&order=fecha.desc&limit=1`);
          return { ...p, fotos: fotosConUrl, firma: firmasRes[0] || null };
        })
      );
      setPartidas(conDetalle);
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
      firma_reportes: true, ve_estado_cuenta: false,
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
      const [t] = await dbInsert(accessToken, "trabajos", {
        folio: nuevoFolio, cliente_id: nuevoClienteId,
      });
      setTrabajos((prev) => [t, ...prev]);
      setNuevoFolio("");
      setNuevoClienteId("");
      cargarPartidas(t.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const agregarPartida = async () => {
    const numero = partidas.length + 1;
    try {
      const [p] = await dbInsert(accessToken, "partidas", {
        trabajo_id: trabajoId, numero, descripcion: "",
      });
      setPartidas((prev) => [...prev, { ...p, fotos: [], firma: null }]);
    } catch (e) {
      setError(e.message);
    }
  };

  const actualizarDescripcion = async (partidaId, descripcion) => {
    setPartidas((prev) => prev.map((p) => (p.id === partidaId ? { ...p, descripcion } : p)));
    try {
      await dbUpdate(accessToken, "partidas", `id=eq.${partidaId}`, { descripcion });
    } catch (e) {
      setError(e.message);
    }
  };

  const subirFoto = async (partidaId, fileList) => {
    for (const file of Array.from(fileList)) {
      try {
        const path = await uploadFoto(accessToken, partidaId, file);
        const [row] = await dbInsert(accessToken, "reporte_fotos", {
          partida_id: partidaId, url_foto: path, comentario: "",
        });
        const url = await getSignedUrl(accessToken, path);
        setPartidas((prev) =>
          prev.map((p) =>
            p.id === partidaId ? { ...p, fotos: [...p.fotos, { ...row, url }] } : p
          )
        );
      } catch (e) {
        setError(e.message);
      }
    }
  };

  const actualizarComentario = async (partidaId, fotoId, comentario) => {
    setPartidas((prev) =>
      prev.map((p) =>
        p.id === partidaId
          ? { ...p, fotos: p.fotos.map((f) => (f.id === fotoId ? { ...f, comentario } : f)) }
          : p
      )
    );
    try {
      await dbUpdate(accessToken, "reporte_fotos", `id=eq.${fotoId}`, { comentario });
    } catch (e) {
      setError(e.message);
    }
  };

  const guardarFirmaDibujada = async (partidaId, dataUrl) => {
    try {
      const [f] = await dbInsert(accessToken, "firmas", {
        partida_id: partidaId, tipo: "dibujada", dato: dataUrl,
        nombre_cliente: cliente?.nombre || profile.nombre || "",
      });
      setPartidas((prev) => prev.map((p) => (p.id === partidaId ? { ...p, firma: f } : p)));
    } catch (e) {
      setError(e.message);
    }
  };

  const guardarFirmaTexto = async (partidaId, nombre) => {
    try {
      const [f] = await dbInsert(accessToken, "firmas", {
        partida_id: partidaId, tipo: "texto", nombre_cliente: nombre,
      });
      setPartidas((prev) => prev.map((p) => (p.id === partidaId ? { ...p, firma: f } : p)));
    } catch (e) {
      setError(e.message);
    }
  };

  // ---------- Vista: elegir / crear trabajo ----------
  if (!trabajoId) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
        <BackBar onBack={onBack} title="Reportes fotográficos" />

        {error && <ErrorBox text={error} />}

        {puedeEditar && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>NUEVO TRABAJO</div>
            <div style={{ padding: 16 }}>
              <input
                value={nuevoFolio}
                onChange={(e) => setNuevoFolio(e.target.value)}
                placeholder="Folio (ej. OT-2026-020)"
                style={inputStyle}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <select
                  value={nuevoClienteId}
                  onChange={(e) => setNuevoClienteId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">Selecciona cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                <button onClick={() => setMostrarNuevoCliente((v) => !v)} style={secondaryBtnStyle}>
                  + cliente
                </button>
              </div>
              {mostrarNuevoCliente && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    value={nuevoClienteNombre}
                    onChange={(e) => setNuevoClienteNombre(e.target.value)}
                    placeholder="Nombre del nuevo cliente"
                    style={{ ...inputStyle, flex: 1 }}
                  />
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
        {!loading && trabajos.length === 0 && (
          <div style={{ fontSize: 13, color: "#9C9585" }}>Aún no hay trabajos.</div>
        )}
        {trabajos.map((t) => (
          <button
            key={t.id}
            onClick={() => cargarPartidas(t.id)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              width: "100%", textAlign: "left", background: "#fff", border: "1px solid #E4DFD2",
              borderRadius: 6, padding: "12px 14px", marginBottom: 8, cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, fontWeight: 600 }}>
                {t.folio}
              </div>
              <div style={{ fontSize: 12, color: "#6B6656" }}>{t.clientes?.nombre || "—"}</div>
            </div>
            <ChevronDown size={16} style={{ transform: "rotate(-90deg)", color: "#9C9585" }} />
          </button>
        ))}
      </div>
    );
  }

  // ---------- Vista: partidas del trabajo ----------
  const trabajo = trabajos.find((t) => t.id === trabajoId);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <BackBar onBack={() => setTrabajoId(null)} title={trabajo?.folio || "Trabajo"} />
      {error && <ErrorBox text={error} />}

      {loading ? (
        <Loader2 className="spin-icon" size={20} />
      ) : (
        <>
          {partidas.map((partida, idx) => (
            <PartidaCard
              key={partida.id}
              partida={partida}
              idx={idx}
              puedeEditar={puedeEditar}
              puedeFirmar={puedeFirmar}
              onDescripcion={(v) => actualizarDescripcion(partida.id, v)}
              onFotos={(files) => subirFoto(partida.id, files)}
              onComentario={(fotoId, v) => actualizarComentario(partida.id, fotoId, v)}
              onFirmaDibujada={(dataUrl) => guardarFirmaDibujada(partida.id, dataUrl)}
              onFirmaTexto={(nombre) => guardarFirmaTexto(partida.id, nombre)}
            />
          ))}

          {puedeEditar && (
            <button onClick={agregarPartida} style={{ ...secondaryBtnStyle, width: "100%", justifyContent: "center", padding: 12 }}>
              <Plus size={15} /> Agregar partida
            </button>
          )}
        </>
      )}
      <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PartidaCard({ partida, idx, puedeEditar, puedeFirmar, onDescripcion, onFotos, onComentario, onFirmaDibujada, onFirmaTexto }) {
  const [firmaTipo, setFirmaTipo] = useState("dibujada");
  const [nombreFirma, setNombreFirma] = useState("");

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>PARTIDA {String(idx + 1).padStart(2, "0")}</div>
      <div style={{ padding: 16 }}>
        {puedeEditar ? (
          <input
            defaultValue={partida.descripcion}
            onBlur={(e) => onDescripcion(e.target.value)}
            placeholder="Descripción del concepto"
            style={{ ...inputStyle, marginBottom: 14 }}
          />
        ) : (
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>
            {partida.descripcion || "(sin descripción)"}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginBottom: 12 }}>
          {partida.fotos.map((foto) => (
            <div key={foto.id}>
              <img src={foto.url} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 4, border: "1px solid #E4DFD2" }} />
              {puedeEditar ? (
                <input
                  defaultValue={foto.comentario}
                  onBlur={(e) => onComentario(foto.id, e.target.value)}
                  placeholder="comentario (opc.)"
                  style={{ width: "100%", fontSize: 10.5, border: "none", borderTop: "1px solid #E4DFD2", padding: "4px 2px", outline: "none", color: "#6B6656" }}
                />
              ) : foto.comentario ? (
                <div style={{ fontSize: 10.5, color: "#6B6656", padding: "4px 2px" }}>{foto.comentario}</div>
              ) : null}
            </div>
          ))}
          {puedeEditar && (
            <label style={{
              height: 90, border: "1px dashed #C9C2B0", borderRadius: 4, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
              cursor: "pointer", color: "#8A5A2E", fontSize: 11,
            }}>
              <Camera size={18} />
              Agregar foto
              <input type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }}
                onChange={(e) => { onFotos(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>

        <div style={{ borderTop: "1px dashed #C9C2B0", paddingTop: 12, marginTop: 6 }}>
          {partida.firma ? (
            <div>
              <div style={{ fontSize: 11, color: "#6B6656", marginBottom: 6 }}>Firmado</div>
              {partida.firma.tipo === "dibujada" ? (
                <img src={partida.firma.dato} alt="firma" style={{ height: 60 }} />
              ) : (
                <div style={{ fontSize: 13 }}>☑ Conforme — {partida.firma.nombre_cliente}</div>
              )}
            </div>
          ) : puedeFirmar ? (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <ToggleBtn active={firmaTipo === "dibujada"} onClick={() => setFirmaTipo("dibujada")} icon={<PenLine size={13} />} label="Firma dibujada" />
                <ToggleBtn active={firmaTipo === "texto"} onClick={() => setFirmaTipo("texto")} icon={<Type size={13} />} label="Nombre + check" />
              </div>
              {firmaTipo === "dibujada" ? (
                <FirmaCanvas onSave={onFirmaDibujada} />
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={nombreFirma} onChange={(e) => setNombreFirma(e.target.value)} placeholder="Nombre del cliente" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => onFirmaTexto(nombreFirma)} style={secondaryBtnStyle}>Firmar</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: "#9C9585" }}>Sin firmar</div>
          )}
        </div>
      </div>
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
function ToggleBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 4,
      border: active ? `1px solid ${BRAND}` : "1px solid #E4DFD2", background: active ? BRAND : "#fff",
      color: active ? "#fff" : "#4A4438", fontSize: 11.5, cursor: "pointer",
    }}>
      {icon} {label}
    </button>
  );
}

const cardStyle = { background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, marginBottom: 16, overflow: "hidden" };
const cardHeaderStyle = { padding: "10px 16px", background: "#EFEAE0", borderBottom: "1px dashed #C9C2B0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: "#8A5A2E" };
const inputStyle = { width: "100%", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 10px", fontSize: 13.5, outline: "none" };
const primaryBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: BRAND, color: "#fff", border: "none", borderRadius: 4, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const secondaryBtnStyle = { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#1C2A3E", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" };
