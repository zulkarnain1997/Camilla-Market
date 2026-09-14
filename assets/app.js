const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const todayMonth = () => new Date().toISOString().slice(0,7);

let products = [];
let cart = [];

async function api(action, options={}) {
  const res = await fetch(`api.php?action=${encodeURIComponent(action)}`, {
    credentials:'same-origin',
    headers:{'Content-Type':'application/json', ...(options.headers||{})},
    ...options
  });
  const data = await res.json().catch(()=>({ok:false,message:'Response server tidak valid'}));
  if (res.status === 401 && action !== 'me') showLogin();
  if (!res.ok && !data.ok) throw new Error(data.message || 'Terjadi kesalahan');
  return data;
}
function toast(msg){
  const el=$('#toast'); el.textContent=msg; el.classList.remove('hidden');
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.add('hidden'),2600);
}
function showLogin(){ $('#appView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); }
function showApp(user){
  $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
  $('#userInfo').innerHTML=`<b>${escapeHtml(user.name)}</b><br>${escapeHtml(user.role)}`;
  loadDashboard();
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

$('#loginForm').addEventListener('submit', async e=>{
  e.preventDefault(); $('#loginError').textContent='';
  try{
    const data=await api('login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});
    showApp(data.user);
  }catch(err){$('#loginError').textContent=err.message}
});
$('#logoutBtn').addEventListener('click', async()=>{ await api('logout',{method:'POST',body:'{}'}); showLogin(); });

$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
  const p=btn.dataset.page;
  $$('.nav-item').forEach(x=>x.classList.toggle('active',x===btn));
  $$('.page').forEach(x=>x.classList.remove('active'));
  $(`#page-${p}`).classList.add('active');
  $('.sidebar').classList.remove('open');
  if(p==='dashboard')loadDashboard();
  if(p==='cashier')loadCashierProducts();
  if(p==='products')loadProducts();
  if(p==='history')loadHistory();
  if(p==='report')loadReport();
}));
$('#menuBtn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));

async function loadDashboard(){
  const d=await api('dashboard');
  const s=d.summary;
  $('#dashboardCards').innerHTML=`
    <div class="card"><div class="k">Omzet Hari Ini</div><div class="v">${money(s.sales)}</div></div>
    <div class="card"><div class="k">Transaksi Hari Ini</div><div class="v">${s.transactions}</div></div>
    <div class="card"><div class="k">Produk Aktif</div><div class="v">${s.products}</div></div>
    <div class="card warn"><div class="k">Stok Menipis</div><div class="v">${s.low_stock}</div></div>`;

  renderSales7Days(d.charts?.sales_7_days || []);
  renderTopProducts(d.charts?.top_products_month || []);

  $('#recentSales').innerHTML=d.recent.map(x=>`<tr><td>${x.invoice_no}</td><td>${escapeHtml(x.cashier)}</td><td>${money(x.total)}</td><td>${x.created_at}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada transaksi</td></tr>';
}

function renderSales7Days(rows){
  const el=$('#salesChart7Days');
  if(!el) return;

  if(!rows.length){
    el.innerHTML='<div class="chart-empty">Belum ada data penjualan.</div>';
    return;
  }

  const width=760, height=260, padX=52, padTop=22, padBottom=44;
  const plotW=width-padX-18, plotH=height-padTop-padBottom;
  const max=Math.max(...rows.map(r=>Number(r.total||0)),1);
  const points=rows.map((r,i)=>{
    const x=padX+(plotW*(rows.length===1?0.5:i/(rows.length-1)));
    const y=padTop+plotH-(Number(r.total||0)/max)*plotH;
    return {...r,x,y};
  });
  const linePoints=points.map(p=>`${p.x},${p.y}`).join(' ');

  const grid=[0,.25,.5,.75,1].map(v=>{
    const y=padTop+plotH-(v*plotH);
    const val=max*v;
    return `
      <line x1="${padX}" y1="${y}" x2="${width-18}" y2="${y}" class="chart-grid-line"></line>
      <text x="${padX-8}" y="${y+4}" text-anchor="end" class="chart-axis-text">${shortMoney(val)}</text>`;
  }).join('');

  const labels=points.map(p=>`
    <text x="${p.x}" y="${height-18}" text-anchor="middle" class="chart-axis-text">${escapeHtml(p.label)}</text>
  `).join('');

  const circles=points.map(p=>`
    <g class="chart-point">
      <circle cx="${p.x}" cy="${p.y}" r="5"></circle>
      <title>${escapeHtml(p.label)} • ${money(p.total)} • ${p.transactions} transaksi</title>
    </g>
  `).join('');

  el.innerHTML=`
    <div class="chart-kpi">
      <span>Total 7 hari</span>
      <b>${money(rows.reduce((s,r)=>s+Number(r.total||0),0))}</b>
    </div>
    <div class="chart-scroll">
      <svg viewBox="0 0 ${width} ${height}" class="line-chart-svg" role="img" aria-label="Grafik omzet tujuh hari terakhir">
        ${grid}
        <polygon points="${padX},${padTop+plotH} ${linePoints} ${width-18},${padTop+plotH}" class="chart-area"></polygon>
        <polyline points="${linePoints}" class="chart-line"></polyline>
        ${circles}
        ${labels}
      </svg>
    </div>`;
}

function renderTopProducts(rows){
  const el=$('#topProductChart');
  if(!el) return;
  if(!rows.length){
    el.innerHTML='<div class="chart-empty">Belum ada penjualan bulan ini.</div>';
    return;
  }
  const max=Math.max(...rows.map(r=>Number(r.qty||0)),1);
  el.innerHTML=rows.map((r,i)=>{
    const pct=Math.max(4,(Number(r.qty||0)/max)*100);
    return `
      <div class="rank-row">
        <div class="rank-label">
          <span class="rank-no">${i+1}</span>
          <div class="rank-name">
            <b>${escapeHtml(r.name)}</b>
            <small>${r.qty} item • ${money(r.amount)}</small>
          </div>
        </div>
        <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');
}

function shortMoney(value){
  const n=Number(value||0);
  if(n>=1000000000) return 'Rp'+(n/1000000000).toFixed(n>=10000000000?0:1)+'M';
  if(n>=1000000) return 'Rp'+(n/1000000).toFixed(n>=10000000?0:1)+'jt';
  if(n>=1000) return 'Rp'+Math.round(n/1000)+'rb';
  return 'Rp'+Math.round(n);
}

async function loadProducts(){
  const q=$('#productSearch').value.trim();
  const d=await api('products'+(q?`&q=${encodeURIComponent(q)}`:''));
  products=d.data;
  $('#productTable').innerHTML=products.map(p=>`
    <tr>
      <td><b>${escapeHtml(p.barcode||'-')}</b><br><small>${escapeHtml(p.sku||'-')}</small></td>
      <td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category||'-')}</td>
      <td>${money(p.sell_price)}</td>
      <td><span class="badge ${Number(p.stock)<=Number(p.min_stock)?'low':''}">${p.stock}</span></td>
      <td>
        <button class="btn secondary" onclick="editProduct(${p.id})">Edit</button>
        <button class="btn danger" onclick="deleteProduct(${p.id})">Hapus</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6">Produk tidak ditemukan</td></tr>';
}
$('#productSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadProducts()});
$('#addProductBtn').addEventListener('click',()=>openProductModal());
function openProductModal(p=null){
  $('#productModalTitle').textContent=p?'Edit Produk':'Tambah Produk';
  $('#pId').value=p?.id||''; $('#pBarcode').value=p?.barcode||''; $('#pSku').value=p?.sku||'';
  $('#pName').value=p?.name||''; $('#pCategory').value=p?.category||''; $('#pPurchase').value=p?.purchase_price||0;
  $('#pSell').value=p?.sell_price||0; $('#pStock').value=p?.stock||0; $('#pMinStock').value=p?.min_stock||0;
  $('#productModal').classList.remove('hidden');
}
function closeProductModal(){ $('#productModal').classList.add('hidden'); }
function editProduct(id){ const p=products.find(x=>Number(x.id)===Number(id)); if(p)openProductModal(p); }
$('#productForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const payload={id:$('#pId').value,barcode:$('#pBarcode').value,sku:$('#pSku').value,name:$('#pName').value,category:$('#pCategory').value,
    purchase_price:$('#pPurchase').value,sell_price:$('#pSell').value,stock:$('#pStock').value,min_stock:$('#pMinStock').value};
  try{await api('product_save',{method:'POST',body:JSON.stringify(payload)});closeProductModal();toast('Produk berhasil disimpan');loadProducts();}
  catch(err){alert(err.message)}
});
async function deleteProduct(id){
  if(!confirm('Nonaktifkan produk ini?'))return;
  await api('product_delete',{method:'POST',body:JSON.stringify({id})});toast('Produk dinonaktifkan');loadProducts();
}

async function loadCashierProducts(){
  const q=$('#cashierSearch').value.trim();
  const d=await api('products'+(q?`&q=${encodeURIComponent(q)}`:''));
  products=d.data;
  $('#cashierProducts').innerHTML=products.map(p=>`
    <button class="product-card" onclick="addToCart(${p.id})">
      <b>${escapeHtml(p.name)}</b>
      <small>${escapeHtml(p.barcode||p.sku||'Tanpa kode')} • stok ${p.stock}</small>
      <div class="price">${money(p.sell_price)}</div>
    </button>`).join('') || '<p>Produk tidak ditemukan</p>';
}
$('#cashierSearch').addEventListener('keydown', async e=>{
  if(e.key==='Enter'){
    e.preventDefault(); await loadCashierProducts();
    const q=$('#cashierSearch').value.trim().toLowerCase();
    const exact=products.find(p=>(p.barcode||'').toLowerCase()===q || (p.sku||'').toLowerCase()===q);
    if(exact){addToCart(exact.id);$('#cashierSearch').value='';await loadCashierProducts();}
  }
});
function addToCart(id){
  const p=products.find(x=>Number(x.id)===Number(id)); if(!p)return;
  const existing=cart.find(x=>x.id===Number(id));
  if(existing){
    if(existing.qty+1>Number(p.stock))return toast('Stok tidak cukup');
    existing.qty++;
  }else{
    if(Number(p.stock)<=0)return toast('Stok habis');
    cart.push({id:Number(p.id),name:p.name,price:Number(p.sell_price),stock:Number(p.stock),qty:1});
  }
  renderCart();
}
function changeQty(id,delta){
  const item=cart.find(x=>x.id===id);
  if(!item)return;

  let qty=Number(item.qty||0)+Number(delta);

  if(qty<=0){
    cart=cart.filter(x=>x.id!==id);
    renderCart();
    return;
  }

  if(qty>item.stock){
    qty=item.stock;
    toast('Qty maksimal sesuai stok: '+item.stock);
  }

  item.qty=qty;
  renderCart();
}

function renderCart(){
  $('#cartItems').innerHTML=cart.map(i=>`
    <div class="cart-item" data-cart-id="${i.id}">
      <div>
        <b>${escapeHtml(i.name)}</b><br>
        <small>
          ${money(i.price)} ×
          <span id="qtyText-${i.id}">${i.qty}</span>
          =
          <span id="subtotal-${i.id}">${money(i.price*i.qty)}</span>
        </small>
      </div>
      <div class="qty-controls">
        <button type="button" onclick="changeQty(${i.id},-1)">−</button>

        <input
          id="qtyInput-${i.id}"
          class="qty-input"
          type="number"
          inputmode="numeric"
          title="Klik lalu ketik jumlah Qty"
          min="1"
          max="${i.stock}"
          step="1"
          value="${i.qty}"
          onfocus="this.select()"
          oninput="setQtyLive(${i.id}, this)"
          onblur="finalizeQty(${i.id}, this)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
          aria-label="Qty ${escapeHtml(i.name)}">

        <button type="button" onclick="changeQty(${i.id},1)">+</button>
      </div>
    </div>`).join('') || '<p class="muted">Keranjang masih kosong.</p>';

  recalcCartTotal();
}

function setQtyLive(id,input){
  const item=cart.find(x=>x.id===id);
  if(!item)return;

  const raw=String(input.value).trim();

  // Saat field sedang dikosongkan untuk mengetik angka baru,
  // jangan langsung menghapus barang. Nilai sementara dianggap 0.
  if(raw===''){
    item.qty=0;
    updateCartRow(item);
    recalcCartTotal();
    return;
  }

  let qty=Number(raw);

  if(!Number.isFinite(qty)){
    return;
  }

  // Qty minimarket dibuat bilangan bulat.
  qty=Math.floor(qty);

  if(qty<0) qty=0;

  if(qty>item.stock){
    qty=item.stock;
    input.value=qty;
    toast('Qty maksimal sesuai stok: '+item.stock);
  }

  item.qty=qty;
  updateCartRow(item);
  recalcCartTotal();
}

function finalizeQty(id,input){
  const item=cart.find(x=>x.id===id);
  if(!item)return;

  let qty=Number(input.value);

  if(!Number.isFinite(qty) || qty<=0){
    qty=1;
  }

  qty=Math.floor(qty);

  if(qty>item.stock){
    qty=item.stock;
    toast('Qty maksimal sesuai stok: '+item.stock);
  }

  item.qty=qty;
  input.value=qty;
  updateCartRow(item);
  recalcCartTotal();
}

function updateCartRow(item){
  const qtyText=$(`#qtyText-${item.id}`);
  const subtotal=$(`#subtotal-${item.id}`);

  if(qtyText) qtyText.textContent=item.qty;
  if(subtotal) subtotal.textContent=money(item.price*item.qty);
}

function recalcCartTotal(){
  const total=cart.reduce((s,i)=>s+(i.price*Number(i.qty||0)),0);
  $('#cartTotal').textContent=money(total);
  calcChange();
}

function calcChange(){
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0), paid=Number($('#paidInput').value||0);
  $('#changeText').textContent=money(Math.max(0,paid-total));
}
$('#paidInput').addEventListener('input',calcChange);
$('#clearCartBtn').addEventListener('click',()=>{cart=[];$('#paidInput').value='';renderCart()});
$('#payBtn').addEventListener('click',async()=>{
  if(!cart.length)return toast('Keranjang kosong');
  const paid=Number($('#paidInput').value||0), total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  if(paid<total)return toast('Uang bayar kurang');
  try{
    const d=await api('sale_create',{method:'POST',body:JSON.stringify({paid,items:cart.map(i=>({product_id:i.id,qty:i.qty}))})});
    alert(`Transaksi berhasil\nInvoice: ${d.invoice_no}\nTotal: ${money(d.total)}\nKembalian: ${money(d.change)}`);
    cart=[];$('#paidInput').value='';renderCart();loadCashierProducts();
  }catch(err){alert(err.message)}
});

async function loadHistory(){
  const month=$('#historyMonth').value;
  const d=await api('sales'+(month?`&month=${encodeURIComponent(month)}`:''));
  $('#historyTable').innerHTML=d.data.map(x=>`<tr><td>${x.invoice_no}</td><td>${x.created_at}</td><td>${escapeHtml(x.cashier)}</td><td>${money(x.total)}</td><td>${money(x.paid)}</td><td>${money(x.change_amount)}</td></tr>`).join('') || '<tr><td colspan="6">Tidak ada transaksi</td></tr>';
}

async function loadReport(){
  const month=$('#reportMonth').value || todayMonth();
  $('#reportMonth').value=month;
  const d=await api('monthly_report'+`&month=${encodeURIComponent(month)}`);
  const s=d.summary;
  $('#reportCards').innerHTML=`
    <div class="card"><div class="k">Omzet Bulan Ini</div><div class="v">${money(s.sales)}</div></div>
    <div class="card"><div class="k">Jumlah Transaksi</div><div class="v">${s.transactions}</div></div>
    <div class="card"><div class="k">Rata-rata Transaksi</div><div class="v">${money(s.average_transaction)}</div></div>`;
  $('#topProducts').innerHTML=d.top_products.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.qty}</td><td>${money(x.amount)}</td></tr>`).join('') || '<tr><td colspan="3">Belum ada data</td></tr>';
}

$('#historyMonth').value=todayMonth();
$('#reportMonth').value=todayMonth();
renderCart();

(async()=>{
  try{const d=await api('me');showApp(d.user)}
  catch{showLogin()}
})();
