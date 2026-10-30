const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

let token = localStorage.getItem('retail_token') || '';
let currentUser = JSON.parse(localStorage.getItem('retail_user') || 'null');
let currentView = 'dashboard';
let cache = {};

const titles = {
  dashboard: 'Dashboard overview',
  products: 'Products',
  categories: 'Categories',
  suppliers: 'Suppliers',
  warehouses: 'Warehouses',
  customers: 'Customers',
  inventory: 'Inventory',
  purchases: 'Purchases',
  sales: 'Sales',
  reports: 'Reports'
};

const money = n =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(n || 0));

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const num = n => new Intl.NumberFormat('en-IN').format(Number(n || 0));

/* Scroll the page and common content containers to the top. */
function scrollToTop() {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'smooth'
  });

  const containers = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    $('.main-panel'),
    $('.content'),
    $('#view')
  ];

  [...new Set(containers.filter(Boolean))].forEach(el => {
    el.scrollTo?.({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
  });
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

function notify(message, bad = false) {
  const el = $('#notice');

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.remove('hidden', 'bad');

  if (bad) el.classList.add('bad');

  scrollToTop();

  setTimeout(() => el.classList.add('hidden'), 5000);
}

function showApp() {
  $('#login-screen')?.classList.add('hidden');
  $('#app-screen')?.classList.remove('hidden');

  if ($('#user-name')) {
    $('#user-name').textContent = currentUser?.name || 'User';
  }

  if ($('#user-role')) {
    $('#user-role').textContent = currentUser?.role || 'Staff';
  }

  if (currentUser?.role !== 'admin') {
    $$('.admin-only').forEach(x => x.remove());
  }

  render();
}

function showLogin() {
  $('#app-screen')?.classList.add('hidden');
  $('#login-screen')?.classList.remove('hidden');
}

$('#login-form')?.addEventListener('submit', async e => {
  e.preventDefault();

  $('#login-error').textContent = '';

  const form = Object.fromEntries(new FormData(e.currentTarget));

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(form)
    });

    token = data.token;
    currentUser = data.user;

    localStorage.setItem('retail_token', token);
    localStorage.setItem('retail_user', JSON.stringify(currentUser));

    showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout')?.addEventListener('click', () => {
  token = '';
  currentUser = null;

  localStorage.removeItem('retail_token');
  localStorage.removeItem('retail_user');

  showLogin();
});

$('#nav')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;

  currentView = btn.dataset.view;

  $$('.nav-item').forEach(x =>
    x.classList.toggle('active', x === btn)
  );

  render();
});

async function render() {
  $('#page-title').textContent = titles[currentView] || 'Dashboard';
  $('#crumb').textContent = currentView.toUpperCase();

  const root = $('#view');
  root.innerHTML = '<div class="panel empty">Loading…</div>';

  try {
    if (currentView === 'dashboard') return await renderDashboard(root);
    if (currentView === 'products') return await renderProducts(root);

    if (['categories', 'suppliers', 'warehouses', 'customers'].includes(currentView)) {
      return await renderMaster(root, currentView);
    }

    if (currentView === 'inventory') return await renderInventory(root);
    if (currentView === 'purchases') return await renderPurchases(root);
    if (currentView === 'sales') return await renderSales(root);
    if (currentView === 'reports') return await renderReports(root);
  } catch (err) {
    root.innerHTML = `<div class="panel empty">${esc(err.message)}</div>`;
  }
}

function go(view) {
  currentView = view;

  $$('.nav-item').forEach(x =>
    x.classList.toggle('active', x.dataset.view === view)
  );

  render();
}

function metric(label, value, icon, foot) {
  return `
    <div class="metric">
      <div class="metric-top">${label}<span class="metric-icon">${icon}</span></div>
      <div class="metric-value">${value}</div>
      <div class="metric-foot">${foot}</div>
    </div>`;
}

