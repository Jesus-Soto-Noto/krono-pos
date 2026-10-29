// ===================================================
// KRONO POS PRO - INVENTARIO & PANEL DE PRECIOS ENGINE
// ===================================================

let inventoryProducts = [];
let selectedProdForStock = null;
let selectedProdForToggle = null;
let currentInvTab = (window.DEFAULT_INV_TAB === 'precios') ? 'precios' : 'stock';

// Element references
const inventoryTableBody = document.getElementById('inventoryTableBody');
const inventoryTableHead = document.getElementById('inventoryTableHead');
const tableCountBadge = document.getElementById('tableCountBadge');
const invSearchInput = document.getElementById('invSearchInput');
const invCatFilter = document.getElementById('invCatFilter');
const invStatusFilter = document.getElementById('invStatusFilter');

const statTotalProds = document.getElementById('statTotalProds');
const statTotalPaquetes = document.getElementById('statTotalPaquetes');
const statValorInventario = document.getElementById('statValorInventario');
const statStockBajo = document.getElementById('statStockBajo');

// 1. Alternar entre pestaña Stock y pestaña Precios
function switchInvTab(tabName) {
  currentInvTab = tabName;

  const btnStock = document.getElementById('tabBtnStock');
  const btnPrecios = document.getElementById('tabBtnPrecios');

  if (tabName === 'precios') {
    if (btnStock) btnStock.classList.remove('active');
    if (btnPrecios) btnPrecios.classList.add('active');
    if (invStatusFilter) invStatusFilter.style.display = 'inline-block';
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '/precios');
    }
  } else {
    if (btnStock) btnStock.classList.add('active');
    if (btnPrecios) btnPrecios.classList.remove('active');
    if (invStatusFilter) invStatusFilter.style.display = 'none';
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '/inventario');
    }
  }

  renderTableHead();
  renderTable();
}

// 2. Cargar Inventario desde el servidor (incluyendo inactivos para gestión)
async function loadInventory() {
  try {
    const res = await fetch('/api/productos?incluir_inactivos=1');
    inventoryProducts = await res.json();
    calculateStats();
    renderTableHead();
    renderTable();
  } catch (err) {
    showToast('Error cargando inventario y catálogo', 'error');
  }
}

// 3. Calcular KPIs
function calculateStats() {
  const activeProducts = inventoryProducts.filter(p => p.activo === 1);
  const totalItems = activeProducts.length;
  const totalPaquetes = activeProducts.reduce((acc, p) => acc + p.stock_paquetes, 0);
  const totalValor = activeProducts.reduce((acc, p) => acc + (p.stock_paquetes * p.precio_paquete), 0);
  const lowStock = activeProducts.filter(p => p.stock_paquetes <= p.stock_minimo).length;

  if (statTotalProds) statTotalProds.innerText = `${totalItems} activos (${inventoryProducts.length} total)`;
  if (statTotalPaquetes) statTotalPaquetes.innerText = `${totalPaquetes} paq`;
  if (statValorInventario) statValorInventario.innerText = `$${totalValor.toFixed(2)}`;
  if (statStockBajo) statStockBajo.innerText = lowStock;
}

// 4. Renderizar Encabezados según pestaña activa
function renderTableHead() {
  if (!inventoryTableHead) return;

  if (currentInvTab === 'precios') {
    inventoryTableHead.innerHTML = `
      <tr>
        <th style="width: 44px;">Foto</th>
        <th>Código</th>
        <th>Nombre del Producto</th>
        <th>Categoría</th>
        <th>X Caja</th>
        <th style="color: #15803d;">Precio Paq. ($)</th>
        <th style="color: #1d4ed8;">Precio Caja ($)</th>
        <th>Unitario en Caja</th>
        <th>Estado POS</th>
        <th style="text-align: right; min-width: 175px;">Acciones de Precios</th>
      </tr>
    `;
  } else {
    inventoryTableHead.innerHTML = `
      <tr>
        <th style="width: 44px;">Foto</th>
        <th>Código</th>
        <th>Nombre del Dulce</th>
        <th>Categoría</th>
        <th>X Caja</th>
        <th>Precio Paq.</th>
        <th>Precio Caja</th>
        <th>Stock Actual</th>
        <th>Equivalencia Fina</th>
        <th>Estado</th>
        <th style="text-align: right; min-width: 140px;">Acciones</th>
      </tr>
    `;
  }
}

