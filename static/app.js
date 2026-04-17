const API_BASE = '/api/orders';

let currentOrder = null;
let map = null;
let mapMarker = null;
let signaturePad = null;
let fullCalendarInst = null;

// View switching
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-buttons button').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`view-${viewId}`).classList.add('active');
    document.getElementById(`btn-${viewId}`).classList.add('active');
    
    if (viewId === 'cal') {
        setTimeout(renderCalendar, 100);
    }
    
    loadOrders();
}

// Fetch and render
async function loadOrders() {
    const res = await fetch(API_BASE);
    const orders = await res.json();
    
    renderKanban(orders);
    renderMobileList(orders);
}

// Kanban Render
function renderKanban(orders) {
    const board = document.getElementById('kanban-board');
    board.innerHTML = '';
    
    const statuses = [
        { id: 'NUEVA', title: '🌟 Nuevas' },
        { id: 'EN_COORDINACION', title: '📞 Coordinando' },
        { id: 'PROGRAMADA', title: '📅 Programadas (Admin)' },
        { id: 'EN_CAMINO', title: '🚚 En Camino (SLA)' },
        { id: 'EN_SITIO', title: '📍 En Sitio' },
        { id: 'EN_ACTIVACION', title: '⚙️ Activación' },
        { id: 'COMPLETADA', title: '✅ Completadas' },
        { id: 'FALLIDA', title: '❌ Fallidas' }
    ];

    statuses.forEach(status => {
        const col = document.createElement('div');
        col.className = 'kanban-column';
        col.innerHTML = `<h3><span>${status.title}</span> <span class="badge">0</span></h3>`;
        
        const colOrders = orders.filter(o => o.status === status.id);
        col.querySelector('.badge').textContent = colOrders.length;
        
        colOrders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title">${order.customer_name}</div>
                <div class="card-meta">
                    <span>📱 ${order.phone}</span>
                    <span>💻 ${order.plan}</span>
                </div>
            `;
            // Simple click to move to PROGRAMADA from CRM
            if (status.id === 'NUEVA' || status.id === 'EN_COORDINACION') {
                const btn = document.createElement('button');
                btn.className = 'btn';
                btn.style.marginTop = '0.5rem';
                btn.style.fontSize = '0.75rem';
                btn.textContent = 'Avanzar Estado';
                btn.onclick = () => {
                    const next = status.id === 'NUEVA' ? 'EN_COORDINACION' : 'PROGRAMADA';
                    if (next === 'PROGRAMADA') {
                        let t = new Date();
                        t.setDate(t.getDate() + 1);
                        let defaultDate = t.toISOString().split('T')[0] + 'T10:00';
                        const stDate = prompt("Ingrese fecha y hora para programar (YYYY-MM-DDTHH:MM):", defaultDate);
                        if (stDate) {
                            updateStatus(order.id, next, null, stDate);
                        }
                    } else {
                        updateStatus(order.id, next);
                    }
                };
                card.appendChild(btn);
            }
            col.appendChild(card);
        });
        
        board.appendChild(col);
    });
}

// Mobile View Render
function renderMobileList(orders) {
    const list = document.getElementById('tech-tasks-container');
    list.innerHTML = '';
    
    // Tech sees PROGRAMADA onwards, to do their job
    const techOrders = orders.filter(o => !['NUEVA', 'EN_COORDINACION', 'COMPLETADA'].includes(o.status));
    
    if(techOrders.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted)">No hay tareas asignadas.</p>';
        return;
    }

    techOrders.forEach(order => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-title">${order.customer_name}</div>
            <div class="card-meta" style="margin-bottom: 0.5rem">
                <span>📍 Ubicación Pendiente</span>
                <span class="badge">${order.status}</span>
            </div>
        `;
        card.onclick = () => openDetail(order);
        list.appendChild(card);
    });
}

