import uuid
import os
import io
import math
import tempfile
import sqlite3
import json
import urllib.request
import ssl
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
from werkzeug.utils import secure_filename
from database import get_db, init_db, get_config, update_config

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('KRONO_SECRET_KEY', 'dev-secret-change-in-production')
app.config['TEMPLATES_AUTO_RELOAD'] = True
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# Claves de configuración que NUNCA deben salir hacia el navegador
CLAVES_CONFIG_PRIVADAS = {'clave_inventario', 'telegram_bot_token', 'telegram_chat_id'}

def get_public_config():
    """Configuración sin datos sensibles (clave de supervisor, credenciales de Telegram)."""
    return {k: v for k, v in get_config().items() if k not in CLAVES_CONFIG_PRIVADAS}


def parse_int(valor, campo, minimo=0, default=None):
    """Convierte a entero validando que no sea decimal, NaN ni menor que `minimo`."""
    if valor is None or str(valor).strip() == '':
        if default is not None:
            return default
        raise ValueError(f"El campo '{campo}' es obligatorio.")
    try:
        numero = float(str(valor).strip())
    except (TypeError, ValueError):
        raise ValueError(f"El campo '{campo}' debe ser un número entero.")
    if not numero.is_integer():
        raise ValueError(f"El campo '{campo}' debe ser un número entero.")
    numero = int(numero)
    if numero < minimo:
        raise ValueError(f"El campo '{campo}' no puede ser menor que {minimo}.")
    return numero


def parse_float(valor, campo, minimo=0.0, default=None):
    """Convierte a decimal validando que sea finito y no menor que `minimo`."""
    if valor is None or str(valor).strip() == '':
        if default is not None:
            return default
        raise ValueError(f"El campo '{campo}' es obligatorio.")
    try:
        numero = float(str(valor).strip())
    except (TypeError, ValueError):
        raise ValueError(f"El campo '{campo}' debe ser un número.")
    if math.isnan(numero) or math.isinf(numero):
        raise ValueError(f"El campo '{campo}' debe ser un número válido.")
    if numero < minimo:
        raise ValueError(f"El campo '{campo}' no puede ser menor que {minimo}.")
    return numero


def generar_respaldo_bytes():
    """
    Genera una copia consistente de la BD usando la API de backup de SQLite.
    Incluye las transacciones que aún estén en el archivo -wal (modo WAL),
    cosa que NO ocurre si se copia confiteria.db directamente.
    """
    fd, tmp_path = tempfile.mkstemp(prefix='krono_backup_', suffix='.db')
    os.close(fd)
    try:
        origen = get_db()
        destino = sqlite3.connect(tmp_path)
        try:
            origen.backup(destino)
            # Dejar el archivo autónomo (sin depender de un -wal)
            destino.execute("PRAGMA journal_mode = DELETE")
        finally:
            destino.close()
            origen.close()
        with open(tmp_path, 'rb') as f:
            return f.read()
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


# Inicializar BD al arrancar
init_db()


def get_telegram_config():
    config_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'telegram_config.json')
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return {
                    'telegram_bot_token': str(data.get('telegram_bot_token', '')).strip(),
                    'telegram_chat_id': str(data.get('telegram_chat_id', '')).strip(),
                    'auto_backup_telegram': data.get('auto_backup_telegram', True)
                }
        except Exception as e:
            print(f"Error leyendo telegram_config.json: {e}")
    # Fallback a base de datos
    config = get_config()
    return {
        'telegram_bot_token': config.get('telegram_bot_token', '').strip(),
        'telegram_chat_id': config.get('telegram_chat_id', '').strip(),
        'auto_backup_telegram': config.get('auto_backup_telegram', '1') == '1'
    }

