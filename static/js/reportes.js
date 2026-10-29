
let selectedTicketForAnular = null;

function openAnularModal(ticketId, ticketCode, totalUsd) {
  selectedTicketForAnular = { id: ticketId, code: ticketCode, total: totalUsd };
  const infoEl = document.getElementById('anularTicketInfo');
  if (infoEl) {
    infoEl.innerText = `Ticket: #${ticketCode} • Total: $${totalUsd.toFixed(2)}`;
  }
  const pwd = document.getElementById('anularPasswordInput');
  if (pwd) pwd.value = '';

  document.getElementById('anularTicketModal').classList.add('open');
  setTimeout(() => { if (pwd) pwd.focus(); }, 150);
}

function closeAnularTicketModal() {
  document.getElementById('anularTicketModal').classList.remove('open');
  selectedTicketForAnular = null;
}

async function submitAnularTicket() {
  if (!selectedTicketForAnular) return;
  const pwdInput = document.getElementById('anularPasswordInput');
  const password = pwdInput ? pwdInput.value.trim() : '';

  if (!password) {
    showToast('Ingresa la contraseña de supervisor', 'error');
    if (pwdInput) pwdInput.focus();
    return;
  }

  try {
    const res = await fetch(`/api/ventas/${selectedTicketForAnular.id}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const result = await res.json();

    if (!res.ok) {
      showToast(result.error || 'Error al anular ticket', 'error');
      if (pwdInput) {
        pwdInput.value = '';
        pwdInput.focus();
      }
      return;
    }

    showToast(result.mensaje || 'Ticket anulado y stock devuelto', 'success');
    closeAnularTicketModal();

    // Recargar vista activa
    if (currentTab === 'hoy') {
      loadDailyReport();
    } else {
      const picker = document.getElementById('historyDatePicker');
      const fechaAbierta = currentHistoryDate || (picker && picker.value);
      if (fechaAbierta) {
        consultarFechaEspecifica(fechaAbierta);
      } else {
        loadHistorialList();
      }
    }

  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const iconSvg = type === 'success'
    ? '<svg class="flaticon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg class="flaticon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="display: flex; align-items: center;">${iconSvg}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2800);
}

// ===================================================
// KRONO POS PRO - CIERRE DE CAJA & HISTORIAL
// ===================================================

let currentTab = 'hoy';
let currentHistoryDate = null;

// Metadatos de colores para métodos de pago (sin íconos)
const methodMeta = {
  'Dólares (Efectivo)': { label: 'Dólares en Efectivo ($)', color: '#059669', border: '#10b981' },
  'Dólares': { label: 'Dólares en Efectivo ($)', color: '#059669', border: '#10b981' },
  'Efectivo $': { label: 'Dólares en Efectivo ($)', color: '#059669', border: '#10b981' },
  'Dólares Efectivo': { label: 'Dólares en Efectivo ($)', color: '#059669', border: '#10b981' },
  'EFECTIVO_USD': { label: 'Dólares en Efectivo ($)', color: '#059669', border: '#10b981' },
  'Pago Móvil': { label: 'Banco - Pago Móvil (Bs)', color: '#2563eb', border: '#3b82f6' },
  'Punto de Venta': { label: 'Banco - Punto / Tarjeta (Bs)', color: '#7c3aed', border: '#8b5cf6' },
  'Bolívares (Efectivo)': { label: 'Bolívares en Efectivo (Bs)', color: '#d97706', border: '#f59e0b' },
  'Bolívares': { label: 'Bolívares en Efectivo (Bs)', color: '#d97706', border: '#f59e0b' },
  'Efectivo Bs': { label: 'Bolívares en Efectivo (Bs)', color: '#d97706', border: '#f59e0b' },
  'Pago Mixto': { label: 'Pago Mixto ($ + Bs)', color: '#0891b2', border: '#06b6d4' },
  'Mixto': { label: 'Pago Mixto ($ + Bs)', color: '#0891b2', border: '#06b6d4' }
};

// 1. Alternar entre Cierre de Hoy e Historial
function switchReportTab(tab) {
  currentTab = tab;

  const btnHoy = document.getElementById('tabBtnHoy');
  const btnHistorial = document.getElementById('tabBtnHistorial');
  const viewHoy = document.getElementById('viewCierreHoy');
  const viewHistorial = document.getElementById('viewHistorial');

  const menuHoy = document.getElementById('menuCierreHoy');
  const menuHistorial = document.getElementById('menuCierreHistorial');

  if (tab === 'hoy') {
    if (btnHoy) btnHoy.classList.add('active');
    if (btnHistorial) btnHistorial.classList.remove('active');
    if (viewHoy) viewHoy.style.display = 'flex';
    if (viewHistorial) viewHistorial.style.display = 'none';

    if (menuHoy) menuHoy.classList.add('active');
    if (menuHistorial) menuHistorial.classList.remove('active');

    loadDailyReport();
  } else {
    if (btnHoy) btnHoy.classList.remove('active');
    if (btnHistorial) btnHistorial.classList.add('active');
    if (viewHoy) viewHoy.style.display = 'none';
    if (viewHistorial) viewHistorial.style.display = 'flex';

    if (menuHoy) menuHoy.classList.remove('active');
    if (menuHistorial) menuHistorial.classList.add('active');

    loadHistorialList();
  }
}

// 2. Cargar Cierre de Hoy
async function loadDailyReport() {
  try {
    const res = await fetch('/api/reportes/hoy');
    const data = await res.json();

    const arqueoGrid = document.getElementById('arqueoGrid');
    if (arqueoGrid) {
      let arqueoHtml = `
        <div class="arqueo-card" style="border-left: 3.5px solid #10b981;">
          <span class="arqueo-title">Total Recaudado Hoy</span>
          <div class="arqueo-amount-usd" style="color: #059669;">$${data.total_usd.toFixed(2)}</div>
          <div class="arqueo-amount-bs">Equivalente: Bs. ${data.total_bs.toFixed(2)}</div>
          <span style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">Total de ${data.total_tickets} tickets activos ${data.total_anulados > 0 ? `(${data.total_anulados} anulados)` : ''}</span>
        </div>
      `;

      if (data.arqueo_caja && data.arqueo_caja.length > 0) {
        data.arqueo_caja.forEach(m => {
          const meta = methodMeta[m.metodo_pago] || { label: m.metodo_pago, color: '#1e293b', border: '#94a3b8' };
          arqueoHtml += `
            <div class="arqueo-card" style="border-left: 3.5px solid ${meta.border};">
              <span class="arqueo-title">${meta.label}</span>
              <div class="arqueo-amount-usd" style="color: ${meta.color};">$${m.total_usd.toFixed(2)}</div>
              <div class="arqueo-amount-bs">Bs. ${m.total_bs.toFixed(2)}</div>
              <span style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">${m.cantidad_transacciones} cobros registrados</span>
            </div>
          `;
        });
      }
      arqueoGrid.innerHTML = arqueoHtml;
    }

    // Tabla de productos vendidos hoy
    const soldTbody = document.getElementById('soldProductsTableBody');
    if (soldTbody) {
      if (!data.desglose_productos || data.desglose_productos.length === 0) {
        soldTbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">
              Aún no se han registrado ventas hoy. Realiza un cobro en el Punto de Venta para verlo reflejado.
            </td>
          </tr>
        `;
      } else {
        soldTbody.innerHTML = data.desglose_productos.map(item => {
          const isCaja = item.tipo_venta === 'CAJA';
          return `
            <tr>
              <td><b style="color: #1e293b;">${item.nombre_producto}</b></td>
              <td>
                <span style="background: ${isCaja ? '#fef3c7' : '#dcfce7'}; color: ${isCaja ? '#92400e' : '#166534'}; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">
                  ${isCaja ? 'Por Caja' : 'Por Paquete'}
                </span>
              </td>
              <td><b>${item.total_vendido} ${isCaja ? 'cajas' : 'paq'}</b></td>
              <td style="color: #ef4444; font-weight: 700;">-${item.total_paquetes_descontados} paq</td>
              <td style="font-weight: 800; color: #059669;">$${item.total_generado.toFixed(2)}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Tabla de stock remanente
    const stockTbody = document.getElementById('remainingStockTableBody');
    if (stockTbody && data.inventario_total) {
      stockTbody.innerHTML = data.inventario_total.map(p => {
        const cajas = Math.floor(p.stock_paquetes / p.unidades_por_caja);
        const sueltos = p.stock_paquetes % p.unidades_por_caja;
        const isLow = p.stock_paquetes <= p.stock_minimo;

        return `
          <tr>
            <td><span style="font-family: monospace; font-weight: 700;">${p.codigo_barra}</span></td>
            <td><b style="color: #1e293b;">${p.nombre}</b></td>
            <td><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${p.categoria}</span></td>
            <td>${p.unidades_por_caja} un/caj</td>
            <td>
              <b style="font-size: 0.92rem; color: ${isLow ? '#ef4444' : '#0f172a'};">
                ${p.stock_paquetes} paq
              </b>
            </td>
            <td>
              <span style="font-weight: 600; color: #475569;">
                ${cajas} cajas + ${sueltos} paq
              </span>
            </td>
            <td>
              <span style="background: ${isLow ? '#fee2e2' : '#ecfdf5'}; color: ${isLow ? '#b91c1c' : '#065f46'}; padding: 2px 8px; border-radius: 9999px; font-weight: 800; font-size: 0.7rem;">
                ${isLow ? 'Stock Bajo' : 'Óptimo'}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Tabla de tickets emitidos hoy (control y anulación)
    renderTodayTickets(data.ventas_recientes);

  } catch (err) {
    console.error('Error cargando reporte de hoy:', err);
  }
}

// 3. Cargar Lista del Historial
async function loadHistorialList() {
  try {
    const res = await fetch('/api/reportes/historial');
    const dias = await res.json();

    const tbody = document.getElementById('historyTableBody');
    const summaryCard = document.getElementById('historySummaryCard');
    const detailBox = document.getElementById('historyDayDetailContainer');

    if (summaryCard) summaryCard.style.display = 'flex';
    if (detailBox) detailBox.style.display = 'none';

    if (!tbody) return;

    if (!dias || dias.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 20px; color: #94a3b8;">
            No hay cierres registrados en el historial aún.
          </td>
        </tr>
      `;
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    tbody.innerHTML = dias.map(d => {
      let tag = '';
      if (d.dia === todayStr) {
        tag = '<span style="background: #eff6ff; color: #2563eb; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 800; margin-left: 6px;">HOY</span>';
      } else if (d.dia === yesterdayStr) {
        tag = '<span style="background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 800; margin-left: 6px;">AYER</span>';
      }

      // Formatear fecha bonita
      const parts = d.dia.split('-');
      const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

      return `
        <tr>
          <td>
            <b style="color: #1e293b;">${formattedDate}</b>${tag}
          </td>
          <td><b>${d.total_tickets}</b></td>
          <td style="font-weight: 900; color: #059669; font-size: 0.88rem;">$${d.total_usd.toFixed(2)}</td>
          <td style="font-weight: 700; color: #0284c7;">Bs. ${d.total_bs.toFixed(2)}</td>
          <td>
            <span style="font-size: 0.73rem; color: #475569;">${d.metodos_desc || 'Sin detalle'}</span>
          </td>
          <td style="text-align: center;">
            <button type="button" class="history-pill-btn" style="background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8;" onclick="consultarFechaEspecifica('${d.dia}')">
              Ver Detalle
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error cargando historial:', err);
  }
}

// 4. Consultar Detalle de un Día Específico
async function consultarFechaEspecifica(diaStr) {
  if (!diaStr) return;
  currentHistoryDate = diaStr;

  try {
    const res = await fetch(`/api/reportes/dia?fecha=${diaStr}`);
    const data = await res.json();

    const summaryCard = document.getElementById('historySummaryCard');
    const detailBox = document.getElementById('historyDayDetailContainer');
    const titleEl = document.getElementById('historyDetailTitle');
    const subtitleEl = document.getElementById('historyDetailSubtitle');

    if (summaryCard) summaryCard.style.display = 'none';
    if (detailBox) detailBox.style.display = 'flex';

    const parts = diaStr.split('-');
    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

    if (titleEl) titleEl.innerText = `Cierre del Día: ${formattedDate}`;
    if (subtitleEl) subtitleEl.innerText = `Cuadre exacto: $${data.total_usd.toFixed(2)} USD | Bs. ${data.total_bs.toFixed(2)} (${data.total_tickets} tickets)`;

    // Arqueo Grid del día histórico
    const arqueoGrid = document.getElementById('historyArqueoGrid');
    if (arqueoGrid) {
      let arqueoHtml = `
        <div class="arqueo-card" style="border-left: 3.5px solid #10b981;">
          <span class="arqueo-title">Total Recaudado</span>
          <div class="arqueo-amount-usd" style="color: #059669;">$${data.total_usd.toFixed(2)}</div>
          <div class="arqueo-amount-bs">Equivalente: Bs. ${data.total_bs.toFixed(2)}</div>
          <span style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">Total de ${data.total_tickets} tickets activos ${data.total_anulados > 0 ? `(${data.total_anulados} anulados)` : ''}</span>
        </div>
      `;

      if (data.arqueo_caja && data.arqueo_caja.length > 0) {
        data.arqueo_caja.forEach(m => {
          const meta = methodMeta[m.metodo_pago] || { label: m.metodo_pago, color: '#1e293b', border: '#94a3b8' };
          arqueoHtml += `
            <div class="arqueo-card" style="border-left: 3.5px solid ${meta.border};">
              <span class="arqueo-title">${meta.label}</span>
              <div class="arqueo-amount-usd" style="color: ${meta.color};">$${m.total_usd.toFixed(2)}</div>
              <div class="arqueo-amount-bs">Bs. ${m.total_bs.toFixed(2)}</div>
              <span style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">${m.cantidad_transacciones} cobros</span>
            </div>
          `;
        });
      }
      arqueoGrid.innerHTML = arqueoHtml;
    }

    // Tabla de productos vendidos en este día
    const prodTbody = document.getElementById('historyProductsTableBody');
    if (prodTbody) {
      if (!data.desglose_productos || data.desglose_productos.length === 0) {
        prodTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 15px; color: #94a3b8;">No se registraron productos en este día.</td></tr>`;
      } else {
        prodTbody.innerHTML = data.desglose_productos.map(item => {
          const isCaja = item.tipo_venta === 'CAJA';
          return `
            <tr>
              <td><b style="color: #1e293b;">${item.nombre_producto}</b></td>
              <td>
                <span style="background: ${isCaja ? '#fef3c7' : '#dcfce7'}; color: ${isCaja ? '#92400e' : '#166534'}; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">
                  ${isCaja ? 'Por Caja' : 'Por Paquete'}
                </span>
              </td>
              <td><b>${item.total_vendido} ${isCaja ? 'cajas' : 'paq'}</b></td>
              <td style="color: #ef4444; font-weight: 700;">-${item.total_paquetes_descontados} paq</td>
              <td style="font-weight: 800; color: #059669;">$${item.total_generado.toFixed(2)}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Tabla de tickets de este día (el backend los envía en 'ventas_recientes')
    const ticketsTbody = document.getElementById('historyTicketsTableBody');
    if (ticketsTbody) {
      const tickets = data.ventas_recientes || [];
      if (tickets.length === 0) {
        ticketsTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 15px; color: #94a3b8;">Sin tickets registrados.</td></tr>`;
      } else {
        ticketsTbody.innerHTML = tickets.map(t => {
          const isAnulado = t.estado === 'ANULADO';
          const fechaMostrar = t.fecha_local || t.fecha;
          const hora = fechaMostrar ? fechaMostrar.slice(11, 16) : '--:--';
          const tachado = isAnulado ? 'text-decoration: line-through;' : '';
          return `
            <tr style="${isAnulado ? 'opacity: 0.6; background: #fff1f2;' : ''}">
              <td><b style="color: #2563eb; ${tachado}">#${t.codigo_ticket}</b></td>
              <td>${hora}</td>
              <td><span style="font-weight: 700; color: #334155;">${t.metodo_pago}</span></td>
              <td>$${(t.monto_recibido_usd || 0).toFixed(2)} / Bs. ${(t.monto_recibido_bs || 0).toFixed(2)}</td>
              <td style="font-weight: 800; color: ${isAnulado ? '#991b1b' : '#059669'}; ${tachado}">$${t.total_usd.toFixed(2)}</td>
              <td style="font-weight: 700; color: #0284c7; ${tachado}">Bs. ${t.total_bs.toFixed(2)}</td>
              <td>
                <span style="background: ${isAnulado ? '#fee2e2' : '#ecfdf5'}; color: ${isAnulado ? '#b91c1c' : '#065f46'}; padding: 2px 8px; border-radius: 9999px; font-weight: 800; font-size: 0.72rem;">
                  ${isAnulado ? 'Anulado' : 'Activo'}
                </span>
              </td>
              <td style="text-align: center;" class="no-print">
                ${isAnulado ? '<span style="color: #94a3b8; font-size: 0.72rem;">-</span>' : `
                  <button class="btn-clean-cart" style="color: #dc2626; border-color: #fca5a5; padding: 3px 8px; font-size: 0.72rem;" onclick="openAnularModal(${t.id}, '${t.codigo_ticket}', ${t.total_usd})">
                    Anular
                  </button>
                `}
              </td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch (err) {
    console.error('Error cargando detalle del día:', err);
  }
}

function cerrarDetalleDia() {
  currentHistoryDate = null;
  const summaryCard = document.getElementById('historySummaryCard');
  const detailBox = document.getElementById('historyDayDetailContainer');
  if (summaryCard) summaryCard.style.display = 'flex';
  if (detailBox) detailBox.style.display = 'none';
}

function selectQuickHistory(mode) {
  const d = new Date();
  if (mode === 'ayer') {
    d.setDate(d.getDate() - 1);
  } else if (mode === 'antier') {
    d.setDate(d.getDate() - 2);
  }
  const dateStr = d.toISOString().slice(0, 10);
  const picker = document.getElementById('historyDatePicker');
  if (picker) picker.value = dateStr;
  consultarFechaEspecifica(dateStr);
}

// 5. Imprimir Cierre
function imprimirCierre(context) {
  window.print();
}

// 6. Submenús del Sidebar
function toggleSubmenu(e) {
  if (e) e.preventDefault();
  const sub = document.getElementById('invSubmenu');
  const arrow = document.getElementById('invArrow');
  if (!sub) return;
  if (sub.style.display === 'none') {
    sub.style.display = 'flex';
    if (arrow) arrow.style.transform = 'rotate(90deg)';
  } else {
    sub.style.display = 'none';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
}

function toggleCierreSubmenu(e) {
  if (e) e.preventDefault();
  const sub = document.getElementById('cierreSubmenu');
  const arrow = document.getElementById('cierreArrow');
  if (!sub) return;
  if (sub.style.display === 'none') {
    sub.style.display = 'flex';
    if (arrow) arrow.style.transform = 'rotate(90deg)';
  } else {
    sub.style.display = 'none';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Verificar si la URL trae /reportes/historial
  if (window.location.pathname.includes('/historial')) {
    switchReportTab('historial');
  } else {
    switchReportTab('hoy');
  }
});


function renderTodayTickets(tickets) {
  const tbody = document.getElementById('todayTicketsTableBody');
  if (!tbody) return;

  if (!tickets || tickets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 25px; color: #94a3b8;">
          No se han emitido tickets en el día de hoy.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = tickets.map(t => {
    const isAnulado = t.estado === 'ANULADO';
    const fechaMostrar = t.fecha_local || t.fecha;
    const hora = fechaMostrar ? fechaMostrar.split(' ')[1] || fechaMostrar : '';

    return `
      <tr style="${isAnulado ? 'opacity: 0.6; background: #fff1f2;' : ''}">
        <td><b style="font-family: monospace; ${isAnulado ? 'text-decoration: line-through;' : ''}">#${t.codigo_ticket}</b></td>
        <td style="color: #64748b;">${hora}</td>
        <td><span style="font-weight: 600;">${t.metodo_pago}</span></td>
        <td><b style="color: ${isAnulado ? '#991b1b' : '#059669'}; ${isAnulado ? 'text-decoration: line-through;' : ''}">$${t.total_usd.toFixed(2)}</b></td>
        <td><span style="color: #0284c7; ${isAnulado ? 'text-decoration: line-through;' : ''}">Bs. ${t.total_bs.toFixed(2)}</span></td>
        <td>
          <span style="background: ${isAnulado ? '#fee2e2' : '#ecfdf5'}; color: ${isAnulado ? '#b91c1c' : '#065f46'}; padding: 2px 8px; border-radius: 9999px; font-weight: 800; font-size: 0.72rem;">
            ${isAnulado ? 'Anulado' : 'Activo'}
          </span>
        </td>
        <td style="text-align: center;" class="no-print">
          ${isAnulado ? '<span style="color: #94a3b8; font-size: 0.72rem;">-</span>' : `
            <button class="btn-clean-cart" style="color: #dc2626; border-color: #fca5a5; padding: 3px 8px; font-size: 0.72rem;" onclick="openAnularModal(${t.id}, '${t.codigo_ticket}', ${t.total_usd})">
              Anular
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}
