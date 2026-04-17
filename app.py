import sqlite3
import uuid
import os
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)
DB_FILE = 'workflow.db'

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    # Table InstallationOrder
    c.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            customer_name TEXT,
            phone TEXT,
            plan TEXT,
            additional_services TEXT,
            original_latitude REAL,
            original_longitude REAL,
            actual_latitude REAL,
            actual_longitude REAL,
            status TEXT,
            assigned_crew_id TEXT,
            scheduled_date TEXT,
            road_time TEXT,
            arrival_time TEXT,
            completion_time TEXT,
            failure_reason TEXT
        )
    ''')
    # Table InstallationAct
    c.execute('''
        CREATE TABLE IF NOT EXISTS acts (
            id TEXT PRIMARY KEY,
            order_id TEXT,
            installed_equipment TEXT,
            installation_conditions TEXT,
            customer_signature_url TEXT,
            FOREIGN KEY(order_id) REFERENCES orders(id)
        )
    ''')
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/orders', methods=['GET'])
def get_orders():
    conn = get_db_connection()
    orders = conn.execute('SELECT * FROM orders').fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in orders])

@app.route('/api/orders', methods=['POST'])
def create_order():
    data = request.json
    order_id = str(uuid.uuid4())
    conn = get_db_connection()
    conn.execute('''
        INSERT INTO orders (id, customer_name, phone, plan, additional_services, original_latitude, original_longitude, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (order_id, data['customer_name'], data['phone'], data['plan'], data.get('additional_services', ''), data['lat'], data['lng'], 'NUEVA'))
    conn.commit()
    conn.close()
    return jsonify({"id": order_id}), 201

@app.route('/api/orders/<order_id>/status', methods=['PUT'])
def update_status(order_id):
    data = request.json
    status = data['status']
    conn = get_db_connection()
    
    # Simple SLA time update based on status
    time_payload = ""
    import datetime
    now = datetime.datetime.now().isoformat()
    if status == 'EN_CAMINO':
        conn.execute('UPDATE orders SET status = ?, road_time = ? WHERE id = ?', (status, now, order_id))
    elif status == 'EN_SITIO':
        conn.execute('UPDATE orders SET status = ?, arrival_time = ? WHERE id = ?', (status, now, order_id))
    elif status == 'COMPLETADA':
        conn.execute('UPDATE orders SET status = ?, completion_time = ? WHERE id = ?', (status, now, order_id))
    elif status == 'FALLIDA':
        conn.execute('UPDATE orders SET status = ?, failure_reason = ? WHERE id = ?', (status, data.get('reason', ''), order_id))
    elif status == 'PROGRAMADA':
        date_val = data.get('scheduled_date') or now
        conn.execute('UPDATE orders SET status = ?, scheduled_date = ? WHERE id = ?', (status, date_val, order_id))
    else:
        conn.execute('UPDATE orders SET status = ? WHERE id = ?', (status, order_id))
        
    conn.commit()
    conn.close()
    return jsonify({"status": "updated"})

@app.route('/api/orders/<order_id>/gps', methods=['PUT'])
def update_gps(order_id):
    data = request.json
    conn = get_db_connection()
    conn.execute('UPDATE orders SET actual_latitude = ?, actual_longitude = ? WHERE id = ?', 
                (data['lat'], data['lng'], order_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "gps updated"})

@app.route('/api/orders/<order_id>/act', methods=['POST'])
def create_act(order_id):
    data = request.json
    act_id = str(uuid.uuid4())
    conn = get_db_connection()
    conn.execute('''
        INSERT INTO acts (id, order_id, installed_equipment, installation_conditions, customer_signature_url)
        VALUES (?, ?, ?, ?, ?)
    ''', (act_id, order_id, data.get('installed_equipment', ''), data.get('installation_conditions', ''), data.get('signature', '')))
    conn.commit()
    conn.close()
    return jsonify({"id": act_id}), 201

if __name__ == '__main__':
    init_db()
    # Adding a dummy order for testing if db is empty
    conn = get_db_connection()
    if not conn.execute('SELECT 1 FROM orders LIMIT 1').fetchone():
        conn.execute('''
            INSERT INTO orders (id, customer_name, phone, plan, original_latitude, original_longitude, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (str(uuid.uuid4()), 'Juan Pérez', '0991234567', 'Fibra 100Mbps', -0.180653, -78.467834, 'NUEVA'))
        conn.commit()
    conn.close()
    app.run(host='0.0.0.0', port=4010, debug=True)
