import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'confiteria.db')

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 20000")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Tabla de Productos
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_barra TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        categoria TEXT DEFAULT 'General',
        imagen TEXT DEFAULT '',
        unidades_por_caja INTEGER NOT NULL DEFAULT 1,
        precio_paquete REAL NOT NULL,
        precio_caja REAL NOT NULL,
        stock_paquetes INTEGER NOT NULL DEFAULT 0,
        stock_minimo INTEGER DEFAULT 10,
        activo INTEGER DEFAULT 1,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Tabla de Ventas (Encabezado)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_ticket TEXT NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_usd REAL NOT NULL,
        total_bs REAL NOT NULL,
        tasa_bcv REAL NOT NULL,
        metodo_pago TEXT DEFAULT 'Efectivo $',
        monto_recibido_usd REAL DEFAULT 0,
        monto_recibido_bs REAL DEFAULT 0,
        vuelto_usd REAL DEFAULT 0,
        vuelto_bs REAL DEFAULT 0,
        nota TEXT DEFAULT '',
        estado TEXT DEFAULT 'ACTIVO'
    )
    ''')

    # Migración de columnas adicionales si ya existía la tabla
    columnas_existentes = [row['name'] for row in cursor.execute("PRAGMA table_info(ventas)").fetchall()]
    for col, tipo in [
        ('monto_recibido_usd', 'REAL DEFAULT 0'),
        ('monto_recibido_bs', 'REAL DEFAULT 0'),
        ('vuelto_usd', 'REAL DEFAULT 0'),
        ('vuelto_bs', 'REAL DEFAULT 0'),
        ('estado', "TEXT DEFAULT 'ACTIVO'")
    ]:
        if col not in columnas_existentes:
            cursor.execute(f"ALTER TABLE ventas ADD COLUMN {col} {tipo}")

    # Tabla de Detalles de Venta
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS venta_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        nombre_producto TEXT NOT NULL,
        tipo_venta TEXT NOT NULL, -- 'PAQUETE' o 'CAJA'
        cantidad INTEGER NOT NULL,
        unidades_por_caja INTEGER NOT NULL,
        unidades_descontadas INTEGER NOT NULL,
        precio_unitario REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
    )
    ''')

    # Tabla de Configuración general (Nombre de la confitería, RIF, Tasa BCV, etc.)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
    )
    ''')

    # Valores por defecto de configuración
    config_defaults = [
        ('nombre_negocio', 'CONFITERÍA MAYOR Y DETAL'),
        ('rif', 'J-50123456-7'),
        ('telefono', '0412-5551234'),
        ('direccion', 'Calle Comercio, Local 4, Galpón B'),
        ('tasa_bcv', '49.50'),
        ('mensaje_ticket', '¡Gracias por su compra! Revisa tu mercancía al salir.'),
        ('clave_inventario', os.environ.get('KRONO_SUPERVISOR_PIN', '1234')),
        ('telegram_bot_token', ''),
        ('telegram_chat_id', ''),
        ('auto_backup_telegram', '1')
    ]
    for clave, valor in config_defaults:
        cursor.execute("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)", (clave, valor))

    # Cargar productos semilla si no hay ninguno
    cursor.execute("SELECT COUNT(*) as count FROM productos")
    if cursor.fetchone()['count'] == 0:
        productos_semilla = [
            (
                '7591001', 'Chupetas Bon Bon Bum Fresa', 'Chupetas',
                'https://images.unsplash.com/photo-1575224300306-1b8da36134ec?w=400&auto=format&fit=crop&q=80',
                8, 1.20, 8.50, 64, 16
            ),
            (
                '7591002', 'Galletas Oreo Original 6pk', 'Galletas',
                'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&auto=format&fit=crop&q=80',
                12, 1.50, 16.00, 48, 12
            ),
            (
                '7591003', 'Chocolatina Jet Tradicional', 'Chocolates',
                'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&auto=format&fit=crop&q=80',
                24, 0.50, 10.50, 96, 24
            ),
            (
                '7591004', 'Gomitas Trululu Aros Fresa', 'Gomitas',
                'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&auto=format&fit=crop&q=80',
                10, 1.00, 9.00, 50, 15
            ),
            (
                '7591005', 'Pirulin Lata Mediana 300g', 'Chocolates',
                'https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=400&auto=format&fit=crop&q=80',
                6, 4.50, 25.00, 24, 6
            ),
            (
                '7591006', 'Galleta Susy Vainilla', 'Galletas',
                'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=400&auto=format&fit=crop&q=80',
                24, 0.60, 13.00, 72, 24
            ),
            (
                '7591007', 'Caramelos Halls Mentol', 'Caramelos',
                'https://images.unsplash.com/photo-1527515862127-a4fc05baf7a5?w=400&auto=format&fit=crop&q=80',
                20, 0.40, 7.00, 80, 20
            ),
            (
                '7591008', 'Doritos Mega Queso 150g', 'Snacks',
                'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&auto=format&fit=crop&q=80',
                12, 1.25, 13.50, 36, 12
            )
        ]
        cursor.executemany('''
        INSERT INTO productos (codigo_barra, nombre, categoria, imagen, unidades_por_caja, precio_paquete, precio_caja, stock_paquetes, stock_minimo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', productos_semilla)

        # Migración y limpieza de nombres de métodos de pago
    cursor.execute("""
    UPDATE ventas SET metodo_pago = 'Dólares (Efectivo)' 
    WHERE metodo_pago LIKE 'D%lares%' OR metodo_pago = 'EFECTIVO_USD' OR metodo_pago = 'Efectivo $';
    """)
    cursor.execute("""
    UPDATE ventas SET metodo_pago = 'Bolívares (Efectivo)' 
    WHERE metodo_pago LIKE '%Bol%' OR metodo_pago = 'Efectivo Bs';
    """)
    cursor.execute("""
    UPDATE ventas SET metodo_pago = 'Punto de Venta' 
    WHERE metodo_pago LIKE 'Punto de Venta%';
    """)
    cursor.execute("""
    UPDATE ventas SET metodo_pago = 'Pago Móvil' 
    WHERE metodo_pago LIKE 'Pago M%vil%';
    """)

    conn.commit()
    conn.close()

def get_config():
    conn = get_db()
    rows = conn.execute("SELECT clave, valor FROM configuracion").fetchall()
    conn.close()
    return {row['clave']: row['valor'] for row in rows}

def update_config(config_dict):
    conn = get_db()
    cursor = conn.cursor()
    for clave, valor in config_dict.items():
        cursor.execute("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)", (clave, str(valor)))
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Base de datos inicializada correctamente.")
