// ===================================================
// KRONO POS PRO - CARGA RÁPIDA ENGINE
// ===================================================

const fastCodigoInput = document.getElementById('fastCodigoBarra');
const fastNombreInput = document.getElementById('fastNombre');
const fastCategoriaInput = document.getElementById('fastCategoria');
const fastUnidadesPorCajaInput = document.getElementById('fastUnidadesPorCaja');
const fastPrecioPaqueteInput = document.getElementById('fastPrecioPaquete');
const fastPrecioCajaInput = document.getElementById('fastPrecioCaja');
const fastInputCajas = document.getElementById('fastInputCajas');
const fastInputSueltos = document.getElementById('fastInputSueltos');
const fastStockPreview = document.getElementById('fastStockPreview');
const fastImagenArchivo = document.getElementById('fastImagenArchivo');
const fastUploadDropzone = document.getElementById('fastUploadDropzone');
const fastPreviewContainer = document.getElementById('fastPreviewContainer');
const fastPreviewImage = document.getElementById('fastPreviewImage');
const fastPreviewName = document.getElementById('fastPreviewName');
const recentProductsList = document.getElementById('recentProductsList');
const recentCountBadge = document.getElementById('recentCountBadge');

let recentSessionItems = [];

// 1. Calculadora de Stock Inicial
function calcFastStockPreview() {
  const perBox = parseInt(fastUnidadesPorCajaInput.value) || 1;
  const boxes = parseInt(fastInputCajas.value) || 0;
  const loose = parseInt(fastInputSueltos.value) || 0;
  const total = (boxes * perBox) + loose;
  fastStockPreview.innerText = `Total en sistema: ${total} paquetes (${boxes} cajas + ${loose} paq)`;
  return total;
}

// 2. Manejo de Selección de Imagen y Drag & Drop
function handleFastFileSelect(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
      fastPreviewImage.src = e.target.result;
      fastPreviewName.innerText = file.name;
      fastUploadDropzone.style.display = 'none';
      fastPreviewContainer.style.display = 'flex';
    };

    reader.readAsDataURL(file);
  }
}

function clearFastSelectedImage(e) {
  if (e) e.stopPropagation();
  fastImagenArchivo.value = '';
  fastPreviewImage.src = '';
  fastPreviewContainer.style.display = 'none';
  fastUploadDropzone.style.display = 'flex';
}

if (fastUploadDropzone) {
  ['dragenter', 'dragover'].forEach(ev => {
    fastUploadDropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      fastUploadDropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(ev => {
    fastUploadDropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      fastUploadDropzone.classList.remove('dragover');
    }, false);
  });

  fastUploadDropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length > 0) {
      fastImagenArchivo.files = dt.files;
      handleFastFileSelect(fastImagenArchivo);
    }
  });
}

// 3. Enviar Formulario y Guardar Producto
async function handleFastProductSubmit(e) {
  e.preventDefault();

  const totalStock = calcFastStockPreview();
  const formData = new FormData();
  formData.append('codigo_barra', fastCodigoInput.value.trim());
  formData.append('nombre', fastNombreInput.value.trim());
  formData.append('categoria', fastCategoriaInput.value);
  formData.append('unidades_por_caja', fastUnidadesPorCajaInput.value);
  formData.append('precio_paquete', fastPrecioPaqueteInput.value);
  formData.append('precio_caja', fastPrecioCajaInput.value);
  formData.append('stock_paquetes', totalStock);
  formData.append('stock_minimo', 10);

  const pwdInput = document.getElementById('fastPassword');
  const password = pwdInput ? pwdInput.value.trim() : '';

  if (!password) {
    showToast('Ingresa la contraseña de autorización para registrar mercancía', 'error');
    if (pwdInput) pwdInput.focus();
    return;
  }
  formData.append('password', password);

  if (fastImagenArchivo.files.length > 0) {
    formData.append('imagen_archivo', fastImagenArchivo.files[0]);
  }

  try {
    const res = await fetch('/api/productos', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();

    if (!res.ok) {
      showToast(result.error || 'Error al guardar producto', 'error');
      if (pwdInput) {
        pwdInput.value = '';
        pwdInput.focus();
      }
      return;
    }

    showToast(`"${fastNombreInput.value.trim()}" guardado con éxito!`, 'success');

    // Agregar a la lista de recientes
    recentSessionItems.unshift({
      nombre: fastNombreInput.value.trim(),
      codigo: fastCodigoInput.value.trim(),
      precio_paquete: parseFloat(fastPrecioPaqueteInput.value),
      precio_caja: parseFloat(fastPrecioCajaInput.value),
      unidades_por_caja: parseInt(fastUnidadesPorCajaInput.value),
      stock_paquetes: totalStock
    });
    renderRecentList();

    // Resetear formulario para el siguiente escaneo
    document.getElementById('fastProductForm').reset();
    if (pwdInput) pwdInput.value = '';
    clearFastSelectedImage();
    fastUnidadesPorCajaInput.value = "12";
    fastInputCajas.value = "5";
    fastInputSueltos.value = "0";
    calcFastStockPreview();
    fastCodigoInput.focus();

  } catch (err) {
    showToast('Error de conexión al guardar producto', 'error');
  }
}

function renderRecentList() {
  recentCountBadge.innerText = `${recentSessionItems.length} registrados`;

  if (recentSessionItems.length === 0) return;

  recentProductsList.innerHTML = recentSessionItems.map(item => {
    return `
      <div style="background: #ffffff; border: 1px solid var(--border); border-left: 3px solid #2563eb; border-radius: 6px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-xs);">
        <div>
          <div style="font-weight: 700; font-size: 0.85rem; color: #1e293b;">${item.nombre}</div>
          <div style="font-size: 0.72rem; color: #64748b; font-family: monospace;">Cód: ${item.codigo} • ${item.unidades_por_caja} un/caj</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.8rem; font-weight: 800; color: #2563eb;">$${item.precio_paquete.toFixed(2)} paq / $${item.precio_caja.toFixed(2)} caj</div>
          <div style="font-size: 0.72rem; color: #059669; font-weight: 700;">Stock: ${item.stock_paquetes} paq</div>
        </div>
      </div>
    `;
  }).join('');
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

document.addEventListener('DOMContentLoaded', () => {
  calcFastStockPreview();
  fastCodigoInput.focus();
});