def enviar_backup_telegram():
    config = get_public_config()
    tg_cfg = get_telegram_config()
    token = tg_cfg.get('telegram_bot_token', '').strip()
    chat_id = tg_cfg.get('telegram_chat_id', '').strip()

    if not token or not chat_id:
        return False, "Falta configurar el Token del Bot o el Chat ID de Telegram en el archivo de soporte técnico (telegram_config.json)."

    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'confiteria.db')
    if not os.path.exists(db_path):
        return False, "No se encontró el archivo de base de datos confiteria.db."

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"KRONO_POS_Backup_{timestamp}.db"
    url = f"https://api.telegram.org/bot{token}/sendDocument"

    try:
        boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
        body = []

        # chat_id field
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="chat_id"')
        body.append(b'')
        body.append(chat_id.encode())

        # caption field
        negocio = config.get('nombre_negocio', 'KRONO POS')
        rif = config.get('rif', '')
        caption = f"📦 Copia de Seguridad KRONO POS\n🏪 Negocio: {negocio} ({rif})\n📅 Fecha: {datetime.now().strftime('%d/%m/%Y %I:%M %p')}\n🔐 Base de datos íntegra SQLite (.db)"
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="caption"')
        body.append(b'')
        body.append(caption.encode('utf-8'))

        # document field (copia consistente vía API de backup de SQLite, incluye datos del -wal)
        file_bytes = generar_respaldo_bytes()

        body.append(f"--{boundary}".encode())
        body.append(f'Content-Disposition: form-data; name="document"; filename="{filename}"'.encode())
        body.append(b'Content-Type: application/x-sqlite3')
        body.append(b'')
        body.append(file_bytes)
        body.append(f"--{boundary}--".encode())
        body.append(b'')

        payload = b"\r\n".join(body)

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                'Content-Type': f'multipart/form-data; boundary={boundary}',
                'Content-Length': str(len(payload))
            }
        )

        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            if data.get('ok'):
                return True, "Respaldo enviado exitosamente a Telegram."
            return False, data.get('description', 'Error devuelto por Telegram.')

    except urllib.error.HTTPError as e:
        try:
            err_data = json.loads(e.read().decode())
            return False, f"Telegram error ({e.code}): {err_data.get('description', '')}"
        except Exception:
            return False, f"Error HTTP {e.code} al conectar con Telegram."
    except Exception as e:
        return False, f"Error de conexión: {str(e)}"

def verificar_clave_inventario(clave_ingresada):
    if not clave_ingresada:
        return False
    default_pin = os.environ.get('KRONO_SUPERVISOR_PIN', '1234')
    try:
        conn = get_db()
        row = conn.execute("SELECT valor FROM configuracion WHERE clave = 'clave_inventario'").fetchone()
        conn.close()
        clave_real = row['valor'] if row else default_pin
        return str(clave_ingresada).strip() == str(clave_real).strip()
    except Exception:
        return str(clave_ingresada).strip() == default_pin


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static', 'img'),
                               'favicon.svg', mimetype='image/svg+xml')

@app.route('/')
def index():
    config = get_public_config()
    return render_template('index.html', config=config, active_page='pos')

@app.route('/carga-rapida')
def carga_rapida():
    config = get_public_config()
    return render_template('carga_rapida.html', config=config, active_page='carga')

@app.route('/inventario')
def inventario():
    config = get_config()
    tab = request.args.get('tab', 'stock')
    return render_template('inventario.html', config=config, active_page='inventario', default_tab=tab)

@app.route('/precios')
@app.route('/inventario/precios')
def precios():
    config = get_public_config()
    return render_template('inventario.html', config=config, active_page='precios', default_tab='precios')

@app.route('/reportes')
def reportes():
    config = get_public_config()
    return render_template('reportes.html', config=config, active_page='reportes', default_tab='hoy')

@app.route('/reportes/historial')
def reportes_historial():
    config = get_public_config()
    return render_template('reportes.html', config=config, active_page='historial', default_tab='historial')

@app.route('/configuracion')
def configuracion():
    config = get_public_config()
    tg_cfg = get_telegram_config()
    tg_configured = bool(tg_cfg.get('telegram_bot_token') and tg_cfg.get('telegram_chat_id'))
    return render_template('configuracion.html', config=config, active_page='configuracion', telegram_configurado=tg_configured)


# ==========================================
# API DE PRODUCTOS
# ==========================================

@app.route('/api/productos', methods=['GET'])
def listar_productos():
    search = request.args.get('search', '').strip()
    categoria = request.args.get('categoria', '').strip()
    incluir_inactivos = request.args.get('incluir_inactivos', '0') in ('1', 'true', 'True')

    conn = get_db()
    query = "SELECT * FROM productos WHERE 1=1"
    if not incluir_inactivos:
        query += " AND activo = 1"
    params = []

    if categoria and categoria != 'Todos':
        query += " AND categoria = ?"
        params.append(categoria)

    if search:
        query += " AND (nombre LIKE ? OR codigo_barra LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    query += " ORDER BY nombre ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()

    productos = [dict(row) for row in rows]
    return jsonify(productos)