function quick(icon, title, desc, view) {
  return `
    <button class="quick-action" data-goto="${view}">
      <span class="metric-icon">${icon}</span>
      <span><strong>${title}</strong><small>${desc}</small></span>
      <b>›</b>
    </button>`;
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map(r => `
                <tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>
              `).join('')
            : `<tr><td colspan="${headers.length}" class="empty">No records found</td></tr>`
          }
        </tbody>
      </table>
    </div>`;
}

function toolbar(title, button = '＋ Add new') {
  return `
    <div class="toolbar">
      <div><h3 class="section-title">${title}</h3></div>
      <button class="primary" id="add-btn">${button}</button>
    </div>`;
}

function formCard(title, fields, submitText = 'Save record') {
  return `
    <form class="inline-form" id="record-form">
      <h3>${title}</h3>

      <div class="form-grid">
        ${fields.map(f => `
          <label class="${f.wide ? 'wide' : ''}">
            ${f.label}

            ${f.options ? `
              <select name="${f.name}" ${f.required === false ? '' : 'required'}>
                ${f.options.map(o => `
                  <option value="${esc(o.value)}"
                    ${String(o.value ?? '') === String(f.value ?? '') ? 'selected' : ''}>
                    ${esc(o.label)}
                  </option>
                `).join('')}
              </select>
            ` : `
              <input
                name="${f.name}"
                type="${f.type || 'text'}"
                value="${esc(f.value ?? '')}"
                ${f.min !== undefined ? `min="${f.min}"` : ''}
                ${f.step ? `step="${f.step}"` : ''}
                ${f.required === false ? '' : 'required'}
                placeholder="${esc(f.placeholder || '')}">
            `}
          </label>
        `).join('')}
      </div>

      <div class="form-actions">
        <button type="button" class="secondary" id="cancel-form">Cancel</button>
        <button class="primary" type="submit">${submitText}</button>
      </div>
    </form>`;
}

async function renderDashboard(root) {
  const d = await api('/dashboard');

  root.innerHTML = `
    <div class="welcome">
      <div>
        <h3>Good day, ${esc(currentUser?.name?.split(' ')[0] || 'there')} 👋</h3>
        <p>Here’s what’s happening with your store today.</p>
      </div>
      <button class="primary" data-goto="sales">＋ New sale</button>
    </div>

    <div class="metrics">
      ${metric('Active products', num(d.total_products), '▤', 'Catalog')}
      ${metric('Revenue today', money(d.revenue_today), '₹', `${num(d.sales_today)} transactions`)}
      ${metric('Units in stock', num(d.units_in_stock), '▥', 'Across all warehouses')}
      ${metric('Low-stock items', num(d.low_stock.length), '!', 'At or below reorder level')}
    </div>

    <div class="dashboard-grid">
      <div class="panel">
        <div class="panel-head">
          <div><h3>Low-stock watchlist</h3><p>Items that may need replenishment</p></div>
          <span class="pill ${d.low_stock.length ? 'warn' : ''}">${d.low_stock.length} items</span>
        </div>
        ${d.low_stock.length
          ? table(
              ['SKU', 'Product', 'On hand', 'Reorder level'],
              d.low_stock.map(p => [
                esc(p.sku),
                esc(p.name),
                `<span class="pill warn">${num(p.quantity)}</span>`,
                num(p.reorder_level)
              ])
            )
          : '<div class="empty">All products are above reorder level.</div>'
        }
      </div>

      <div class="panel">
        <div class="panel-head">
          <div><h3>Quick actions</h3><p>Common tasks to keep things moving</p></div>
        </div>
        <div class="quick-list">
          ${quick('＋', 'Record a sale', 'Create a sales transaction', 'sales')}
          ${quick('↘', 'Receive purchase', 'Add incoming stock', 'purchases')}
          ${quick('▤', 'Add product', 'Update your catalog', 'products')}
          ${quick('▥', 'View inventory', 'Check stock by warehouse', 'inventory')}
        </div>
      </div>
    </div>`;

  root.querySelectorAll('[data-goto]').forEach(b => {
    b.onclick = () => go(b.dataset.goto);
  });
}

/* ==================== PRODUCTS ==================== */

function productsTable(rows) {
  return table(
    ['SKU', 'Product', 'Category', 'Cost', 'Price', 'Stock', 'Reorder', 'Actions'],
    rows.map(p => [
      esc(p.sku),
      `<strong>${esc(p.name)}</strong>`,
      esc(p.category_name || 'Uncategorized'),
      money(p.cost_price),
      money(p.selling_price),
      num(p.stock_quantity),
      Number(p.stock_quantity) <= Number(p.reorder_level)
        ? `<span class="pill warn">${num(p.reorder_level)}</span>`
        : num(p.reorder_level),
      `<button type="button" class="secondary" data-edit-product="${p.id}">Edit</button>
       <button type="button" class="secondary" data-delete-product="${p.id}">Delete</button>`
    ])
  );
}

async function renderProducts(root) {
  const products = await api('/products');
  cache.products = products;

  root.innerHTML = `
    <div class="toolbar">
      <input id="search-products" placeholder="Search product name or SKU…">
      <button class="primary admin-only" id="add-btn">＋ Add product</button>
    </div>
    <div class="panel" id="product-panel">${productsTable(products)}</div>`;

  $('#add-btn')?.addEventListener('click', () => showProductForm(root));

  $('#search-products').oninput = e => {
    const q = e.target.value.toLowerCase();

    $('#product-panel').innerHTML = productsTable(
      products.filter(p =>
        `${p.name} ${p.sku}`.toLowerCase().includes(q)
      )
    );
  };

  root.onclick = async e => {
    const edit = e.target.closest('[data-edit-product]');
    const del = e.target.closest('[data-delete-product]');

    if (edit) {
      scrollToTop();

      const product = products.find(
        p => String(p.id) === edit.dataset.editProduct
      );

      if (product) {
        try {
          await showProductForm(root, product);
        } catch (err) {
          notify(err.message, true);
        }
      }
    }

    if (del) {
      scrollToTop();

      const id = del.dataset.deleteProduct;

      if (!confirm('Are you sure you want to delete this product?')) return;

      try {
        await api(`/products/${id}`, { method: 'DELETE' });
        notify('Product deleted successfully.');
        await renderProducts(root);
      } catch (err) {
        notify(err.message, true);
      }
    }
  };
}

async function showProductForm(root, product = null) {
  const cats = await api('/categories');

  $('#record-form')?.remove();

  const fields = [
    { name: 'sku', label: 'SKU / Barcode', value: product?.sku ?? '' },
    { name: 'name', label: 'Product name', value: product?.name ?? '' },
    {
      name: 'category_id',
      label: 'Category',
      required: false,
      value: product?.category_id ?? '',
      options: [
        { value: '', label: 'Uncategorized' },
        ...cats.map(c => ({ value: c.id, label: c.name }))
      ]
    },
    {
      name: 'cost_price',
      label: 'Cost price (₹)',
      type: 'number',
      min: 0,
      step: '0.01',
      value: product?.cost_price ?? 0
    },
    {
      name: 'selling_price',
      label: 'Selling price (₹)',
      type: 'number',
      min: 0,
      step: '0.01',
      value: product?.selling_price ?? 0
    },
    {
      name: 'reorder_level',
      label: 'Reorder level',
      type: 'number',
      min: 0,
      value: product?.reorder_level ?? 0
    },
    {
      name: 'description',
      label: 'Description',
      required: false,
      wide: true,
      value: product?.description ?? ''
    }
  ];

  root.insertAdjacentHTML(
    'afterbegin',
    formCard(
      product ? 'Edit product' : 'Add product',
      fields,
      product ? 'Update product' : 'Save product'
    )
  );

  scrollToTop();

  $('#cancel-form').onclick = () => $('#record-form').remove();

  $('#record-form').onsubmit = async e => {
    e.preventDefault();

    const d = Object.fromEntries(new FormData(e.currentTarget));

    d.category_id = d.category_id ? Number(d.category_id) : null;
    d.cost_price = Number(d.cost_price);
    d.selling_price = Number(d.selling_price);
    d.reorder_level = Number(d.reorder_level || 0);

    try {
      if (product) {
        await api(`/products/${product.id}`, {
          method: 'PUT',
          body: JSON.stringify(d)
        });
        notify('Product updated successfully.');
      } else {
        await api('/products', {
          method: 'POST',
          body: JSON.stringify(d)
        });
        notify('Product created successfully.');
      }

      await renderProducts(root);
    } catch (err) {
      notify(err.message, true);
    }
  };
}
/* ==================== MASTER RECORDS ==================== */

const masterConfig = {
  categories: {
    title: 'Product categories',
    fields: [
      { name: 'name', label: 'Category name' },
      { name: 'description', label: 'Description', required: false, wide: true }
    ],
    cols: ['Name', 'Description', 'Actions'],
    map: r => [
      esc(r.name),
      esc(r.description || '—'),
      `<button type="button" class="secondary" data-edit-master="${r.id}">Edit</button>
       <button type="button" class="secondary" data-delete-master="${r.id}">Delete</button>`
    ]
  },
  suppliers: {
    title: 'Supplier directory',
    fields: [
      { name: 'name', label: 'Supplier name' },
      { name: 'contact_person', label: 'Contact person', required: false },
      { name: 'email', label: 'Email', type: 'email', required: false },
      { name: 'phone', label: 'Phone', required: false },
      { name: 'address', label: 'Address', required: false, wide: true }
    ],
    cols: ['Supplier', 'Contact', 'Email', 'Phone'],
    map: r => [
      esc(r.name),
      esc(r.contact_person || '—'),
      esc(r.email || '—'),
      esc(r.phone || '—')
    ]
  },
  warehouses: {
    title: 'Warehouse locations',
    fields: [
      { name: 'name', label: 'Warehouse name' },
      { name: 'address', label: 'Address', required: false, wide: true }
    ],
    cols: ['Warehouse', 'Address'],
    map: r => [
      esc(r.name),
      esc(r.address || '—')
    ]
  },
  customers: {
    title: 'Customer directory',
    fields: [
      { name: 'name', label: 'Customer name' },
      { name: 'email', label: 'Email', type: 'email', required: false },
      { name: 'phone', label: 'Phone', required: false },
      { name: 'address', label: 'Address', required: false, wide: true }
    ],
    cols: ['Customer', 'Email', 'Phone'],
    map: r => [
      esc(r.name),
      esc(r.email || '—'),
      esc(r.phone || '—')
    ]
  }
};

async function renderMaster(root, resource) {
  const rows = await api('/' + resource);
  cache[resource] = rows;

  const cfg = masterConfig[resource];

  root.innerHTML = `
    ${toolbar(cfg.title)}
    <div class="panel">${table(cfg.cols, rows.map(cfg.map))}</div>`;

  $('#add-btn').onclick = () => showMasterForm(root, resource);

  root.onclick = async e => {
    const edit = e.target.closest('[data-edit-master]');
    const del = e.target.closest('[data-delete-master]');

    if (edit) {
      scrollToTop();

      const record = rows.find(
        r => String(r.id) === edit.dataset.editMaster
      );

      if (record) {
        showMasterForm(root, resource, record);
      }
    }

    if (del) {
      scrollToTop();

      const id = del.dataset.deleteMaster;

      if (!confirm(`Are you sure you want to delete this ${resource.slice(0, -1)}?`)) {
        return;
      }

      try {
        await api(`/${resource}/${id}`, { method: 'DELETE' });
        notify('Record deleted successfully.');
        await renderMaster(root, resource);
      } catch (err) {
        notify(err.message, true);
      }
    }
  };
}

function showMasterForm(root, resource, record = null) {
  const cfg = masterConfig[resource];

  $('#record-form')?.remove();

  const fields = cfg.fields.map(f => ({
    ...f,
    value: record?.[f.name] ?? ''
  }));

  root.insertAdjacentHTML(
    'afterbegin',
    formCard(
      record
        ? 'Edit ' + resource.slice(0, -1)
        : 'Add ' + resource.slice(0, -1),
      fields,
      record ? 'Update record' : 'Save record'
    )
  );

  scrollToTop();

  $('#cancel-form').onclick = () => $('#record-form').remove();

  $('#record-form').onsubmit = async e => {
    e.preventDefault();

    const d = Object.fromEntries(new FormData(e.currentTarget));

    try {
      if (record) {
        await api(`/${resource}/${record.id}`, {
          method: 'PUT',
          body: JSON.stringify(d)
        });
        notify('Record updated successfully.');
      } else {
        await api('/' + resource, {
          method: 'POST',
          body: JSON.stringify(d)
        });
        notify('Record saved successfully.');
      }

      await renderMaster(root, resource);
    } catch (err) {
      notify(err.message, true);
    }
  };
}

/* ==================== INVENTORY ==================== */

async function renderInventory(root) {
  const rows = await api('/inventory');
  cache.warehouses = await api('/warehouses');
  cache.products = await api('/products');

  root.innerHTML = `
    ${toolbar('Stock by warehouse', '↻ Refresh')}
    <div class="panel">
      ${table(
        ['SKU', 'Product', 'Warehouse', 'Quantity', 'Reorder level', 'Status'],
        rows.map(r => [
          esc(r.sku),
          esc(r.product_name),
          esc(r.warehouse_name),
          num(r.quantity),
          num(r.reorder_level),
          Number(r.quantity) <= Number(r.reorder_level)
            ? '<span class="pill warn">Reorder</span>'
            : '<span class="pill">In stock</span>'
        ])
      )}
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="panel-head">
        <div>
          <h3>Transfer stock</h3>
          <p>Move available units between warehouses</p>
        </div>
      </div>

      <form id="transfer-form" class="form-grid">
        <label>Product
          <select name="product_id" required>
            ${cache.products.map(p => `
              <option value="${p.id}">${esc(p.sku)} — ${esc(p.name)}</option>
            `).join('')}
          </select>
        </label>

        <label>Quantity
          <input name="quantity" type="number" min="1" step="1" required>
        </label>

        <label>From warehouse
          <select name="from_warehouse_id" required>
            ${cache.warehouses.map(w => `
              <option value="${w.id}">${esc(w.name)}</option>
            `).join('')}
          </select>
        </label>

        <label>To warehouse
          <select name="to_warehouse_id" required>
            ${cache.warehouses.map(w => `
              <option value="${w.id}">${esc(w.name)}</option>
            `).join('')}
          </select>
        </label>

        <div class="wide form-actions">
          <button class="primary">Transfer stock</button>
        </div>
      </form>
    </div>`;

  $('#add-btn').onclick = () => renderInventory(root);

  $('#transfer-form').onsubmit = async e => {
    e.preventDefault();

    const d = Object.fromEntries(new FormData(e.currentTarget));
    d.product_id = Number(d.product_id);
    d.quantity = Number(d.quantity);
    d.from_warehouse_id = Number(d.from_warehouse_id);
    d.to_warehouse_id = Number(d.to_warehouse_id);

    try {
      await api('/inventory/transfer', {
        method: 'POST',
        body: JSON.stringify(d)
      });

      notify('Stock transferred.');
      await renderInventory(root);
    } catch (err) {
      notify(err.message, true);
    }
  };
}

/* ==================== PURCHASES ==================== */

async function renderPurchases(root) {
  const [purchases, suppliers, warehouses, products] = await Promise.all([
    api('/purchases'),
    api('/suppliers'),
    api('/warehouses'),
    api('/products')
  ]);

  cache.products = products;

  root.innerHTML = `
    ${toolbar('Purchase receiving', '＋ Receive purchase')}
    <div class="panel">
      ${table(
        ['Purchase #', 'Supplier', 'Warehouse', 'Total', 'Status', 'Date'],
        purchases.map(p => [
          `PUR-${p.id}`,
          esc(p.supplier_name),
          esc(p.warehouse_name),
          money(p.total_amount),
          '<span class="pill">Received</span>',
          new Date(p.created_at).toLocaleString()
        ])
      )}
    </div>`;

  $('#add-btn').onclick = () => {
    if (!suppliers.length || !warehouses.length || !products.length) {
      return notify(
        'Add at least one supplier, warehouse and product first.',
        true
      );
    }

    $('#record-form')?.remove();

    root.insertAdjacentHTML(
      'afterbegin',
      formCard('Receive stock purchase', [
        {
          name: 'supplier_id',
          label: 'Supplier',
          options: suppliers.map(s => ({
            value: s.id,
            label: s.name
          }))
        },
        {
          name: 'warehouse_id',
          label: 'Warehouse',
          options: warehouses.map(w => ({
            value: w.id,
            label: w.name
          }))
        },
        {
          name: 'product_id',
          label: 'Product',
          options: products.map(p => ({
            value: p.id,
            label: `${p.sku} — ${p.name}`
          }))
        },
        {
          name: 'quantity',
          label: 'Quantity received',
          type: 'number',
          min: 1
        },
        {
          name: 'unit_cost',
          label: 'Unit cost (₹)',
          type: 'number',
          min: 0,
          step: '0.01'
        },
        {
          name: 'notes',
          label: 'Notes',
          required: false,
          wide: true
        }
      ], 'Receive purchase')
    );

    scrollToTop();

    $('#cancel-form').onclick = () => $('#record-form').remove();

    $('#record-form').onsubmit = async e => {
      e.preventDefault();

      const d = Object.fromEntries(new FormData(e.currentTarget));
      d.supplier_id = Number(d.supplier_id);
      d.warehouse_id = Number(d.warehouse_id);

      d.items = [{
        product_id: Number(d.product_id),
        quantity: Number(d.quantity),
        unit_cost: Number(d.unit_cost)
      }];

      try {
        await api('/purchases', {
          method: 'POST',
          body: JSON.stringify(d)
        });

        notify('Purchase received and stock updated.');
        await renderPurchases(root);
      } catch (err) {
        notify(err.message, true);
      }
    };
  };
}
/* ==================== SALES ==================== */

async function renderSales(root) {
  const [sales, customers, warehouses, products] = await Promise.all([
    api('/sales'),
    api('/customers'),
    api('/warehouses'),
    api('/products')
  ]);

  root.innerHTML = `
    ${toolbar('Sales transactions', '＋ New sale')}
    <div class="panel">
      ${table(
        [
          'Sale #',
          'Customer',
          'Warehouse',
          'Subtotal',
          'Discount',
          'Total',
          'Payment',
          'Date'
        ],
        sales.map(s => [
          `SAL-${s.id}`,
          esc(s.customer_name),
          esc(s.warehouse_name),
          money(s.subtotal),
          money(s.discount),
          `<strong>${money(s.total_amount)}</strong>`,
          esc(s.payment_method),
          new Date(s.created_at).toLocaleString()
        ])
      )}
    </div>`;

  $('#add-btn').onclick = () => {
    if (!warehouses.length || !products.length) {
      return notify(
        'Add at least one warehouse and product first.',
        true
      );
    }

    $('#record-form')?.remove();

    root.insertAdjacentHTML(
      'afterbegin',
      formCard('Checkout sale', [
        {
          name: 'warehouse_id',
          label: 'Warehouse',
          options: warehouses.map(w => ({
            value: w.id,
            label: w.name
          }))
        },
        {
          name: 'customer_id',
          label: 'Customer',
          required: false,
          options: [
            { value: '', label: 'Walk-in customer' },
            ...customers.map(c => ({
              value: c.id,
              label: c.name
            }))
          ]
        },
        {
          name: 'product_id',
          label: 'Product',
          options: products.map(p => ({
            value: p.id,
            label: `${p.sku} — ${p.name} (${num(p.stock_quantity)} in stock)`
          }))
        },
        {
          name: 'quantity',
          label: 'Quantity',
          type: 'number',
          min: 1
        },
        {
          name: 'discount',
          label: 'Discount (₹)',
          type: 'number',
          min: 0,
          step: '0.01'
        },
        {
          name: 'payment_method',
          label: 'Payment method',
          options: ['cash', 'card', 'upi', 'bank_transfer', 'other'].map(x => ({
            value: x,
            label: x.replace('_', ' ')
          }))
        }
      ], 'Complete sale')
    );

    scrollToTop();

    $('#cancel-form').onclick = () => $('#record-form').remove();

    $('#record-form').onsubmit = async e => {
      e.preventDefault();

      const d = Object.fromEntries(new FormData(e.currentTarget));
      d.warehouse_id = Number(d.warehouse_id);
      d.customer_id = d.customer_id ? Number(d.customer_id) : null;
      d.discount = Number(d.discount || 0);

      d.items = [{
        product_id: Number(d.product_id),
        quantity: Number(d.quantity)
      }];

      try {
        const sale = await api('/sales', {
          method: 'POST',
          body: JSON.stringify(d)
        });

        notify(
          `Sale SAL-${sale.id} completed — ${money(sale.total_amount)}.`
        );

        await renderSales(root);
      } catch (err) {
        notify(err.message, true);
      }
    };
  };
}

/* ==================== REPORTS ==================== */

async function renderReports(root) {
  const [sales, movements] = await Promise.all([
    api('/reports/sales'),
    api('/reports/stock-movements')
  ]);

  root.innerHTML = `
    <div class="welcome">
      <div>
        <h3>Performance reports</h3>
        <p>Recent sales and a traceable history of stock changes.</p>
      </div>
    </div>

    <div class="report-summary">
      <div class="report-chip">
        <small>Revenue (last 30 days)</small>
        ${money(sales.summary.revenue)}
      </div>
      <div class="report-chip">
        <small>Transactions</small>
        ${num(sales.summary.transaction_count)}
      </div>
      <div class="report-chip">
        <small>Discounts</small>
        ${money(sales.summary.discounts)}
      </div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-head">
        <div>
          <h3>Daily sales</h3>
          <p>Last 30 days</p>
        </div>
      </div>

      ${table(
        ['Date', 'Transactions', 'Revenue'],
        sales.daily.map(r => [
          new Date(r.sale_date).toLocaleDateString(),
          num(r.transactions),
          money(r.revenue)
        ])
      )}
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Stock movement ledger</h3>
          <p>Latest 500 inventory changes</p>
        </div>
      </div>

      ${table(
        ['Date', 'Product', 'Warehouse', 'Type', 'Quantity', 'Reference', 'By'],
        movements.map(m => [
          new Date(m.created_at).toLocaleString(),
          esc(m.product_name),
          esc(m.warehouse_name),
          `<span class="pill">${esc(m.movement_type)}</span>`,
          num(m.quantity),
          `${esc(m.reference_type)} ${m.reference_id || ''}`,
          esc(m.performed_by)
        ])
      )}
    </div>`;
}

/* ==================== APPLICATION START ==================== */

if (token && currentUser) {
  showApp();
} else {
  showLogin();
}