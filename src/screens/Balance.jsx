import React, { useState, useEffect } from "react";
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { dbSelect } from "../lib/api";

const BRAND = "#9E191B";
const VERDE = "#3F7268";
const money = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

export default function Balance({ session, onBack }) {
  const { accessToken } = session;
  const [trabajos, setTrabajos] = useState([]);
  const [cotizaciones, setCotizaciones] = useState([]);
  const [cobranza, setCobranza] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandido, setExpandido] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [ts, cots, cobs, gis] = await Promise.all([
          dbSelect(accessToken, "trabajos", "select=id,folio,clientes(nombre)&order=created_at.desc"),
          dbSelect(accessToken, "cotizaciones", "select=trabajo_id,total,estatus,created_at&order=created_at.desc"),
          dbSelect(accessToken, "cobranza", "select=trabajo_id,monto,estatus"),
          dbSelect(accessToken, "gastos_ingresos", "select=trabajo_id,tipo,monto"),
        ]);
        setTrabajos(ts);
        setCotizaciones(cots);
        setCobranza(cobs);
        setGastos(gis);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken]);

  // Solo la cotización más reciente de cada trabajo
  const cotizacionPorTrabajo = {};
  cotizaciones.forEach((c) => {
    if (!cotizacionPorTrabajo[c.trabajo_id]) cotizacionPorTrabajo[c.trabajo_id] = c;
  });

  const filas = trabajos.map((t) => {
    const cotizado = Number(cotizacionPorTrabajo[t.id]?.total || 0);
    const cobrado = cobranza.filter((c) => c.trabajo_id === t.id && c.estatus === "pagado").reduce((s, c) => s + Number(c.monto), 0);
    const pendienteCobro = cobranza.filter((c) => c.trabajo_id === t.id && c.estatus !== "pagado").reduce((s, c) => s + Number(c.monto), 0);
    const gastado = gastos.filter((g) => g.trabajo_id === t.id && g.tipo === "gasto").reduce((s, g) => s + Number(g.monto), 0);
    const ingresoExtra = gastos.filter((g) => g.trabajo_id === t.id && g.tipo === "ingreso").reduce((s, g) => s + Number(g.monto), 0);
    const balanceCaja = cobrado + ingresoExtra - gastado;
    const utilidadProyectada = cotizado + ingresoExtra - gastado;
    return { trabajo: t, cotizado, cobrado, pendienteCobro, gastado, balanceCaja, utilidadProyectada };
  }).filter((f) => f.cotizado || f.cobrado || f.gastado); // solo trabajos con movimiento

  // Generales (sin trabajo)
  const gastosGenerales = gastos.filter((g) => !g.trabajo_id && g.tipo === "gasto").reduce((s, g) => s + Number(g.monto), 0);
  const ingresosGenerales = gastos.filter((g) => !g.trabajo_id && g.tipo === "ingreso").reduce((s, g) => s + Number(g.monto), 0);

  // Totales de la empresa
  const totalCotizado = filas.reduce((s, f) => s + f.cotizado, 0);
  const totalCobrado = filas.reduce((s, f) => s + f.cobrado, 0);
  const totalGastadoTrabajos = filas.reduce((s, f) => s + f.gastado, 0);
  const balanceGeneral = (totalCobrado + ingresosGenerales) - (totalGastadoTrabajos + gastosGenerales);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "#1C2A3E" }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Balance</span>
      </div>

      {error && (
        <div style={{ background: "#FBEAE5", color: "#B5482F", fontSize: 12.5, padding: "8px 10px", borderRadius: 4, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Balance general de la empresa */}
      <div style={{ background: "#1C2A3E", borderRadius: 8, padding: 18, marginBottom: 8 }}>
        <div style={{ fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", color: "#C9C2B0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          Balance general del negocio
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: balanceGeneral >= 0 ? "#6FCF97" : "#F0908A" }}>
          {money(balanceGeneral)}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          <MiniStat label="Cobrado (trabajos)" valor={totalCobrado} />
          <MiniStat label="Ingresos generales" valor={ingresosGenerales} />
          <MiniStat label="Gastado (trabajos)" valor={totalGastadoTrabajos} />
          <MiniStat label="Gastos generales" valor={gastosGenerales} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#9C9585", marginBottom: 20, lineHeight: 1.5 }}>
        Este balance es de <b>caja</b> (dinero que ya entró vs. ya salió). El total cotizado (
        {money(totalCotizado)}) que aún no se ha cobrado no cuenta aquí todavía.
      </div>

      {loading ? (
        <Loader2 className="spin-icon" size={20} />
      ) : filas.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9C9585" }}>Aún no hay trabajos con movimientos.</div>
      ) : (
        <>
          <div style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", color: "#8A5A2E", margin: "8px 0" }}>
            BALANCE POR TRABAJO
          </div>
          {filas.map((f) => {
            const abierto = expandido === f.trabajo.id;
            return (
              <div key={f.trabajo.id} style={{ background: "#fff", border: "1px solid #E4DFD2", borderRadius: 6, marginBottom: 10, overflow: "hidden" }}>
                <button
                  onClick={() => setExpandido(abierto ? null : f.trabajo.id)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, fontWeight: 600 }}>{f.trabajo.folio}</div>
                    <div style={{ fontSize: 11.5, color: "#6B6656" }}>{f.trabajo.clientes?.nombre || "—"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: f.balanceCaja >= 0 ? VERDE : BRAND }}>
                      {money(f.balanceCaja)}
                    </span>
                    {abierto ? <ChevronUp size={16} color="#9C9585" /> : <ChevronDown size={16} color="#9C9585" />}
                  </div>
                </button>
                {abierto && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px dashed #E4DFD2" }}>
                    <DetalleFila label="Cotizado" valor={f.cotizado} />
                    <DetalleFila label="Cobrado" valor={f.cobrado} color={VERDE} />
                    <DetalleFila label="Pendiente de cobrar" valor={f.pendienteCobro} color="#B08A3E" />
                    <DetalleFila label="Gastado" valor={f.gastado} color={BRAND} negativo />
                    <div style={{ borderTop: "1px solid #F0EDE4", marginTop: 8, paddingTop: 8 }}>
                      <DetalleFila label="Balance de caja (cobrado − gastado)" valor={f.balanceCaja} color={f.balanceCaja >= 0 ? VERDE : BRAND} bold />
                      <DetalleFila label="Utilidad proyectada (cotizado − gastado)" valor={f.utilidadProyectada} color={f.utilidadProyectada >= 0 ? VERDE : BRAND} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      <style>{`.spin-icon { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MiniStat({ label, valor }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "#8B96A8", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#F7F5F0" }}>{money(valor)}</div>
    </div>
  );
}

function DetalleFila({ label, valor, color = "#1C2A3E", bold, negativo }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: bold ? 13.5 : 12.5 }}>
      <span style={{ color: "#6B6656", fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 600 }}>{negativo && valor > 0 ? "−" : ""}{money(valor)}</span>
    </div>
  );
}