@app.route('/api/productos/buscar/<codigo>', methods=['GET'])
def buscar_por_codigo(codigo):
    conn = get_db()
    row = conn.execute("SELECT * FROM productos WHERE (codigo_barra = ? OR id = ?) AND activo = 1", (codigo, codigo)).fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({'error': 'Producto no encontrado'}), 404

@app.route('/api/productos', methods=['POST'])
def crear_producto():
    try:
        password = request.form.get('password', '')
        if not verificar_clave_inventario(password):
            return jsonify({'error': 'Contraseña incorrecta. Solo el encargado/supervisor puede registrar mercancía.'}), 403

        codigo_barra = request.form.get('codigo_barra', '').strip()
        nombre = request.form.get('nombre', '').strip()
        categoria = request.form.get('categoria', 'General').strip()

        if not codigo_barra or not nombre:
            return jsonify({'error': 'Código de barra y nombre son obligatorios'}), 400

        try:
            unidades_por_caja = parse_int(request.form.get('unidades_por_caja'), 'Unidades por caja', minimo=1, default=1)
            precio_paquete = parse_float(request.form.get('precio_paquete'), 'Precio por paquete', default=0.0)
            precio_caja = parse_float(request.form.get('precio_caja'), 'Precio por caja', default=0.0)
            stock_paquetes = parse_int(request.form.get('stock_paquetes'), 'Stock inicial', default=0)
            stock_minimo = parse_int(request.form.get('stock_minimo'), 'Stock mínimo', default=10)
        except ValueError as ve:
            return jsonify({'error': str(ve)}), 400

        imagen_url = request.form.get('imagen_url', '').strip()

        # Manejo de archivo subido
        if 'imagen_archivo' in request.files:
            file = request.files['imagen_archivo']
            if file and allowed_file(file.filename):
                filename = secure_filename(f"{codigo_barra}_{file.filename}")
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)
                imagen_url = f"/static/uploads/{filename}"

        if not imagen_url:
            imagen_url = '/static/img/placeholder.svg'

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
        INSERT INTO productos (codigo_barra, nombre, categoria, imagen, unidades_por_caja, precio_paquete, precio_caja, stock_paquetes, stock_minimo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (codigo_barra, nombre, categoria, imagen_url, unidades_por_caja, precio_paquete, precio_caja, stock_paquetes, stock_minimo))
        new_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({'success': True, 'id': new_id, 'mensaje': 'Producto registrado con éxito'})
    except sqlite3.IntegrityError:
        return jsonify({'error': f'El código de barras "{codigo_barra}" ya existe en el sistema'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/productos/<int:prod_id>', methods=['PUT'])
def actualizar_producto(prod_id):
    data = request.json or {}
    password = data.get('password', '')
    if not verificar_clave_inventario(password):
        return jsonify({'error': 'Contraseña de supervisor incorrecta. No se autorizó la edición de precios/producto.'}), 403

    codigo_barra = str(data.get('codigo_barra', '')).strip()
    nombre = str(data.get('nombre', '')).strip()
    categoria = str(data.get('categoria', 'General')).strip()

    if not codigo_barra or not nombre:
        return jsonify({'error': 'Código de barra y nombre son obligatorios'}), 400

    try:
        unidades_por_caja = parse_int(data.get('unidades_por_caja'), 'Unidades por caja', minimo=1, default=1)
        precio_paquete = parse_float(data.get('precio_paquete'), 'Precio por paquete', default=0.0)
        precio_caja = parse_float(data.get('precio_caja'), 'Precio por caja', default=0.0)
        stock_minimo = parse_int(data.get('stock_minimo'), 'Stock mínimo', default=10)
        activo = 1 if data.get('activo', 1) in (1, '1', True) else 0
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    try:

        conn = get_db()
        cursor = conn.cursor()

        # Verificar si el código de barra ya existe en otro producto
        duplicado = cursor.execute("SELECT id FROM productos WHERE codigo_barra = ? AND id != ?", (codigo_barra, prod_id)).fetchone()
        if duplicado:
            conn.close()
            return jsonify({'error': f'El código de barras "{codigo_barra}" ya pertenece a otro producto.'}), 400

        cursor.execute('''
        UPDATE productos SET
            codigo_barra = ?,
            nombre = ?,
            categoria = ?,
            unidades_por_caja = ?,
            precio_paquete = ?,
            precio_caja = ?,
            stock_minimo = ?,
            activo = ?
        WHERE id = ?
        ''', (
            codigo_barra, nombre, categoria, unidades_por_caja,
            precio_paquete, precio_caja, stock_minimo, activo, prod_id
        ))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'mensaje': f'Precios y datos de "{nombre}" actualizados correctamente.'})
    except Exception as e:
        return jsonify({'error': f'Error al actualizar: {str(e)}'}), 500