// 5. Renderizar Tabla
function renderTable() {
  const query = invSearchInput ? invSearchInput.value.toLowerCase().trim() : '';
  const cat = invCatFilter ? invCatFilter.value : 'Todos';
  const statusVal = invStatusFilter ? invStatusFilter.value : 'Todos';

  const filtered = inventoryProducts.filter(p => {
    const matchesCat = (cat === 'Todos' || p.categoria === cat);
    const matchesQuery = (p.nombre.toLowerCase().includes(query) || p.codigo_barra.includes(query));

    let matchesStatus = true;
    if (currentInvTab === 'precios') {
      if (statusVal === '1') matchesStatus = (p.activo === 1);
      else if (statusVal === '0') matchesStatus = (p.activo === 0);
    } else {
      // En la pestaña Stock mostramos solo activos por defecto para no saturar caja
      matchesStatus = (p.activo === 1);
    }

    return matchesCat && matchesQuery && matchesStatus;
  });

  if (tableCountBadge) {
    const contextTxt = currentInvTab === 'precios' ? 'precios de productos' : 'existencias listadas';
    tableCountBadge.innerText = `${filtered.length} ${contextTxt}`;
  }

  if (filtered.length === 0) {
    inventoryTableBody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 40px; color: #94a3b8;">
          No se encontraron productos que coincidan con la búsqueda o filtro.
        </td>
      </tr>
    `;
    return;
  }

  if (currentInvTab === 'precios') {
    // VISTA DEL PANEL DE PRECIOS
    inventoryTableBody.innerHTML = filtered.map(p => {
      const isActivo = (p.activo === 1);
      const unitarioEnCaja = p.unidades_por_caja > 0 ? (p.precio_caja / p.unidades_por_caja) : p.precio_paquete;
      const ahorroUnitario = p.precio_paquete > 0 ? ((1 - (unitarioEnCaja / p.precio_paquete)) * 100) : 0;

      return `
        <tr style="${!isActivo ? 'background: #fff1f2; opacity: 0.7;' : ''}">
          <td>
            <img src="${p.imagen}" alt="${p.nombre}" class="prod-mini-img" onerror="this.src='/static/img/placeholder.svg'">
          </td>
          <td><span style="font-family: monospace; font-weight: 700; color: #334155;">${p.codigo_barra}</span></td>
          <td>
            <b style="color: #1e293b;">${p.nombre}</b>
            ${!isActivo ? '<span style="font-size: 0.68rem; background: #fee2e2; color: #991b1b; padding: 1px 5px; border-radius: 4px; font-weight: 800; margin-left: 4px;">DESACTIVADO</span>' : ''}
          </td>
          <td><span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${p.categoria}</span></td>
          <td><b>${p.unidades_por_caja} un/caj</b></td>
          <td><b style="color: #15803d; font-size: 0.92rem;">$${p.precio_paquete.toFixed(2)}</b></td>
          <td><b style="color: #1d4ed8; font-size: 0.92rem;">$${p.precio_caja.toFixed(2)}</b></td>
          <td>
            <span style="font-size: 0.78rem; font-weight: 700; color: #475569;">
              $${unitarioEnCaja.toFixed(2)} /paq
            </span>
            ${ahorroUnitario > 0 ? `
              <span style="font-size: 0.68rem; color: #16a34a; font-weight: 800; margin-left: 2px;" title="Ahorro al comprar por caja">(-${ahorroUnitario.toFixed(0)}%)</span>
            ` : ''}
          </td>
          <td>
            <span style="background: ${isActivo ? '#ecfdf5' : '#fee2e2'}; color: ${isActivo ? '#065f46' : '#b91c1c'}; padding: 2px 8px; border-radius: 9999px; font-weight: 800; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;">
              ${isActivo ? '● Activo' : '✕ Desactivado'}
            </span>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn-add-stock" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; margin-right: 4px;" onclick="openEditPriceModal(${p.id})">
              <svg class="flaticon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span>Editar Precios</span>
            </button>
            <button class="btn-add-stock" style="background: ${isActivo ? '#fef2f2' : '#f0fdf4'}; color: ${isActivo ? '#b91c1c' : '#15803d'}; border-color: ${isActivo ? '#fecaca' : '#bbf7d0'};" onclick="openToggleStatusModal(${p.id})">
              <span>${isActivo ? 'Desactivar' : 'Activar'}</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } else {
    // VISTA DE CONTROL DE STOCK
    inventoryTableBody.innerHTML = filtered.map(p => {
      const cajasEquiv = Math.floor(p.stock_paquetes / p.unidades_por_caja);
      const paqSueltos = p.stock_paquetes % p.unidades_por_caja;
      const isLow = p.stock_paquetes <= p.stock_minimo;

      return `
        <tr>
          <td>
            <img src="${p.imagen}" alt="${p.nombre}" class="prod-mini-img" onerror="this.src='/static/img/placeholder.svg'">
          </td>
          <td><span style="font-family: monospace; font-weight: 700; color: #334155;">${p.codigo_barra}</span></td>
          <td><b style="color: #1e293b;">${p.nombre}</b></td>
          <td><span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${p.categoria}</span></td>
          <td>${p.unidades_por_caja} un/caj</td>
          <td><b style="color: #15803d;">$${p.precio_paquete.toFixed(2)}</b></td>
          <td><b style="color: #1d4ed8;">$${p.precio_caja.toFixed(2)}</b></td>
          <td>
            <b style="font-size: 0.95rem; color: ${isLow ? '#ef4444' : '#0f172a'};">
              ${p.stock_paquetes} paq
            </b>
          </td>
          <td>
            <span style="font-weight: 600; color: #475569;">
              ${cajasEquiv} cajas + ${paqSueltos} paq
            </span>
          </td>
          <td>
            <span style="background: ${isLow ? '#fee2e2' : '#ecfdf5'}; color: ${isLow ? '#b91c1c' : '#065f46'}; padding: 2px 8px; border-radius: 9999px; font-weight: 800; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;">
              ${isLow ? '<svg class="flaticon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Stock Bajo' : '<svg class="flaticon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Óptimo'}
            </span>
          </td>
          <td style="text-align: right;">
            <button class="btn-add-stock" onclick="openAddStockModal(${p.id})">
              <svg class="flaticon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Recibir Mercancía</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

function filterTable() {
  renderTable();
}

// ===================================================
// 6. MODAL PARA MODIFICAR PRECIOS Y PRODUCTO
// ===================================================

function calcEditPricePreview() {
  const perBox = parseInt(document.getElementById('editUnidadesPorCaja').value) || 1;
  const precioPaq = parseFloat(document.getElementById('editPrecioPaquete').value) || 0;
  const precioCaj = parseFloat(document.getElementById('editPrecioCaja').value) || 0;
  const previewEl = document.getElementById('editPricePreview');

  if (!previewEl) return;

  const unitarioCaja = perBox > 0 ? (precioCaj / perBox) : precioPaq;
  const ahorro = precioPaq > 0 ? ((1 - (unitarioCaja / precioPaq)) * 100) : 0;

  if (ahorro > 0) {
    previewEl.innerHTML = `Venta por caja: <b>$${unitarioCaja.toFixed(2)} /paquete</b> • El cliente ahorra <b>${ahorro.toFixed(1)}%</b> respecto al paquete individual ($${precioPaq.toFixed(2)})`;
    previewEl.style.background = '#eff6ff';
    previewEl.style.color = '#1e40af';
  } else if (ahorro < 0) {
    previewEl.innerHTML = `⚠️ Aviso: El paquete por caja ($${unitarioCaja.toFixed(2)}) sale más costoso que el paquete individual ($${precioPaq.toFixed(2)}).`;
    previewEl.style.background = '#fffbeb';
    previewEl.style.color = '#b45309';
  } else {
    previewEl.innerHTML = `Precio individual y precio por caja son equivalentes ($${precioPaq.toFixed(2)} por paquete).`;
    previewEl.style.background = '#f1f5f9';
    previewEl.style.color = '#334155';
  }
}

function openEditPriceModal(prodId) {
  const prod = inventoryProducts.find(p => p.id === prodId);
  if (!prod) return;

  document.getElementById('editProdId').value = prod.id;
  document.getElementById('editNombre').value = prod.nombre;
  document.getElementById('editCodigo').value = prod.codigo_barra;
  document.getElementById('editCategoria').value = prod.categoria || 'General';
  document.getElementById('editUnidadesPorCaja').value = prod.unidades_por_caja;
  document.getElementById('editPrecioPaquete').value = prod.precio_paquete.toFixed(2);
  document.getElementById('editPrecioCaja').value = prod.precio_caja.toFixed(2);
  document.getElementById('editStockMinimo').value = prod.stock_minimo;
  document.getElementById('editActivo').value = String(prod.activo);

  const pwd = document.getElementById('editPassword');
  if (pwd) pwd.value = '';

  calcEditPricePreview();

  document.getElementById('editPriceModal').classList.add('open');
  setTimeout(() => {
    if (pwd) pwd.focus();
  }, 150);
}

function closeEditPriceModal() {
  document.getElementById('editPriceModal').classList.remove('open');
}

async function submitEditPrice() {
  const prodId = document.getElementById('editProdId').value;
  const nombre = document.getElementById('editNombre').value.trim();
  const codigo_barra = document.getElementById('editCodigo').value.trim();
  const categoria = document.getElementById('editCategoria').value;
  const unidades_por_caja = parseInt(document.getElementById('editUnidadesPorCaja').value) || 1;
  const precio_paquete = parseFloat(document.getElementById('editPrecioPaquete').value) || 0;
  const precio_caja = parseFloat(document.getElementById('editPrecioCaja').value) || 0;
  const stock_minimo = parseInt(document.getElementById('editStockMinimo').value) || 10;
  const activo = parseInt(document.getElementById('editActivo').value);

  const pwdInput = document.getElementById('editPassword');
  const password = pwdInput ? pwdInput.value.trim() : '';

  if (!nombre || !codigo_barra) {
    showToast('Nombre y código de barra son requeridos', 'error');
    return;
  }

  if (!password) {
    showToast('Ingresa la clave de autorización (Supervisor / Admin)', 'error');
    if (pwdInput) pwdInput.focus();
    return;
  }

  try {
    const res = await fetch(`/api/productos/${prodId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre,
        codigo_barra,
        categoria,
        unidades_por_caja,
        precio_paquete,
        precio_caja,
        stock_minimo,
        activo,
        password
      })
    });

    const result = await res.json();

    if (!res.ok) {
      showToast(result.error || 'Error al actualizar precios', 'error');
      if (pwdInput) {
        pwdInput.value = '';
        pwdInput.focus();
      }
      return;
    }

    showToast(result.mensaje || 'Precios actualizados con éxito', 'success');
    closeEditPriceModal();
    await loadInventory();

  } catch (err) {
    showToast('Error de red al actualizar precios', 'error');
  }
}

