let appConfig = null;
// ===================================================
// KRONO POS PRO - POS ENGINE (FINAPARTNER UX)
// ===================================================

let allProducts = [];
let cart = []; // { product, tipo_venta: 'PAQUETE'|'CAJA', cantidad: 1 }
let activeCategory = 'Todos';
let tasaBcv = 49.50;
let currentTotalUsd = 0.0;
let currentTotalBs = 0.0;
let selectedPaymentMethod = 'Efectivo $';

// Element references
const productsGrid = document.getElementById('productsGrid');
const cartItemsContainer = document.getElementById('cartItems');
const totalUsdEl = document.getElementById('totalUsd');
const totalBsEl = document.getElementById('totalBs');
const cartCountBadge = document.getElementById('cartCountBadge');
const searchInput = document.getElementById('searchInput');
const bcvRateDisplay = document.getElementById('bcvRateDisplay');

// Web Audio API for scanner beep feedback
let audioCtx = null;
function playBeep(type = 'success') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === 'success') {
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } else {
      osc.frequency.setValueAtTime(260, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    }
  } catch (e) {}
}

// 1. Cargar Configuración Inicial y Sincronizar BCV Automáticamente
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    appConfig = data;
    if (data.tasa_bcv) {
      tasaBcv = parseFloat(data.tasa_bcv);
      if (bcvRateDisplay) bcvRateDisplay.innerText = tasaBcv.toFixed(2);
    }
    syncBcvRate(true);
  } catch (err) {
    console.error('Error cargando configuración:', err);
  }
}

// Sincronizar con la API oficial del BCV
async function syncBcvRate(silent = false) {
  const syncIcon = document.getElementById('bcvSyncIcon');
  if (syncIcon) syncIcon.style.animation = 'spin 0.8s linear infinite';

  try {
    const res = await fetch('/api/config/sincronizar-bcv', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      tasaBcv = parseFloat(data.tasa_bcv);
      if (bcvRateDisplay) bcvRateDisplay.innerText = tasaBcv.toFixed(2);
      renderCart();
      if (!silent) {
        showToast(`BCV oficial actualizado: Bs. ${tasaBcv.toFixed(2)}`, 'success');
      }
    } else {
      if (!silent) {
        showToast(data.mensaje || 'No se pudo conectar a la API del BCV', 'error');
      }
    }
  } catch (err) {
    if (!silent) showToast('Error de conexión con la API del BCV', 'error');
  } finally {
    if (syncIcon) {
      setTimeout(() => syncIcon.style.animation = '', 400);
    }
  }
}

// 2. Cargar Catálogo de Productos
async function loadProducts() {
  try {
    const res = await fetch('/api/productos');
    allProducts = await res.json();
    renderProducts();
  } catch (err) {
    showToast('Error al cargar productos', 'error');
  }
}