@app.route('/api/productos/<int:prod_id>/toggle-activo', methods=['POST'])
def toggle_activo_producto(prod_id):
    data = request.json or {}
    password = data.get('password', '')
    if not verificar_clave_inventario(password):
        return jsonify({'error': 'Contraseña de supervisor incorrecta.'}), 403

    conn = get_db()
    cursor = conn.cursor()
    prod = cursor.execute("SELECT id, nombre, activo FROM productos WHERE id = ?", (prod_id,)).fetchone()
    if not prod:
        conn.close()
        return jsonify({'error': 'Producto no encontrado'}), 404

    nuevo_estado = 0 if prod['activo'] == 1 else 1
    cursor.execute("UPDATE productos SET activo = ? WHERE id = ?", (nuevo_estado, prod_id))
    conn.commit()
    conn.close()

    estado_txt = "activado" if nuevo_estado == 1 else "desactivado"
    return jsonify({
        'success': True,
        'nuevo_estado': nuevo_estado,
        'mensaje': f'Producto "{prod["nombre"]}" {estado_txt} correctamente.'
    })

@app.route('/api/productos/<int:prod_id>/sumar-stock', methods=['POST'])
def sumar_stock(prod_id):
    data = request.json or {}
    password = data.get('password', '')
    if not verificar_clave_inventario(password):
        return jsonify({'error': 'Contraseña incorrecta. Solo el encargado/supervisor puede aumentar mercancía.'}), 403

    try:
        cajas = parse_int(data.get('cajas'), 'Cajas', minimo=0, default=0)
        paquetes = parse_int(data.get('paquetes'), 'Paquetes', minimo=0, default=0)
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    if cajas == 0 and paquetes == 0:
        return jsonify({'error': 'Indica al menos una caja o un paquete para sumar al stock.'}), 400

    conn = get_db()
    prod = conn.execute("SELECT unidades_por_caja, stock_paquetes FROM productos WHERE id = ?", (prod_id,)).fetchone()
    if not prod:
        conn.close()
        return jsonify({'error': 'Producto no encontrado'}), 404

    total_a_sumar = (cajas * prod['unidades_por_caja']) + paquetes
    nuevo_stock = prod['stock_paquetes'] + total_a_sumar

    conn.execute("UPDATE productos SET stock_paquetes = ? WHERE id = ?", (nuevo_stock, prod_id))
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'nuevo_stock': nuevo_stock, 'unidades_agregadas': total_a_sumar})

# ==========================================
# API DE VENTAS (PUNTO DE COBRO)
# ==========================================


@app.route('/api/verificar-clave-inventario', methods=['POST'])
def api_verificar_clave_inventario():
    data = request.json or {}
    clave = data.get('password', '')
    if verificar_clave_inventario(clave):
        return jsonify({'valido': True})
    return jsonify({'valido': False, 'error': 'Contraseña incorrecta'}), 403