// ===================================================
// 7. MODAL PARA ACTIVAR / DESACTIVAR PRODUCTO
// ===================================================

function openToggleStatusModal(prodId) {
  const prod = inventoryProducts.find(p => p.id === prodId);
  if (!prod) return;

  selectedProdForToggle = prod;
  const modal = document.getElementById('toggleStatusModal');
  const msgEl = document.getElementById('toggleStatusMsg');
  const titleEl = document.getElementById('toggleStatusModalTitle');
  const iconEl = document.getElementById('toggleStatusIcon');
  const btnEl = document.getElementById('btnConfirmToggleStatus');
  const pwdInput = document.getElementById('toggleStatusPassword');

  if (pwdInput) pwdInput.value = '';

  const willDeactivate = (prod.activo === 1);

  if (willDeactivate) {
    if (titleEl) titleEl.innerText = 'Desactivar Producto';
    if (iconEl) {
      iconEl.style.color = '#dc2626';
      iconEl.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
    }
    if (msgEl) {
      msgEl.innerHTML = `¿Estás seguro de que deseas <b>desactivar</b> a <span style="color: #b91c1c; font-weight: 800;">"${prod.nombre}"</span>?<br><small style="color: #64748b; margin-top: 4px; display: block;">No aparecerá en el Punto de Venta ni en el escáner hasta que vuelva a ser activado.</small>`;
    }
    if (btnEl) {
      btnEl.style.background = '#dc2626';
      btnEl.innerText = 'Confirmar Desactivación';
    }
  } else {
    if (titleEl) titleEl.innerText = 'Reactivar Producto';
    if (iconEl) {
      iconEl.style.color = '#16a34a';
      iconEl.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
    }
    if (msgEl) {
      msgEl.innerHTML = `¿Deseas <b>reactivar</b> a <span style="color: #15803d; font-weight: 800;">"${prod.nombre}"</span>?<br><small style="color: #64748b; margin-top: 4px; display: block;">Volverá a estar habilitado para la venta en el Punto de Cobro.</small>`;
    }
    if (btnEl) {
      btnEl.style.background = '#16a34a';
      btnEl.innerText = 'Confirmar Activación';
    }
  }

  modal.classList.add('open');
  setTimeout(() => {
    if (pwdInput) pwdInput.focus();
  }, 150);
}