// 3. Renderizar Tarjetas de Productos (Alta Densidad, Compacto)
function renderProducts() {
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  const filtered = allProducts.filter(p => {
    const matchesCat = activeCategory === 'Todos' || p.categoria === activeCategory;
    const matchesSearch = p.nombre.toLowerCase().includes(query) || p.codigo_barra.includes(query);
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    productsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 10px; color: #94a3b8;">
        <div style="margin-bottom: 8px; display: flex; justify-content: center;"><svg class="flaticon-lg" style="width: 36px; height: 36px; color: #94a3b8;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        <p style="font-size: 0.92rem; font-weight: 700;">No se encontraron productos</p>
        <p style="font-size: 0.78rem;">Verifica el nombre o pasa el escáner.</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = filtered.map(p => {
    const cajasEquiv = Math.floor(p.stock_paquetes / p.unidades_por_caja);
    const paqSueltos = p.stock_paquetes % p.unidades_por_caja;
    const isLow = p.stock_paquetes <= p.stock_minimo;
    
    let stockLabel = `${p.stock_paquetes} paq`;
    if (p.unidades_por_caja > 1) {
      stockLabel = `${cajasEquiv} caj + ${paqSueltos} paq`;
    }

    return `
      <div class="prod-card-compact" onclick="addToCartByProduct(${p.id})">
        <div class="card-thumb-wrap">
          <img src="${p.imagen}" alt="${p.nombre}" class="card-thumb-img" onerror="this.src='/static/img/placeholder.svg'">
          <span class="compact-stock-badge ${isLow ? 'low' : 'ok'}">
            ${isLow ? '<svg class="flaticon-sm" style="margin-right: 3px; vertical-align: -2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' : ''}${stockLabel}
          </span>
        </div>
        <div class="card-details-compact">
          <div class="card-name-compact" title="${p.nombre}">${p.nombre}</div>
          <div class="card-prices-compact">
            <div class="chip-paq-compact">
              <span>Paq</span>
              <span>$${p.precio_paquete.toFixed(2)}</span>
            </div>
            <div class="chip-caj-compact">
              <span>Caj (x${p.unidades_por_caja})</span>
              <span>$${p.precio_caja.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 4. Agregar al carrito
function addToCartByProduct(productId, preferredMode = 'PAQUETE') {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  const existingIndex = cart.findIndex(item => item.product.id === productId && item.tipo_venta === preferredMode);

  let currentInCartUnits = 0;
  cart.forEach(item => {
    if (item.product.id === productId) {
      currentInCartUnits += (item.tipo_venta === 'CAJA' ? item.cantidad * item.product.unidades_por_caja : item.cantidad);
    }
  });

  const neededUnits = (preferredMode === 'CAJA') ? product.unidades_por_caja : 1;
  if (currentInCartUnits + neededUnits > product.stock_paquetes) {
    playBeep('error');
    showToast(`Stock insuficiente de "${product.nombre}" (${product.stock_paquetes} paq disponibles)`, 'error');
    return;
  }

  if (existingIndex > -1) {
    cart[existingIndex].cantidad += 1;
  } else {
    cart.push({
      product: product,
      tipo_venta: preferredMode,
      cantidad: 1
    });
  }

  playBeep('success');
  renderCart();
}

// 5. Alternar Modo de Venta (PAQUETE <-> CAJA)
function toggleItemMode(index) {
  const item = cart[index];
  const newMode = (item.tipo_venta === 'PAQUETE') ? 'CAJA' : 'PAQUETE';
  
  const unitsPerItem = (newMode === 'CAJA') ? item.product.unidades_por_caja : 1;
  const otherItemsUnits = cart.reduce((sum, it, idx) => {
    if (idx !== index && it.product.id === item.product.id) {
      return sum + (it.tipo_venta === 'CAJA' ? it.cantidad * it.product.unidades_por_caja : it.cantidad);
    }
    return sum;
  }, 0);

  if (otherItemsUnits + (item.cantidad * unitsPerItem) > item.product.stock_paquetes) {
    playBeep('error');
    showToast(`Stock insuficiente para vender en CAJA (${item.product.unidades_por_caja} paq/caja)`, 'error');
    return;
  }

  item.tipo_venta = newMode;
  renderCart();
}

// 6. Cambiar Cantidad
function changeItemQty(index, delta) {
  const item = cart[index];
  const newQty = item.cantidad + delta;
  
  if (newQty <= 0) {
    removeItem(index);
    return;
  }

  const unitSize = (item.tipo_venta === 'CAJA') ? item.product.unidades_por_caja : 1;
  const otherUnits = cart.reduce((sum, it, idx) => {
    if (idx !== index && it.product.id === item.product.id) {
      return sum + (it.tipo_venta === 'CAJA' ? it.cantidad * it.product.unidades_por_caja : it.cantidad);
    }
    return sum;
  }, 0);

  if (otherUnits + (newQty * unitSize) > item.product.stock_paquetes) {
    playBeep('error');
    showToast(`Stock insuficiente. Solo quedan ${item.product.stock_paquetes} paq en total.`, 'error');
    return;
  }

  item.cantidad = newQty;
  renderCart();
}

function removeItem(index) {
  cart.splice(index, 1);
  renderCart();
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  renderCart();
  showToast('Orden limpiada', 'success');
}

// 7. Renderizar Carrito y Totales
function renderCart() {
  const totalItems = cart.reduce((acc, it) => acc + it.cantidad, 0);
  if (cartCountBadge) cartCountBadge.innerText = totalItems;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div style="margin: auto; text-align: center; color: #94a3b8; padding: 30px 10px;">
        <div style="margin-bottom: 8px; display: flex; justify-content: center;"><svg class="flaticon-lg" style="width: 44px; height: 44px; color: #cbd5e1;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
        <p style="font-weight: 700; font-size: 0.9rem; color: #475569;">Orden vacía</p>
        <p style="font-size: 0.75rem; margin-top: 2px;">Escanea o haz clic en un dulce.</p>
      </div>
    `;
    currentTotalUsd = 0.0;
    currentTotalBs = 0.0;
    totalUsdEl.innerText = '$0.00';
    totalBsEl.innerText = 'Bs. 0.00';
    return;
  }

  let totalUsd = 0;

  cartItemsContainer.innerHTML = cart.map((item, idx) => {
    const isCaja = item.tipo_venta === 'CAJA';
    const unitPrice = isCaja ? item.product.precio_caja : item.product.precio_paquete;
    const subtotal = unitPrice * item.cantidad;
    totalUsd += subtotal;

    return `
      <div class="compact-cart-row">
        <div class="cart-row-title-bar">
          <span class="cart-row-title" title="${item.product.nombre}">${item.product.nombre}</span>
          <button class="btn-remove-compact" onclick="removeItem(${idx})" title="Quitar">✕</button>
        </div>

        <div class="toggle-pill-wrap">
          <button class="btn-toggle-mode ${!isCaja ? 'active-paq' : ''}" onclick="toggleItemMode(${idx})">
            Paquete
          </button>
          <button class="btn-toggle-mode ${isCaja ? 'active-caj' : ''}" onclick="toggleItemMode(${idx})">
            Caja (x${item.product.unidades_por_caja})
          </button>
        </div>

        <div class="cart-row-controls">
          <div class="compact-qty-stepper">
            <button class="btn-step" onclick="changeItemQty(${idx}, -1)">−</button>
            <span class="step-num">${item.cantidad}</span>
            <button class="btn-step" onclick="changeItemQty(${idx}, 1)">+</button>
          </div>
          <div class="cart-row-subtotal">
            <div class="subtotal-usd">$${subtotal.toFixed(2)}</div>
            <div class="subtotal-bs">Bs. ${(subtotal * tasaBcv).toFixed(2)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  currentTotalUsd = totalUsd;
  currentTotalBs = totalUsd * tasaBcv;
  totalUsdEl.innerText = `$${totalUsd.toFixed(2)}`;
  totalBsEl.innerText = `Bs. ${(totalUsd * tasaBcv).toFixed(2)}`;
}

// 8. ESCÁNER DE CÓDIGO DE BARRAS
let barcodeBuffer = "";
let lastKeyTime = Date.now();

window.addEventListener('keydown', (e) => {
  if (document.activeElement === searchInput) return;
  const inputTendered = document.getElementById('inputTendered');
  if (document.activeElement === inputTendered) return;

  const now = Date.now();
  if (now - lastKeyTime > 150) {
    barcodeBuffer = "";
  }
  lastKeyTime = now;

  if (e.key === 'Enter') {
    if (barcodeBuffer.trim().length >= 3) {
      handleScannedBarcode(barcodeBuffer.trim());
      barcodeBuffer = "";
    }
  } else if (e.key.length === 1) {
    barcodeBuffer += e.key;
  }
});

function handleScannedBarcode(barcode) {
  const product = allProducts.find(p => p.codigo_barra.toLowerCase() === barcode.toLowerCase());
  if (product) {
    addToCartByProduct(product.id, 'PAQUETE');
    showToast(`Escaneado: ${product.nombre}`, 'success');
  } else {
    playBeep('error');
    showToast(`Código no encontrado: ${barcode}`, 'error');
  }
}

// 9. Filtrado por Categorías
function setCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.cat-pill-compact').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProducts();
}

// ===================================================
// 10. MODAL DE COBRO DINÁMICO ESTILO FINAPARTNER
// Filas dinámicas de método de pago (+ Agregar método de pago) con cálculo en vivo

let paymentRows = [];
let nextPaymentRowId = 1;

// Métodos de pago disponibles con su moneda y símbolo
const PAYMENT_METHODS = [
  { name: 'Dólares (Efectivo)', currency: 'USD', symbol: '$' },
  { name: 'Pago Móvil', currency: 'BS', symbol: 'BS' },
  { name: 'Punto de Venta', currency: 'BS', symbol: 'BS' },
  { name: 'Bolívares (Efectivo)', currency: 'BS', symbol: 'BS' }
];

function getMethodDef(name) {
  return PAYMENT_METHODS.find(m => m.name === name) || PAYMENT_METHODS[0];
}

function openFinaPayModal() {
  if (cart.length === 0) {
    showToast('Agrega productos antes de cobrar', 'error');
    return;
  }

  document.getElementById('modalPayUsd').innerText = `$${currentTotalUsd.toFixed(2)} USD`;
  document.getElementById('modalPayBs').innerText = `Equivalente: Bs. ${currentTotalBs.toFixed(2)}`;
  
  const rateBadge = document.getElementById('modalRateBcv');
  if (rateBadge) rateBadge.innerText = tasaBcv.toFixed(2);

  // Inicializar con 1 fila por defecto (Dólares con el monto total)
  nextPaymentRowId = 1;
  paymentRows = [
    {
      id: nextPaymentRowId++,
      method: 'Dólares (Efectivo)',
      amount: currentTotalUsd.toFixed(2)
    }
  ];

  renderPaymentRows();
  calculatePaymentTotals();

  document.getElementById('finaPayModal').classList.add('open');
}

function closeFinaPayModal() {
  document.getElementById('finaPayModal').classList.remove('open');
}

function renderPaymentRows() {
  const container = document.getElementById('paymentMethodsList');
  if (!container) return;

  const canDelete = paymentRows.length > 1;

  container.innerHTML = paymentRows.map(row => {
    const mDef = getMethodDef(row.method);
    const optionsHtml = PAYMENT_METHODS.map(m => `
      <option value="${m.name}" ${m.name === row.method ? 'selected' : ''}>${m.name}</option>
    `).join('');

    return `
      <div class="fina-method-card" data-id="${row.id}">
        ${canDelete ? `
          <button type="button" class="btn-remove-fina-row" onclick="removePaymentMethodRow(${row.id})" title="Eliminar método de pago">✕</button>
        ` : ''}
        <div class="fina-card-grid">
          <div class="fina-col">
            <label class="fina-label">Método de pago</label>
            <select class="form-control fina-select" onchange="onPaymentRowMethodChange(${row.id}, this.value)">
              ${optionsHtml}
            </select>
          </div>
          <div class="fina-col">
            <label class="fina-label">Monto a pagar</label>
            <div class="fina-input-suffix-wrapper">
              <input 
                type="number" 
                step="0.01" 
                class="form-control fina-input-amount" 
                id="finaAmount_${row.id}" 
                value="${row.amount}" 
                placeholder="0.00"
                oninput="onPaymentRowAmountInput(${row.id}, this.value)"
              >
              <span class="fina-currency-suffix">${mDef.symbol}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addPaymentMethodRow() {
  // Calcular cuánto falta por cubrir en USD
  let coveredUsd = 0;
  paymentRows.forEach(r => {
    const m = getMethodDef(r.method);
    const amt = parseFloat(r.amount) || 0;
    coveredUsd += (m.currency === 'USD') ? amt : (amt / tasaBcv);
  });

  const remainingUsd = Math.max(0, currentTotalUsd - coveredUsd);

  // Elegir método por defecto diferente al primero
  let defaultMethod = 'Pago Móvil';
  if (paymentRows.length > 0 && getMethodDef(paymentRows[0].method).currency === 'BS') {
    defaultMethod = 'Dólares (Efectivo)';
  } else if (paymentRows.some(r => r.method === 'Pago Móvil')) {
    defaultMethod = 'Punto de Venta';
  }

  const mDef = getMethodDef(defaultMethod);
  let initialAmount = (mDef.currency === 'USD') 
    ? remainingUsd.toFixed(2) 
    : (remainingUsd * tasaBcv).toFixed(2);

  paymentRows.push({
    id: nextPaymentRowId++,
    method: defaultMethod,
    amount: initialAmount
  });

  renderPaymentRows();
  calculatePaymentTotals();

  // Enfocar el input de la nueva fila
  const lastRow = paymentRows[paymentRows.length - 1];
  const inputEl = document.getElementById(`finaAmount_${lastRow.id}`);
  if (inputEl) {
    inputEl.focus();
    inputEl.select();
  }
}

function removePaymentMethodRow(id) {
  if (paymentRows.length <= 1) return;
  paymentRows = paymentRows.filter(r => r.id !== id);
  renderPaymentRows();
  calculatePaymentTotals();
}

function onPaymentRowMethodChange(id, newMethod) {
  const row = paymentRows.find(r => r.id === id);
  if (!row) return;

  const oldMethod = row.method;
  const oldDef = getMethodDef(oldMethod);
  const newDef = getMethodDef(newMethod);
  row.method = newMethod;

  // Convertir monto entre monedas si cambió tipo de divisa
  const currentVal = parseFloat(row.amount) || 0;
  if (oldDef.currency === 'USD' && newDef.currency === 'BS') {
    row.amount = (currentVal * tasaBcv).toFixed(2);
  } else if (oldDef.currency === 'BS' && newDef.currency === 'USD') {
    row.amount = (currentVal / tasaBcv).toFixed(2);
  }

  renderPaymentRows();
  calculatePaymentTotals();
}

function onPaymentRowAmountInput(id, val) {
  const row = paymentRows.find(r => r.id === id);
  if (!row) return;
  row.amount = val;

  // Si hay exactamente 2 filas y se modifica la primera, auto-completar la segunda
  if (paymentRows.length === 2 && paymentRows[0].id === id) {
    const row1 = paymentRows[0];
    const row2 = paymentRows[1];
    const m1 = getMethodDef(row1.method);
    const m2 = getMethodDef(row2.method);

    const val1 = parseFloat(val) || 0;
    const coveredUsd1 = (m1.currency === 'USD') ? val1 : (val1 / tasaBcv);
    const diffUsd = currentTotalUsd - coveredUsd1;

    if (diffUsd >= 0) {
      row2.amount = (m2.currency === 'USD') 
        ? diffUsd.toFixed(2) 
        : (diffUsd * tasaBcv).toFixed(2);
      
      const input2 = document.getElementById(`finaAmount_${row2.id}`);
      if (input2) input2.value = row2.amount;
    }
  }

  calculatePaymentTotals();
}

function setQuickTender(amount) {
  let usdRow = paymentRows.find(r => getMethodDef(r.method).currency === 'USD');
  if (!usdRow && paymentRows.length > 0) {
    usdRow = paymentRows[0];
  }

  if (!usdRow) return;

  const mDef = getMethodDef(usdRow.method);
  if (amount === 'exact') {
    usdRow.amount = (mDef.currency === 'USD') 
      ? currentTotalUsd.toFixed(2) 
      : currentTotalBs.toFixed(2);
  } else {
    usdRow.amount = (mDef.currency === 'USD') 
      ? parseFloat(amount).toFixed(2) 
      : (parseFloat(amount) * tasaBcv).toFixed(2);
  }

  const input = document.getElementById(`finaAmount_${usdRow.id}`);
  if (input) input.value = usdRow.amount;

  onPaymentRowAmountInput(usdRow.id, usdRow.amount);
}

function calculatePaymentTotals() {
  let totalRecibidoUsd = 0;
  let totalUsdRecibido = 0;
  let totalBsRecibido = 0;

  paymentRows.forEach(r => {
    const m = getMethodDef(r.method);
    const amt = parseFloat(r.amount) || 0;
    if (m.currency === 'USD') {
      totalRecibidoUsd += amt;
      totalUsdRecibido += amt;
    } else {
      totalRecibidoUsd += (amt / tasaBcv);
      totalBsRecibido += amt;
    }
  });

  const banner = document.getElementById('vueltoBanner');
  const label = document.getElementById('vueltoLabelText');
  const breakdown = document.getElementById('vueltoBreakdownText');
  const usdText = document.getElementById('vueltoUsdText');
  const bsText = document.getElementById('vueltoBsText');

  if (!banner || !label || !breakdown || !usdText || !bsText) return;

  const diffUsd = totalRecibidoUsd - currentTotalUsd;

  if (diffUsd < -0.01) {
    // Monto insuficiente
    const missingUsd = Math.abs(diffUsd);
    const missingBs = missingUsd * tasaBcv;

    banner.classList.add('debt');
    label.innerText = 'Monto incompleto (Faltan):';
    breakdown.innerText = `Ingresado: $${totalUsdRecibido.toFixed(2)} USD + Bs. ${totalBsRecibido.toFixed(2)}`;
    usdText.innerText = `$${missingUsd.toFixed(2)}`;
    bsText.innerText = `Bs. ${missingBs.toFixed(2)}`;
  } else if (diffUsd > 0.01) {
    // Sobra dinero -> vuelto
    const overUsd = diffUsd;
    const overBs = overUsd * tasaBcv;

    banner.classList.remove('debt');
    label.innerText = 'Vuelto a entregar al cliente:';
    breakdown.innerText = `Cubierto con: $${totalUsdRecibido.toFixed(2)} USD + Bs. ${totalBsRecibido.toFixed(2)}`;
    usdText.innerText = `$${overUsd.toFixed(2)}`;
    bsText.innerText = `Bs. ${overBs.toFixed(2)}`;
  } else {
    // Total exacto
    banner.classList.remove('debt');
    label.innerText = 'Estado del cobro:';
    breakdown.innerText = `Total 100% Cubierto ($${totalUsdRecibido.toFixed(2)} USD + Bs. ${totalBsRecibido.toFixed(2)})`;
    usdText.innerText = '$0.00';
    bsText.innerText = 'Bs. 0.00';
  }
}

// 11. Confirmar y Procesar Venta
async function confirmAndCheckout() {
  let totalRecibidoUsd = 0;
  let totalUsdRecibido = 0;
  let totalBsRecibido = 0;
  const methodsSummary = [];

  const activeMethods = [];
  paymentRows.forEach(r => {
    const m = getMethodDef(r.method);
    const amt = parseFloat(r.amount) || 0;
    if (amt > 0) {
      activeMethods.push(r.method);
      if (m.currency === 'USD') {
        totalRecibidoUsd += amt;
        totalUsdRecibido += amt;
        methodsSummary.push(`${r.method}: $${amt.toFixed(2)}`);
      } else {
        totalRecibidoUsd += (amt / tasaBcv);
        totalBsRecibido += amt;
        methodsSummary.push(`${r.method}: Bs. ${amt.toFixed(2)}`);
      }
    }
  });

  if (totalRecibidoUsd < currentTotalUsd - 0.02) {
    playBeep('error');
    const missing = currentTotalUsd - totalRecibidoUsd;
    showToast(`El monto no cubre el total de la orden. Faltan $${missing.toFixed(2)}`, 'error');
    return;
  }

  // Guardar nombre limpio del método para que el arqueo de caja agrupe perfectamente
  const uniqueMethods = [...new Set(activeMethods)];
  const metodoPagoFinal = uniqueMethods.length > 1
    ? 'Pago Mixto'
    : (uniqueMethods[0] || paymentRows[0].method);

  const notaPago = uniqueMethods.length > 1 ? methodsSummary.join(' + ') : '';

  const vueltoUsd = Math.max(0, totalRecibidoUsd - currentTotalUsd);
  const vueltoBs = vueltoUsd * tasaBcv;

  const payload = {
    items: cart.map(it => ({
      producto_id: it.product.id,
      tipo_venta: it.tipo_venta,
      cantidad: it.cantidad
    })),
    metodo_pago: metodoPagoFinal,
    nota: notaPago,
    tasa_bcv: tasaBcv,
    monto_recibido_usd: totalUsdRecibido,
    monto_recibido_bs: totalBsRecibido,
    vuelto_usd: vueltoUsd,
    vuelto_bs: vueltoBs
  };

  try {
    const res = await fetch('/api/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!res.ok) {
      playBeep('error');
      showToast(result.error || 'Error al procesar la venta', 'error');
      return;
    }

    playBeep('success');
    closeFinaPayModal();
    showToast(`¡Venta completada (${metodoPagoFinal})!`, 'success');
    openTicketModal(result.ticket);

    cart = [];
    renderCart();
    await loadProducts();

  } catch (err) {
    showToast('Error de red al procesar venta', 'error');
  }
}

// 12. Modal del Ticket Térmico con Detalle de Pago y Vuelto
function openTicketModal(ticket) {
  const modal = document.getElementById('ticketModal');
  const paper = document.getElementById('ticketPaper');

  const itemsHtml = ticket.items.map(it => {
    return `
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <div style="max-width: 68%;">
          <div>${it.cantidad}x ${it.nombre_producto}</div>
          <div style="font-size: 0.7rem; color: #555;">[MODO: ${it.tipo_venta}${it.tipo_venta === 'CAJA' ? ` x${it.unidades_por_caja}` : ''}]</div>
        </div>
        <div style="font-weight: bold;">$${it.subtotal.toFixed(2)}</div>
      </div>
    `;
  }).join('');

  const nombreNegocio = (appConfig && appConfig.nombre_negocio) || 'CONFITERÍA MAYOR Y DETAL';
  const rif = (appConfig && appConfig.rif) || 'J-50123456-7';
  const telf = (appConfig && appConfig.telefono) || '0412-5551234';
  const dir = (appConfig && appConfig.direccion) || '';
  const mensajeTicket = (appConfig && appConfig.mensaje_ticket) || '¡Gracias por su compra! Revisa tu mercancía al salir.';

  paper.innerHTML = `
    <div id="printable-ticket">
      <div class="ticket-center">
        <h3 style="font-size: 0.95rem; margin-bottom: 2px; font-weight: 800;">${nombreNegocio}</h3>
        <p style="font-size: 0.72rem;">RIF: ${rif} | Telf: ${telf}</p>
        ${dir ? `<p style="font-size: 0.68rem; color: #444;">${dir}</p>` : ''}
        <div style="font-size: 0.7rem; font-weight: 800; border: 1px dashed #000; padding: 3px; margin: 5px 0;">
          *** COMPROBANTE NO FISCAL - CONTROL INTERNO ***
        </div>
      </div>

      <div class="ticket-divider"></div>

      <div style="display: flex; justify-content: space-between; font-size: 0.74rem;">
        <span>Ticket: <b>#${ticket.codigo_ticket}</b></span>
        <span>${ticket.fecha}</span>
      </div>

      <div class="ticket-divider"></div>

      <div>
        ${itemsHtml}
      </div>

      <div class="ticket-divider"></div>

      <div style="display: flex; justify-content: space-between; font-size: 1rem; font-weight: bold;">
        <span>TOTAL USD:</span>
        <span>$${ticket.total_usd.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #333;">
        <span>TOTAL BS (Tasa ${ticket.tasa_bcv}):</span>
        <span>Bs. ${ticket.total_bs.toFixed(2)}</span>
      </div>

      <div class="ticket-divider"></div>

      <div style="font-size: 0.74rem;">
        <div style="display: flex; justify-content: space-between;">
          <span>Método de Pago:</span>
          <b>${ticket.metodo_pago}</b>
        </div>
        ${ticket.vuelto_usd > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-top: 2px; color: #047857; font-weight: bold;">
            <span>Vuelto entregado:</span>
            <span>$${ticket.vuelto_usd.toFixed(2)} (Bs. ${ticket.vuelto_bs.toFixed(2)})</span>
          </div>
        ` : ''}
      </div>

      <div class="ticket-divider"></div>

      <div class="ticket-center" style="font-size: 0.72rem; margin-top: 6px;">
        <p>${mensajeTicket}</p>
        <p style="font-size: 0.66rem; margin-top: 2px; color: #555;">No se aceptan devoluciones en golosinas abiertas.</p>
      </div>
    </div>
  `;

  modal.classList.add('open');
}

function closeTicketModal() {
  document.getElementById('ticketModal').classList.remove('open');
}

function printTicket() {
  document.body.classList.add('printing-ticket');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-ticket');
  }, 1000);
}

// 13. Toast Flotante
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

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadProducts();

  if (searchInput) {
    searchInput.addEventListener('input', renderProducts);
  }
});