@app.route('/api/ventas', methods=['POST'])
def registrar_venta():
    data = request.get_json(silent=True) or {}
    items = data.get('items', [])
    metodo_pago = str(data.get('metodo_pago', 'Efectivo $'))
    nota = str(data.get('nota', '') or '')

    try:
        tasa_bcv = parse_float(data.get('tasa_bcv'), 'Tasa BCV', minimo=0.0, default=49.50)
        if tasa_bcv <= 0:
            raise ValueError('La tasa BCV debe ser mayor que cero.')
        monto_recibido_usd = parse_float(data.get('monto_recibido_usd'), 'Monto recibido USD', default=0.0)
        monto_recibido_bs = parse_float(data.get('monto_recibido_bs'), 'Monto recibido Bs', default=0.0)
        vuelto_usd = parse_float(data.get('vuelto_usd'), 'Vuelto USD', default=0.0)
        vuelto_bs = parse_float(data.get('vuelto_bs'), 'Vuelto Bs', default=0.0)
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    if not isinstance(items, list) or not items:
        return jsonify({'error': 'El carrito está vacío'}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        total_usd = 0.0
        unidades_por_producto = {}  # Acumula paquetes pedidos por producto (paquete + caja en líneas distintas)

        # Validar stock primero
        for item in items:
            if not isinstance(item, dict):
                raise ValueError('Formato de producto inválido en el carrito.')
            prod_id = parse_int(item.get('producto_id'), 'producto_id', minimo=1)
            tipo_venta = str(item.get('tipo_venta', '')).upper()  # 'PAQUETE' o 'CAJA'
            if tipo_venta not in ('PAQUETE', 'CAJA'):
                raise ValueError(f"Tipo de venta inválido: '{item.get('tipo_venta')}'. Debe ser PAQUETE o CAJA.")
            cantidad = parse_int(item.get('cantidad'), 'cantidad', minimo=1)

            prod = cursor.execute("SELECT id, nombre, unidades_por_caja, precio_paquete, precio_caja, stock_paquetes, activo FROM productos WHERE id = ?", (prod_id,)).fetchone()
            if not prod:
                raise Exception(f"Producto ID {prod_id} no existe")
            if prod['activo'] != 1:
                raise Exception(f"El producto '{prod['nombre']}' está desactivado y no se puede vender.")

            unidades_a_descontar = (cantidad * prod['unidades_por_caja']) if tipo_venta == 'CAJA' else cantidad

            # Validar contra el total acumulado del producto en todo el carrito
            acumulado = unidades_por_producto.get(prod_id, 0) + unidades_a_descontar
            unidades_por_producto[prod_id] = acumulado
            if prod['stock_paquetes'] < acumulado:
                raise Exception(f"Stock insuficiente para '{prod['nombre']}'. Disponible: {prod['stock_paquetes']} paq. Solicitado: {acumulado} paq.")

            precio_unit = prod['precio_caja'] if tipo_venta == 'CAJA' else prod['precio_paquete']
            subtotal = round(precio_unit * cantidad, 2)
            total_usd += subtotal

            # Guardar datos calculados y normalizados en el item
            item['producto_id'] = prod_id
            item['tipo_venta'] = tipo_venta
            item['cantidad'] = cantidad
            item['unidades_descontadas'] = unidades_a_descontar
            item['unidades_por_caja'] = prod['unidades_por_caja']
            item['precio_unitario'] = precio_unit
            item['subtotal'] = subtotal
            item['nombre_producto'] = prod['nombre']

        total_bs = round(total_usd * tasa_bcv, 2)
        total_usd = round(total_usd, 2)

        # Insertar encabezado de venta provisional para obtener ID atómico único y consecutivo
        cursor.execute('''
        INSERT INTO ventas (codigo_ticket, total_usd, total_bs, tasa_bcv, metodo_pago, monto_recibido_usd, monto_recibido_bs, vuelto_usd, vuelto_bs, nota, estado)
        VALUES ('PENDIENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')
        ''', (total_usd, total_bs, tasa_bcv, metodo_pago, monto_recibido_usd, monto_recibido_bs, vuelto_usd, vuelto_bs, nota))
        venta_id = cursor.lastrowid
        codigo_ticket = f"TK-{venta_id:05d}"
        cursor.execute("UPDATE ventas SET codigo_ticket = ? WHERE id = ?", (codigo_ticket, venta_id))

        # Insertar detalles y descontar stock
        for item in items:
            cursor.execute('''
            INSERT INTO venta_detalles (venta_id, producto_id, nombre_producto, tipo_venta, cantidad, unidades_por_caja, unidades_descontadas, precio_unitario, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                venta_id, item['producto_id'], item['nombre_producto'],
                item['tipo_venta'], item['cantidad'], item['unidades_por_caja'],
                item['unidades_descontadas'], item['precio_unitario'], item['subtotal']
            ))

            cursor.execute('''
            UPDATE productos
            SET stock_paquetes = stock_paquetes - ?
            WHERE id = ? AND stock_paquetes >= ?
            ''', (item['unidades_descontadas'], item['producto_id'], item['unidades_descontadas']))
            if cursor.rowcount == 0:
                raise Exception(f"Stock insuficiente para '{item['nombre_producto']}' al confirmar la venta.")

        conn.commit()

        # Devolver comprobante completo
        comprobante = {
            'ticket_id': venta_id,
            'codigo_ticket': codigo_ticket,
            'fecha': datetime.now().strftime("%d/%m/%Y %I:%M %p"),
            'total_usd': total_usd,
            'total_bs': total_bs,
            'tasa_bcv': tasa_bcv,
            'metodo_pago': metodo_pago,
            'monto_recibido_usd': monto_recibido_usd,
            'monto_recibido_bs': monto_recibido_bs,
            'vuelto_usd': vuelto_usd,
            'vuelto_bs': vuelto_bs,
            'items': items
        }

        conn.close()
        return jsonify({'success': True, 'ticket': comprobante})

    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 400

# ==========================================
# REPORTES Y CIERRE DE DÍA (ARQUEO ESTILO FINA)
# ==========================================

def obtener_reporte_dia(dia_str=None):
    conn = get_db()

    if dia_str:
        fecha_condition = "date(fecha, 'localtime') = date(?)"
        fecha_param = [dia_str]
        fecha_vd_condition = "date(v.fecha, 'localtime') = date(?)"
        fecha_vd_param = [dia_str]
    else:
        fecha_condition = "date(fecha, 'localtime') = date('now', 'localtime')"
        fecha_param = []
        fecha_vd_condition = "date(v.fecha, 'localtime') = date('now', 'localtime')"
        fecha_vd_param = []

    # Ventas del día (auditoría completa con tickets activos y anulados)
    # 'fecha' se guarda en UTC (CURRENT_TIMESTAMP); 'fecha_local' es la hora local para mostrar
    ventas_dia = conn.execute(f'''
    SELECT *, datetime(fecha, 'localtime') AS fecha_local FROM ventas
    WHERE {fecha_condition}
    ORDER BY fecha DESC
    ''', fecha_param).fetchall()

    # Cálculo de totales únicamente de tickets ACTIVOS (excluye anulados)
    ventas_activas = [v for v in ventas_dia if (v['estado'] or 'ACTIVO') != 'ANULADO']
    total_usd = sum(v['total_usd'] for v in ventas_activas)
    total_bs = sum(v['total_bs'] for v in ventas_activas)
    total_tickets = len(ventas_activas)
    total_anulados = len(ventas_dia) - len(ventas_activas)

    # Arqueo de caja por método de pago (Estilo Fina Partner) - Solo tickets activos
    arqueo_caja = conn.execute(f'''
    SELECT 
        metodo_pago,
        COUNT(*) as cantidad_transacciones,
        SUM(total_usd) as total_usd,
        SUM(total_bs) as total_bs
    FROM ventas
    WHERE {fecha_condition} AND COALESCE(estado, 'ACTIVO') != 'ANULADO'
    GROUP BY metodo_pago
    ORDER BY total_usd DESC
    ''', fecha_param).fetchall()

    # Desglose de productos vendidos ese día - Solo tickets activos
    desglose_productos = conn.execute(f'''
    SELECT
        vd.nombre_producto,
        vd.tipo_venta,
        SUM(vd.cantidad) as total_vendido,
        SUM(vd.unidades_descontadas) as total_paquetes_descontados,
        SUM(vd.subtotal) as total_generado
    FROM venta_detalles vd
    JOIN ventas v ON vd.venta_id = v.id
    WHERE {fecha_vd_condition} AND COALESCE(v.estado, 'ACTIVO') != 'ANULADO'
    GROUP BY vd.nombre_producto, vd.tipo_venta
    ORDER BY total_generado DESC
    ''', fecha_vd_param).fetchall()

    # Productos con stock bajo
    stock_bajo = conn.execute('''
    SELECT id, codigo_barra, nombre, unidades_por_caja, stock_paquetes, stock_minimo
    FROM productos
    WHERE activo = 1 AND stock_paquetes <= stock_minimo
    ORDER BY stock_paquetes ASC
    ''').fetchall()

    # Total productos e inventario remanente
    inventario_total = conn.execute('''
    SELECT id, codigo_barra, nombre, categoria, unidades_por_caja, stock_paquetes, stock_minimo, precio_paquete, precio_caja
    FROM productos
    WHERE activo = 1
    ORDER BY categoria, nombre
    ''').fetchall()

    conn.close()

    fecha_real = dia_str if dia_str else (ventas_dia[0]['fecha_local'][:10] if ventas_dia else datetime.now().strftime('%Y-%m-%d'))

    return {
        'fecha': fecha_real,
        'total_usd': round(total_usd, 2),
        'total_bs': round(total_bs, 2),
        'total_tickets': total_tickets,
        'total_anulados': total_anulados,
        'arqueo_caja': [
            {
                'metodo_pago': a['metodo_pago'],
                'cantidad_transacciones': a['cantidad_transacciones'],
                'total_usd': round(a['total_usd'] or 0.0, 2),
                'total_bs': round(a['total_bs'] or 0.0, 2)
            }
            for a in arqueo_caja
        ],
        'desglose_productos': [dict(d) for d in desglose_productos],
        'stock_bajo': [dict(s) for s in stock_bajo],
        'inventario_total': [dict(i) for i in inventario_total],
        'ventas_recientes': [dict(v) for v in ventas_dia]
    }

@app.route('/api/reportes/hoy', methods=['GET'])
def reporte_hoy():
    return jsonify(obtener_reporte_dia(None))

@app.route('/api/reportes/dia', methods=['GET'])
def reporte_dia():
    fecha = request.args.get('fecha', '').strip()
    return jsonify(obtener_reporte_dia(fecha if fecha else None))


@app.route('/api/backup/descargar', methods=['GET'])
def descargar_backup():
    # Copia consistente vía API de backup de SQLite (incluye ventas aún en el -wal)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    return send_file(
        io.BytesIO(generar_respaldo_bytes()),
        as_attachment=True,
        download_name=f"KRONO_POS_Backup_{timestamp}.db",
        mimetype="application/x-sqlite3"
    )

@app.route('/api/backup/telegram', methods=['POST'])
def api_backup_telegram():
    exito, mensaje = enviar_backup_telegram()
    if exito:
        return jsonify({'success': True, 'mensaje': mensaje})
    return jsonify({'success': False, 'error': mensaje}), 400

@app.route('/api/ventas/<int:venta_id>/anular', methods=['POST'])
def anular_venta(venta_id):
    data = request.json or {}
    password = data.get('password', '')
    if not verificar_clave_inventario(password):
        return jsonify({'error': 'Contraseña incorrecta. Solo el supervisor puede anular tickets.'}), 403

    conn = get_db()
    cursor = conn.cursor()

    venta = cursor.execute("SELECT * FROM ventas WHERE id = ?", (venta_id,)).fetchone()
    if not venta:
        conn.close()
        return jsonify({'error': 'Ticket no encontrado'}), 404

    if venta['estado'] == 'ANULADO':
        conn.close()
        return jsonify({'error': 'Este ticket ya fue anulado previamente'}), 400

    # 1. Reponer inventario de cada producto vendido
    detalles = cursor.execute("SELECT producto_id, unidades_descontadas FROM venta_detalles WHERE venta_id = ?", (venta_id,)).fetchall()
    for d in detalles:
        cursor.execute("UPDATE productos SET stock_paquetes = stock_paquetes + ? WHERE id = ?", (d['unidades_descontadas'], d['producto_id']))

    # 2. Marcar ticket como ANULADO
    now_str = datetime.now().strftime("%d/%m/%Y %I:%M %p")
    nota_actual = venta['nota'] or ''
    nueva_nota = f"{nota_actual} [ANULADO el {now_str}]".strip()

    cursor.execute("UPDATE ventas SET estado = 'ANULADO', nota = ? WHERE id = ?", (nueva_nota, venta_id))
    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'mensaje': f"Ticket {venta['codigo_ticket']} anulado con éxito. Se repuso el stock al inventario."
    })

@app.route('/api/reportes/historial', methods=['GET'])
def reporte_historial_dias():
    conn = get_db()
    
    dias = conn.execute('''
    SELECT 
        date(fecha, 'localtime') as dia,
        COUNT(*) as total_tickets,
        SUM(total_usd) as total_usd,
        SUM(total_bs) as total_bs
    FROM ventas
    WHERE COALESCE(estado, 'ACTIVO') != 'ANULADO'
    GROUP BY date(fecha, 'localtime')
    ORDER BY dia DESC
    ''').fetchall()

    resumen_historial = []
    for d in dias:
        dia_str = d['dia']
        metodos = conn.execute('''
        SELECT metodo_pago, SUM(total_usd) as total_usd, SUM(total_bs) as total_bs
        FROM ventas
        WHERE date(fecha, 'localtime') = ? AND COALESCE(estado, 'ACTIVO') != 'ANULADO'
        GROUP BY metodo_pago
        ''', (dia_str,)).fetchall()

        metodos_desc = ", ".join([f"{m['metodo_pago']}: ${m['total_usd']:.2f}" for m in metodos])

        resumen_historial.append({
            'dia': dia_str,
            'total_tickets': d['total_tickets'],
            'total_usd': round(d['total_usd'], 2),
            'total_bs': round(d['total_bs'], 2),
            'metodos_desc': metodos_desc,
            'metodos_detalle': [dict(m) for m in metodos]
        })

    conn.close()
    return jsonify(resumen_historial)

# ==========================================
# CONFIGURACIÓN Y SINCRONIZACIÓN BCV
# ==========================================

def consultar_api_bcv():
    """Consulta la API pública del BCV en tiempo real con fallback seguro"""
    urls = [
        'https://ve.dolarapi.com/v1/dolares/oficial'
    ]
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for url in urls:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ConfiteriaPOS/1.0'})
            with urllib.request.urlopen(req, timeout=4, context=ctx) as response:
                data = json.loads(response.read().decode('utf-8'))
                promedio = data.get('promedio')
                if promedio:
                    return float(promedio), data.get('fechaActualizacion', '')
        except Exception as e:
            print(f"Error consultando API BCV ({url}): {e}")
    return None, None

@app.route('/api/config', methods=['GET'])
def obtener_config():
    # Nunca exponer la clave de supervisor ni credenciales de Telegram
    return jsonify(get_public_config())

@app.route('/api/config/sincronizar-bcv', methods=['POST', 'GET'])
def sincronizar_bcv():
    tasa, fecha_act = consultar_api_bcv()
    config_actual = get_config()

    if tasa:
        tasa_redondeada = round(tasa, 2)
        update_config({
            'tasa_bcv': str(tasa_redondeada),
            'ultima_sincronizacion_bcv': datetime.now().strftime("%d/%m/%Y %I:%M %p")
        })
        return jsonify({
            'success': True,
            'tasa_bcv': tasa_redondeada,
            'tasa_exacta': tasa,
            'mensaje': f'Tasa BCV sincronizada con éxito: Bs. {tasa_redondeada:.2f}',
            'fecha_bcv': fecha_act
        })
    else:
        # Fallback offline: mantener la que ya estaba guardada en SQLite
        tasa_guardada = float(config_actual.get('tasa_bcv', 49.50))
        return jsonify({
            'success': False,
            'tasa_bcv': tasa_guardada,
            'mensaje': 'Sin conexión a internet. Se mantiene la última tasa guardada.'
        })

@app.route('/api/config/tasa', methods=['POST'])
def actualizar_tasa():
    data = request.json
    nueva_tasa = data.get('tasa_bcv')
    if not nueva_tasa:
        return jsonify({'error': 'Tasa inválida'}), 400
    update_config({'tasa_bcv': str(nueva_tasa)})
    return jsonify({'success': True, 'tasa_bcv': str(nueva_tasa)})

@app.route('/api/config', methods=['POST'])
def guardar_config():
    data = request.json or {}
    conn = get_db()
    cursor = conn.cursor()

    # Si se intenta cambiar la clave de supervisor, verificar clave actual
    if 'nueva_clave_inventario' in data and data['nueva_clave_inventario'].strip():
        clave_actual = data.get('clave_actual', '')
        if not verificar_clave_inventario(clave_actual):
            conn.close()
            return jsonify({'error': 'La contraseña actual de supervisor es incorrecta. No se puede cambiar la clave.'}), 403
        nueva_clave = data['nueva_clave_inventario'].strip()
        cursor.execute("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('clave_inventario', ?)", (nueva_clave,))

    # Guardar campos generales de configuración
    campos_permitidos = [
        'nombre_negocio', 'rif', 'telefono', 'direccion', 'mensaje_ticket'
    ]
    for campo in campos_permitidos:
        if campo in data:
            cursor.execute("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)", (campo, str(data[campo]).strip()))

    conn.commit()
    conn.close()
    return jsonify({'success': True, 'mensaje': 'Configuración guardada correctamente'})

if __name__ == '__main__':
    host = os.environ.get('KRONO_HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '5000'))
    print(f"Iniciando KRONO POS en http://{host}:{port} ...")
    app.run(host=host, port=port, debug=False)