function openDetail(order) {
    currentOrder = order;
    document.getElementById('tech-list').style.display = 'none';
    document.getElementById('tech-detail').style.display = 'block';
    
    document.getElementById('td-name').textContent = order.customer_name;
    document.getElementById('td-id').textContent = order.id.split('-')[0];
    document.getElementById('td-plan').textContent = order.plan;
    document.getElementById('td-phone').textContent = order.phone;
    document.getElementById('td-status').textContent = order.status;
    
    renderActionButtons(order.status);

    // Initializamos el Mapa (Leaflet)
    setTimeout(() => {
        document.getElementById('map').style.display = 'block';
        const lat = order.original_latitude || -0.180653;
        const lng = order.original_longitude || -78.467834;
        
        if (!map) {
            map = L.map('map').setView([lat, lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
            mapMarker = L.marker([lat, lng], {draggable: true}).bindPopup('📍 Arrastra para ajustar ubicación').addTo(map);
            mapMarker.on('dragend', function (e) {
                const position = mapMarker.getLatLng();
                currentOrder.actual_latitude = position.lat;
                currentOrder.actual_longitude = position.lng;
            });
        } else {
            map.setView([lat, lng], 15);
            mapMarker.setLatLng([lat, lng]);
            map.invalidateSize();
        }
    }, 100);
}

function closeDetail() {
    document.getElementById('tech-list').style.display = 'flex';
    document.getElementById('tech-detail').style.display = 'none';
    document.getElementById('tech-acta').style.display = 'none';
    currentOrder = null;
    loadOrders();
}

function renderActionButtons(status) {
    const actions = document.getElementById('td-actions');
    actions.innerHTML = '';
    const actaDiv = document.getElementById('tech-acta');
    actaDiv.style.display = 'none';

    if (status === 'PROGRAMADA') {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = '🚚 Iniciar Viaje (En Camino)';
        btn.onclick = () => updateStatus(currentOrder.id, 'EN_CAMINO');
        actions.appendChild(btn);
    } 
    else if (status === 'EN_CAMINO') {
        const btn = document.createElement('button');
        btn.className = 'btn btn-warning';
        btn.textContent = '📍 Llegada y Actualizar GPS (En Sitio)';
        btn.onclick = () => setEnSitio(currentOrder.id);
        actions.appendChild(btn);
    }
    else if (status === 'EN_SITIO') {
        const btn = document.createElement('button');
        btn.className = 'btn btn-warning';
        btn.textContent = '⚙️ Solicitar Activación Remota';
        btn.onclick = () => updateStatus(currentOrder.id, 'EN_ACTIVACION');
        actions.appendChild(btn);
    }
    else if (status === 'EN_ACTIVACION') {
        actaDiv.style.display = 'block'; // Show acta form
        
        // Initialize Signature Pad
        setTimeout(() => {
            const canvas = document.getElementById('signature-canvas');
            if (canvas && !signaturePad) {
                const ratio = Math.max(window.devicePixelRatio || 1, 1);
                canvas.width = canvas.offsetWidth * ratio;
                canvas.height = canvas.offsetHeight * ratio;
                canvas.getContext("2d").scale(ratio, ratio);
                
                signaturePad = new SignaturePad(canvas, {
                    backgroundColor: 'rgba(255, 255, 255, 0)',
                    penColor: 'rgb(15, 23, 42)'
                });
                
                document.getElementById('clear-signature').onclick = (e) => {
                    e.preventDefault();
                    signaturePad.clear();
                };
            } else if (signaturePad) {
                signaturePad.clear();
            }
        }, 100);
    }

    // Always allow fail from field
    if (['PROGRAMADA', 'EN_CAMINO', 'EN_SITIO', 'EN_ACTIVACION'].includes(status)) {
        const btnFail = document.createElement('button');
        btnFail.className = 'btn btn-danger';
        btnFail.style.marginTop = '1rem';
        btnFail.textContent = '❌ Marcar Fallida';
        btnFail.onclick = () => {
            const reason = prompt("Razón del fallo (ej. Cliente no está, Sin Poste)");
            if(reason) updateStatus(currentOrder.id, 'FALLIDA', reason);
        };
        actions.appendChild(btnFail);
    }
}

function renderCalendar() {
    const calEl = document.getElementById('calendar');
    fetch(API_BASE).then(r => r.json()).then(orders => {
        const events = orders
            .filter(o => ['PROGRAMADA', 'EN_CAMINO', 'EN_SITIO', 'EN_ACTIVACION'].includes(o.status) && o.scheduled_date)
            .map(o => ({
                id: o.id,
                title: `${o.customer_name} - ${o.plan}`,
                start: o.scheduled_date.replace(' ', 'T'), // Ensure ISO format
                color: o.status === 'PROGRAMADA' ? '#2563eb' : '#f59e0b'
            }));

        if (!fullCalendarInst) {
            fullCalendarInst = new FullCalendar.Calendar(calEl, {
                initialView: 'timeGridWeek',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                },
                locale: 'es',
                buttonText: {
                    today:    'Hoy',
                    month:    'Mes',
                    week:     'Semana',
                    day:      'Día'
                },
                events: events,
                eventClick: function(info) {
                    alert('Orden: ' + info.event.title + '\nHora: ' + info.event.start.toLocaleString());
                }
            });
            fullCalendarInst.render();
        } else {
            fullCalendarInst.removeAllEvents();
            fullCalendarInst.addEventSource(events);
        }
    });
}

async function updateStatus(id, newStatus, reason = null, scheduled_date = null) {
    const payload = { status: newStatus, reason };
    if (scheduled_date) payload.scheduled_date = scheduled_date;

    await fetch(`${API_BASE}/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if(currentOrder && currentOrder.id === id) {
        currentOrder.status = newStatus;
        openDetail(currentOrder); // refresh detail view
    } else {
        loadOrders();
    }
}

async function setEnSitio(id) {
    // Send updated coords (dragged or original)
    const activeLat = currentOrder.actual_latitude || currentOrder.original_latitude || -0.180653;
    const activeLng = currentOrder.actual_longitude || currentOrder.original_longitude || -78.467834;
    
    await fetch(`${API_BASE}/${id}/gps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: activeLat, lng: activeLng })
    });
    updateStatus(id, 'EN_SITIO');
}

async function submitActa() {
    if (signaturePad && signaturePad.isEmpty()) {
        alert("Por favor, capture la firma del cliente antes de continuar.");
        return;
    }

    const eq = document.getElementById('acta-equipment').value;
    const cond = document.getElementById('acta-conditions').value;
    const signatureBase64 = signaturePad ? signaturePad.toDataURL() : 'NO_SIGNATURE';
    
    await fetch(`${API_BASE}/${currentOrder.id}/act`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installed_equipment: eq, installation_conditions: cond, signature: signatureBase64 })
    });
    
    await updateStatus(currentOrder.id, 'COMPLETADA');
    closeDetail();
}

async function createMockOrder() {
    await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            customer_name: `Cliente Nuevo ${Math.floor(Math.random()*100)}`,
            phone: '0990001111',
            plan: 'Megas Plus 200',
            lat: -0.180653 + (Math.random() * 0.02 - 0.01),
            lng: -78.467834 + (Math.random() * 0.02 - 0.01)
        })
    });
    loadOrders();
}

// Init
loadOrders();