function closeToggleStatusModal() {
  document.getElementById('toggleStatusModal').classList.remove('open');
  selectedProdForToggle = null;
}

async function submitToggleStatus() {
  if (!selectedProdForToggle) return;

  const pwdInput = document.getElementById('toggleStatusPassword');
  const password = pwdInput ? pwdInput.value.trim() : '';

  if (!password) {
    showToast('Ingresa la contraseña de autorización', 'error');
    if (pwdInput) pwdInput.focus();
    return;
  }

  try {
    const res = await fetch(`/api/productos/${selectedProdForToggle.id}/toggle-activo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const result = await res.json();

    if (!res.ok) {
      showToast(result.error || 'Contraseña incorrecta', 'error');
      if (pwdInput) {
        pwdInput.value = '';
        pwdInput.focus();
      }
      return;
    }

    showToast(result.mensaje, 'success');
    closeToggleStatusModal();
    await loadInventory();

  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// ===================================================
// 8. MODAL PARA RECIBIR MERCANCÍA (SUMAR AL STOCK)
// ===================================================

function calcAddStockPreview() {
  if (!selectedProdForStock) return;
  const cajas = parseInt(document.getElementById('addStockCajas').value) || 0;
  const paquetes = parseInt(document.getElementById('addStockPaquetes').value) || 0;
  const total = (cajas * selectedProdForStock.unidades_por_caja) + paquetes;
  const el = document.getElementById('addStockTotalPreview');
  if (el) {
    el.innerText = `Total que ingresará: ${total} paquetes (${cajas} cajas de ${selectedProdForStock.unidades_por_caja} un. + ${paquetes} paq sueltos)`;
  }
}

function openAddStockModal(prodId) {
  const prod = inventoryProducts.find(p => p.id === prodId);
  if (!prod) return;
  selectedProdForStock = prod;

  document.getElementById('addStockProdName').innerText = prod.nombre;
  document.getElementById('addStockDetails').innerText = `Código: ${prod.codigo_barra} | Caja trae ${prod.unidades_por_caja} paquetes`;
  document.getElementById('addStockCajas').value = 1;
  document.getElementById('addStockPaquetes').value = 0;
  const pwdInput = document.getElementById('addStockPassword');
  if (pwdInput) pwdInput.value = '';

  calcAddStockPreview();
  document.getElementById('addStockModal').classList.add('open');
  setTimeout(() => {
    if (pwdInput) pwdInput.focus();
  }, 150);
}

function closeAddStockModal() {
  document.getElementById('addStockModal').classList.remove('open');
  selectedProdForStock = null;
}

async function submitAddStock() {
  if (!selectedProdForStock) return;

  const cajas = parseInt(document.getElementById('addStockCajas').value) || 0;
  const paquetes = parseInt(document.getElementById('addStockPaquetes').value) || 0;
  const pwdInput = document.getElementById('addStockPassword');
  const password = pwdInput ? pwdInput.value.trim() : '';

  if (cajas <= 0 && paquetes <= 0) {
    showToast('Ingresa al menos 1 caja o paquete', 'error');
    return;
  }

  if (!password) {
    showToast('Ingresa la contraseña de autorización', 'error');
    if (pwdInput) pwdInput.focus();
    return;
  }

  try {
    const res = await fetch(`/api/productos/${selectedProdForStock.id}/sumar-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cajas, paquetes, password })
    });
    const result = await res.json();

    if (!res.ok) {
      showToast(result.error || 'Contraseña incorrecta', 'error');
      if (pwdInput) {
        pwdInput.value = '';
        pwdInput.focus();
      }
      return;
    }

    showToast(`Se agregaron ${result.unidades_agregadas} paquetes a ${selectedProdForStock.nombre}!`, 'success');
    closeAddStockModal();
    await loadInventory();

  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// ===================================================
// 9. TOAST NOTIFICACIONES
// ===================================================

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

document.addEventListener('DOMContentLoaded', () => {
  if (window.DEFAULT_INV_TAB === 'precios') {
    switchInvTab('precios');
  }
  loadInventory();
});
