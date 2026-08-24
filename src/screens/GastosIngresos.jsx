import React, { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Loader2, TrendingUp, TrendingDown, X } from "lucide-react";
import { dbSelect, dbInsert, dbDelete } from "../lib/api";

const BRAND = "#9E191B";
const VERDE = "#3F7268";

const CATEGORIAS_GASTO = ["Materiales", "Mano de obra", "Transporte", "Herramientas", "Renta", "Nómina", "Servicios", "Otro"];
const CATEGORIAS_INGRESO = ["Anticipo", "Pago", "Venta", "Otro"];

const money = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
const hoy = () => new Date().toISOString().slice(0, 10);

export default function GastosIngresos({ session, onBack }) {
  const { accessToken } = session;

  const [trabajos, setTrabajos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filtro, setFiltro] = useState("todos"); // todos | trabajo | generales
  const [filtroTrabajoId, setFiltroTrabajoId] = useState("");

  const [formAbierto, setFormAbierto] = useState(false);
  const [fTipo, setFTipo] = useState("gasto");
  const [fCategoria, setFCategoria] = useState(CATEGORIAS_GASTO[0]);
  const [fConcepto, setFConcepto] = useState("");
  const [fMonto, setFMonto] = useState("");
  const [fFecha, setFFecha] = useState(hoy());
  const [fTrabajoId, setFTrabajoId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [ts, ms] = await Promise.all([
          dbSelect(accessToken, "trabajos", "select=id,folio,clientes(nombre)&order=created_at.desc"),
          dbSelect(accessToken, "gastos_ingresos", "select=*,trabajos(folio)&order=fecha.desc"),
        ]);
        setTrabajos(ts);
        setMovimientos(ms);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken]);

  const abrirForm = (tipo) => {
    setFTipo(tipo);
    setFCategoria(tipo === "gasto" ? CATEGORIAS_GASTO[0] : CATEGORIAS_INGRESO[0]);
    setFConcepto("");
    setFMonto("");
    setFFecha(hoy());
    setFTrabajoId(filtro === "trabajo" ? filtroTrabajoId : "");
    setFormAbierto(true);
  };

  const guardarMovimiento = async () => {
    const monto = parseFloat(fMonto);
    if (!fConcepto.trim() || !monto || monto <= 0) {
      setError("Concepto y monto (mayor a cero) son obligatorios");
      return;
    }
    setError("");
    try {
      const [m] = await dbInsert(accessToken, "gastos_ingresos", {
        tipo: fTipo, categoria: fCategoria, concepto: fConcepto, monto,
        fecha: fFecha, trabajo_id: fTrabajoId || null,
      });
      const trabajo = trabajos.find((t) => t.id === fTrabajoId);
      setMovimientos((prev) => [{ ...m, trabajos: trabajo ? { folio: trabajo.folio } : null }, ...prev]);
      setFormAbierto(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const borrarMovimiento = async (id) => {
    if (!window.confirm("¿Borrar este movimiento?")) return;
    try {
      await dbDelete(accessToken, "gastos_ingresos", `id=eq.${id}`);
      setMovimientos((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const visibles = movimientos.filter((m) => {
    if (filtro === "trabajo") return m.trabajo_id === filtroTrabajoId;
    if (filtro === "generales") return !m.trabajo_id;
    return true;
  });

  const ingresos = visibles.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto), 0);
  const gastos = visibles.filter((m) => m.tipo === "gasto").reduce((s, m) => s + Number(m.monto), 0);
  const balance = ingresos - gastos;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "#1C2A3E" }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Gastos e ingresos</span>
      </div>

      {error && (
        <div style={{ background: "#FBEAE5", color: "#B5482F", fontSize: 12.5, padding: "8px 10px", borderRadius: 4, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <FiltroBtn active={filtro === "todos"} onClick={() => setFiltro("todos")} label="Todos" />
        <FiltroBtn active={filtro === "generales"} onClick={() => setFiltro("generales")} label="Generales" />
        <select
          value={filtro === "trabajo" ? filtroTrabajoId : ""}
          onChange={(e) => { setFiltroTrabajoId(e.target.value); setFiltro(e.target.value ? "trabajo" : "todos"); }}
          style={{ ...inputStyle, width: "auto", fontSize: 12.5, padding: "7px 10px" }}
        >
          <option value="">Filtrar por trabajo...</option>
          {trabajos.map((t) => (
            <option key={t.id} value={t.id}>{t.folio} — {t.clientes?.nombre}</option>
          ))}
        </select>
      </div>

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
        <ResumenCard label="Ingresos" valor={ingresos} color={VERDE} />
        <ResumenCard label="Gastos" valor={gastos} color={BRAND} />
        <ResumenCard label="Balance" valor={balance} color={balance >= 0 ? VERDE : BRAND} />
      </div>

      {/* Botones agregar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button onClick={() => abrirForm("ingreso")} style={{ ...primaryBtnStyle, flex: 1, background: VERDE }}>
          <TrendingUp size={15} /> Ingreso
        </button>
        <button onClick={() => abrirForm("gasto")} style={{ ...primaryBtnStyle, flex: 1 }}>
          <TrendingDown size={15} /> Gasto
        </button>
      </div>

      {/* Formulario */}
      {formAbierto && (
        <div style={{ ...cardStyle, marginBottom: 18 }}>
          <div style={{ ...cardHeaderStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>NUEVO {fTipo === "gasto" ? "GASTO" : "INGRESO"}</span>
            <button onClick={() => setFormAbierto(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A5A2E" }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ padding: 16 }}>
            <input value={fConcepto} onChange={(e) => setFConcepto(e.target.value)} placeholder="Concepto (ej. Cemento y varilla)" style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                {(fTipo === "gasto" ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO).map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
              <input type="number" value={fMonto} onChange={(e) => setFMonto(e.target.value)} placeholder="Monto" style={{ ...inputStyle, width: 110 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <select value={fTrabajoId} onChange={(e) => setFTrabajoId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">General (sin trabajo)</option>
                {trabajos.map((t) => (<option key={t.id} value={t.id}>{t.folio}</option>))}
              </select>
            </div>
            <button onClick={guardarMovimiento} style={{ ...primaryBtnStyle, width: "100%", background: fTipo === "gasto" ? BRAND : VERDE }}>
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <Loader2 className="spin-icon" size={20} />
      ) : visibles.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9C9585" }}>Sin movimientos registrados.</div>
      ) : (
        visibles.map((m) => (
          <div key={m.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, padding: "12px 14px", marginBottom: 8,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1C2A3E" }}>{m.concepto}</div>
              <div style={{ fontSize: 11, color: "#9C9585", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span>{m.categoria}</span>
                <span>·</span>
                <span>{m.fecha}</span>
                {m.trabajos?.folio && (<><span>·</span><span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{m.trabajos.folio}</span></>)}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: m.tipo === "ingreso" ? VERDE : BRAND, whiteSpace: "nowrap" }}>
                {m.tipo === "ingreso" ? "+" : "−"} {money(m.monto)}
              </span>
              <button onClick={() => borrarMovimiento(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B5482F", display: "flex" }}>
                <Trash2 size={14} />
              </button>
            </div>
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
      <div style={{ fontSize: 9.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{money(valor)}</div>
    </div>
  );
}

function FiltroBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 12px", borderRadius: 4, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
      border: active ? `1px solid ${BRAND}` : "1px solid #E4DFD2",
      background: active ? BRAND : "#fff", color: active ? "#fff" : "#4A4438",
    }}>
      {label}
    </button>
  );
}

const cardStyle = { background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, overflow: "hidden" };
const cardHeaderStyle = { padding: "10px 16px", background: "#EFEAE0", borderBottom: "1px dashed #C9C2B0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: "#8A5A2E" };
const inputStyle = { width: "100%", border: "1px solid #E4DFD2", borderRadius: 4, padding: "9px 10px", fontSize: 13.5, outline: "none" };
const primaryBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: BRAND, color: "#fff", border: "none", borderRadius: 4, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
