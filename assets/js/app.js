
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const formatRupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

const currentMonth = () => new Date().toISOString().slice(0,7);

const escapeHtml = (value="") => String(value).replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[m]));

let products = [];
let cart = [];
let selectedCategory = "all";
let currentEditingProduct = null;
let currentUser = null;
let users = [];
let currentEditingUser = null;
let currentPermissions = [];
let accessSyncTimer = null;
let accessSyncBusy = false;

const pageMeta = {
  dashboard: ["Dashboard", "Ringkasan aktivitas minimarket hari ini"],
  products: ["Produk & Stok", "Kelola produk dan tambahkan barang ke keranjang"],
  cart: ["Keranjang", "QTY dapat diketik langsung dan total berubah otomatis"],
  history: ["Riwayat", "Daftar transaksi berdasarkan bulan"],
  report: ["Laporan Bulanan", "Ringkasan omzet dan produk terlaris"],
  users: ["Manajemen User", "Atur Administrator dan user kasir"]
};

function isAdmin(){
  return currentUser?.role === "admin";
}

function hasPermission(menuCode){
  if(isAdmin()) return true;
  return currentPermissions.includes(menuCode);
}

function firstAllowedSection(){
  const order = ["dashboard", "products", "cart", "history", "report"];
  return order.find(code => hasPermission(code)) || null;
}

window.getMyMenuAuthorization = function(){
  return {
    user: currentUser,
    permissions: [...currentPermissions],
    firstAllowedSection: firstAllowedSection()
  };
};

function applyRoleUI(){
  const admin = isAdmin();

  // Menu operasional sepenuhnya mengikuti autorisasi.
  ["dashboard", "products", "cart", "history", "report"].forEach(menuCode => {
    const link = document.querySelector(`.side-nav a[data-section="${menuCode}"]`);

    if(link){
      const allowed = hasPermission(menuCode);

      // Bersihkan state lama lalu terapkan permission terbaru.
      link.classList.toggle("hidden", !allowed);
      link.setAttribute("aria-hidden", allowed ? "false" : "true");
    }
  });

  // Menu User tetap hanya Administrator.
  const userLink = document.querySelector('.side-nav a[data-section="users"]');
  if(userLink){
    userLink.classList.toggle("hidden", !admin);
    userLink.setAttribute("aria-hidden", admin ? "false" : "true");
  }

  // Maintenance produk tetap hanya Administrator.
  const addProductButton = $("#addProductBtn");
  if(addProductButton){
    addProductButton.classList.toggle("hidden", !admin);
  }

  // Topbar mengikuti autorisasi.
  const quickCart = $("#quickCartBtn");
  if(quickCart){
    quickCart.classList.toggle("hidden", !hasPermission("cart"));
  }

  const topSearch = $(".top-search");
  if(topSearch){
    topSearch.classList.toggle("hidden", !hasPermission("products"));
  }

  document.body.classList.toggle("role-admin", admin);
  document.body.classList.toggle("role-cashier", !admin);
}


function normalizePermissions(list){
  return [...new Set(Array.isArray(list) ? list : [])].sort();
}

function samePermissions(a, b){
  return JSON.stringify(normalizePermissions(a)) === JSON.stringify(normalizePermissions(b));
}

async function syncCurrentAuthorization({silent=true} = {}){
  if(!currentUser || accessSyncBusy) return;

  accessSyncBusy = true;

  try{
    const data = await api("access_state");
    const nextUser = data.user;
    const nextPermissions = normalizePermissions(data.permissions || []);

    const roleChanged = currentUser?.role !== nextUser?.role;
    const permissionsChanged = !samePermissions(currentPermissions, nextPermissions);
    const identityChanged =
      currentUser?.name !== nextUser?.name ||
      currentUser?.username !== nextUser?.username;

    currentUser = nextUser;
    currentPermissions = nextPermissions;

    $("#userName").textContent = currentUser.name || currentUser.username || "User";
    $("#userRole").textContent = currentUser.role === "admin" ? "Administrator" : "Kasir";
    $("#userAvatar").textContent =
      (currentUser.name || currentUser.username || "U").charAt(0).toUpperCase();

    applyRoleUI();

    const activeSection = document.querySelector(".page-section.active")?.id || null;

    // Jika menu yang sedang dibuka dicabut oleh admin, langsung pindahkan
    // ke menu pertama yang masih diizinkan.
    if(
      activeSection &&
      activeSection !== "users" &&
      !hasPermission(activeSection)
    ){
      const fallback = firstAllowedSection();

      if(fallback){
        showSection(fallback);
      }else{
        $$(".page-section").forEach(section => section.classList.remove("active"));
        $("#pageTitle").textContent = "Tidak Ada Akses";
        $("#pageSubtitle").textContent =
          "Hubungi Administrator untuk mendapatkan autorisasi menu.";
      }
    }

    // User menu hanya untuk admin. Kalau role admin dicabut saat menu User aktif.
    if(activeSection === "users" && !isAdmin()){
      const fallback = firstAllowedSection();

      if(fallback){
        showSection(fallback);
      }
    }

    if((roleChanged || permissionsChanged || identityChanged) && !silent){
      showToast("Hak akses Anda telah diperbarui.");
    }else if((roleChanged || permissionsChanged) && silent){
      showToast("Autoriasi menu diperbarui.");
    }

  }catch(error){
    // 401 akan ditangani api() -> showLogin().
    // Error jaringan sementara tidak perlu memutus penggunaan aplikasi.
    if(!silent && error?.message){
      showToast(error.message);
    }
  }finally{
    accessSyncBusy = false;
  }
}

function startAccessSync(){
  if(accessSyncTimer){
    clearInterval(accessSyncTimer);
  }

  // Sinkron setiap 4 detik agar perubahan dari Admin cepat terlihat
  // tanpa perlu logout/login.
  accessSyncTimer = setInterval(() => {
    if(document.visibilityState === "visible"){
      syncCurrentAuthorization({silent:true});
    }
  }, 4000);
}

function stopAccessSync(){
  if(accessSyncTimer){
    clearInterval(accessSyncTimer);
    accessSyncTimer = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && currentUser){
    syncCurrentAuthorization({silent:true});
  }
});

window.addEventListener("focus", () => {
  if(currentUser){
    syncCurrentAuthorization({silent:true});
  }
});

function categoryIcon(category=""){
  const c = String(category).toLowerCase();
  if(c.includes("minum")) return "🥤";
  if(c.includes("makan")) return "🍜";
  if(c.includes("snack") || c.includes("camil")) return "🍪";
  if(c.includes("sembako")) return "🛍️";
  if(c.includes("kebers")) return "🧴";
  if(c.includes("rokok")) return "📦";
  return "🛒";
}

async function api(action, options={}){
  // action dapat berisi query tambahan, contoh:
  // sales&month=2026-09 atau products&q=kopi.
  // Hanya nama action yang di-encode; query parameter harus tetap menjadi
  // parameter URL terpisah agar dapat dibaca oleh $_GET di PHP.
  const parts = String(action).split("&");
  const actionName = parts.shift() || "";
  const extraQuery = parts.length ? "&" + parts.join("&") : "";
  const url = `api.php?action=${encodeURIComponent(actionName)}${extraQuery}`;

  const requestOptions = {...options};
  const isFormData = requestOptions.body instanceof FormData;

  requestOptions.headers = isFormData
    ? {...(options.headers || {})}
    : {"Content-Type":"application/json", ...(options.headers || {})};

  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...requestOptions
  });

  const data = await response.json().catch(() => ({
    ok:false,
    message:"Response server tidak valid."
  }));

  if(response.status === 401 && actionName !== "me"){
    showLogin();
  }

  if(response.status === 403 && currentUser && actionName !== "access_state"){
    setTimeout(() => {
      syncCurrentAuthorization({silent:true});
    }, 0);
  }

  if(!response.ok || data.ok === false){
    throw new Error(data.message || "Terjadi kesalahan.");
  }

  return data;
}

function showToast(message){
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function showLogin(){
  stopAccessSync();
  currentUser = null;
  currentPermissions = [];

  $("#appView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
}

function showApp(user, permissions=[]){
  currentUser = user;
  currentPermissions = Array.isArray(permissions) ? permissions : [];

  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");

  $("#userName").textContent = user.name || user.username || "User";
  $("#userRole").textContent = user.role === "admin" ? "Administrator" : "Kasir";
  $("#userAvatar").textContent = (user.name || user.username || "U").charAt(0).toUpperCase();

  applyRoleUI();

  // Permission dari login/me adalah sumber utama menu yang tampil.
  currentPermissions = normalizePermissions(currentPermissions);
  applyRoleUI();

  const home = firstAllowedSection();

  if(home){
    showSection(home);
  }else{
    // User tanpa menu akan tetap masuk, tetapi tidak bisa membuka fitur operasional.
    $$(".page-section").forEach(section => section.classList.remove("active"));
    $("#pageTitle").textContent = "Tidak Ada Akses";
    $("#pageSubtitle").textContent = "Hubungi Administrator untuk mendapatkan autorisasi menu.";
  }

  if(hasPermission("products")){
    loadProducts();
  }

  startAccessSync();
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginError").textContent = "";

  try{
    const data = await api("login", {
      method:"POST",
      body:JSON.stringify({
        username:$("#username").value.trim(),
        password:$("#password").value
      })
    });

    showApp(data.user, data.permissions || []);
  }catch(error){
    $("#loginError").textContent = error.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  try{
    await api("logout", {method:"POST", body:"{}"});
  }catch(_){}
  cart = [];
  saveCart();
  showLogin();
});

function showSection(id){
  if(id === "users" && !isAdmin()){
    id = firstAllowedSection();
  }

  if(id !== "users" && !hasPermission(id)){
    id = firstAllowedSection();
  }

  if(!id){
    return;
  }

  $$(".page-section").forEach(section => section.classList.remove("active"));
  const target = document.getElementById(id);
  if(target) target.classList.add("active");

  $$(".side-nav a").forEach(link => {
    link.classList.toggle("active", link.dataset.section === id);
  });

  const meta = pageMeta[id] || ["Camilla Market", ""];
  $("#pageTitle").textContent = meta[0];
  $("#pageSubtitle").textContent = meta[1];
  $("#sidebar").classList.remove("open");
  document.body.classList.remove("drawer-open");

  if(id === "dashboard") loadDashboard();
  if(id === "products") loadProducts();
  if(id === "cart") renderCart();
  if(id === "history") loadHistory();
  if(id === "report") loadReport();
  if(id === "users") loadUsers();

  window.scrollTo({top:0, behavior:"smooth"});
}

window.showSection = showSection;

$$(".side-nav a").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    showSection(link.dataset.section);
  });
});

function openMobileDrawer(){
  $("#sidebar").classList.add("open");
  document.body.classList.add("drawer-open");
}

function closeMobileDrawer(){
  $("#sidebar").classList.remove("open");
  document.body.classList.remove("drawer-open");
}

function toggleMobileDrawer(){
  if($("#sidebar").classList.contains("open")){
    closeMobileDrawer();
  }else{
    openMobileDrawer();
  }
}

$("#menuBtn").addEventListener("click", toggleMobileDrawer);

$("#mobileDrawerOverlay").addEventListener("click", closeMobileDrawer);


$("#quickCartBtn").addEventListener("click", () => {
  if(hasPermission("cart")){
    showSection("cart");
  }else{
    showToast("Anda tidak memiliki autorisasi menu Keranjang.");
  }
});

/* ---------------- MOBILE SWIPE DRAWER ---------------- */
let drawerTouchStartX = 0;
let drawerTouchStartY = 0;
let drawerTouchLastX = 0;
let drawerGestureActive = false;

function isMobileDrawerMode(){
  return window.matchMedia("(max-width: 980px)").matches;
}

function startDrawerGesture(event){
  if(!isMobileDrawerMode()) return;
  const touch = event.touches?.[0];
  if(!touch) return;

  drawerTouchStartX = touch.clientX;
  drawerTouchStartY = touch.clientY;
  drawerTouchLastX = touch.clientX;
  drawerGestureActive = true;
}

function moveDrawerGesture(event){
  if(!drawerGestureActive || !isMobileDrawerMode()) return;
  const touch = event.touches?.[0];
  if(!touch) return;
  drawerTouchLastX = touch.clientX;
}

function endDrawerGesture(event){
  if(!drawerGestureActive || !isMobileDrawerMode()) return;

  const touch = event.changedTouches?.[0];
  if(touch) drawerTouchLastX = touch.clientX;

  const deltaX = drawerTouchLastX - drawerTouchStartX;
  const deltaY = Math.abs((touch?.clientY ?? drawerTouchStartY) - drawerTouchStartY);

  drawerGestureActive = false;

  // Abaikan gesture vertikal / scroll.
  if(deltaY > 70) return;

  const sidebarOpen = $("#sidebar").classList.contains("open");

  if(!sidebarOpen && deltaX > 65){
    openMobileDrawer();
  }else if(sidebarOpen && deltaX < -65){
    closeMobileDrawer();
  }
}

// Swipe dari edge kiri untuk membuka drawer.
$("#mobileSwipeEdge").addEventListener("touchstart", startDrawerGesture, {passive:true});
$("#mobileSwipeEdge").addEventListener("touchmove", moveDrawerGesture, {passive:true});
$("#mobileSwipeEdge").addEventListener("touchend", endDrawerGesture, {passive:true});

// Saat drawer terbuka, swipe ke kiri pada drawer untuk menutup.
$("#sidebar").addEventListener("touchstart", startDrawerGesture, {passive:true});
$("#sidebar").addEventListener("touchmove", moveDrawerGesture, {passive:true});
$("#sidebar").addEventListener("touchend", endDrawerGesture, {passive:true});

// Jika device diputar / ukuran layar membesar, bersihkan state drawer mobile.
window.addEventListener("resize", () => {
  if(!isMobileDrawerMode()){
    closeMobileDrawer();
  }
});


$("#globalSearch").addEventListener("keydown", event => {
  if(event.key === "Enter"){
    event.preventDefault();

    if(!hasPermission("products")){
      showToast("Anda tidak memiliki autorisasi menu Produk & Stok.");
      return;
    }

    $("#productSearch").value = event.target.value;
    showSection("products");
  }
});

/* ---------------- DASHBOARD ---------------- */

async function loadDashboard(){
  try{
    const data = await api("dashboard");
    const summary = data.summary || {};

    $("#salesToday").textContent = formatRupiah(summary.sales);
    $("#transactionCount").textContent = summary.transactions || 0;
    $("#productCount").textContent = summary.products || 0;
    $("#lowStockCount").textContent = summary.low_stock || 0;

    renderSalesChart(data.charts?.sales_7_days || []);
    renderBestProducts(data.charts?.top_products_month || []);

    $("#recentSales").innerHTML = (data.recent || []).map(row => `
      <tr>
        <td><strong>${escapeHtml(row.invoice_no)}</strong></td>
        <td>${escapeHtml(row.cashier)}</td>
        <td>${formatRupiah(row.total)}</td>
        <td>${escapeHtml(row.created_at)}</td>
      </tr>
    `).join("") || `<tr><td colspan="4">Belum ada transaksi.</td></tr>`;
  }catch(error){
    showToast(error.message);
  }
}

function renderSalesChart(rows){
  const chart = $("#salesChart");

  if(!rows.length){
    chart.innerHTML = `<div class="chart-empty">Belum ada data penjualan.</div>`;
    return;
  }

  const max = Math.max(...rows.map(row => Number(row.total || 0)), 1);

  chart.innerHTML = rows.map(row => {
    const total = Number(row.total || 0);
    const height = Math.max(4, (total / max) * 100);

    return `
      <div class="chart-col">
        <div class="chart-bar-wrap">
          <div
            class="chart-bar"
            style="height:${height}%"
            data-value="${escapeHtml(formatRupiah(total))}"
            title="${escapeHtml(row.label)} - ${escapeHtml(formatRupiah(total))}">
          </div>
        </div>
        <span class="chart-label">${escapeHtml(row.label)}</span>
      </div>
    `;
  }).join("");
}

function renderBestProducts(rows){
  const box = $("#bestProducts");

  if(!rows.length){
    box.innerHTML = `<div class="empty-state" style="padding:28px 10px"><p>Belum ada penjualan bulan ini.</p></div>`;
    return;
  }

  box.innerHTML = rows.map((row, index) => `
    <div class="best-item">
      <div class="product-mini-icon">${categoryIcon(row.category || "")}</div>
      <div class="best-item-main">
        <strong>${index + 1}. ${escapeHtml(row.name)}</strong>
        <span>${Number(row.qty || 0)} item terjual</span>
      </div>
      <b>${formatRupiah(row.amount)}</b>
    </div>
  `).join("");
}

$("#refreshDashboardBtn").addEventListener("click", loadDashboard);

/* ---------------- PRODUCTS ---------------- */

async function loadProducts(){
  try{
    const query = $("#productSearch").value.trim();
    const data = await api("products" + (query ? `&q=${encodeURIComponent(query)}` : ""));

    products = data.data || [];
    buildCategories();
    renderProducts();
  }catch(error){
    showToast(error.message);
  }
}

function buildCategories(){
  const categories = [...new Set(products.map(item => item.category).filter(Boolean))].sort();

  const select = $("#categoryFilter");
  const current = select.value || "all";
  select.innerHTML = `<option value="all">Semua Kategori</option>` +
    categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");

  if(categories.includes(current)) select.value = current;
  else select.value = "all";

  selectedCategory = select.value;

  $("#categoryChips").innerHTML = ["all", ...categories].map(category => `
    <button
      class="category-chip ${category === selectedCategory ? "active" : ""}"
      data-category="${escapeHtml(category)}">
      ${category === "all" ? "Semua" : escapeHtml(category)}
    </button>
  `).join("");

  $$(".category-chip").forEach(button => {
    button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      $("#categoryFilter").value = selectedCategory;
      $$(".category-chip").forEach(item => item.classList.toggle("active", item === button));
      renderProducts();
    });
  });
}

function renderProducts(){
  const query = $("#productSearch").value.trim().toLowerCase();

  const filtered = products.filter(product => {
    const text = `${product.name || ""} ${product.barcode || ""} ${product.sku || ""}`.toLowerCase();
    const searchMatch = text.includes(query);
    const categoryMatch = selectedCategory === "all" || product.category === selectedCategory;
    return searchMatch && categoryMatch;
  });

  const grid = $("#productGrid");

  if(!filtered.length){
    grid.innerHTML = `<div class="no-result">Produk tidak ditemukan.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(product => `
    <article class="product-card">
      <div class="product-image ${product.image_path ? "has-photo" : ""}">
        ${
          product.image_path
            ? `<img
                 src="${escapeHtml(product.image_path)}?v=${encodeURIComponent(product.updated_at || "")}"
                 alt="${escapeHtml(product.name)}"
                 loading="lazy"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
               <span class="product-image-fallback" style="display:none">${categoryIcon(product.category)}</span>`
            : `<span class="product-image-fallback">${categoryIcon(product.category)}</span>`
        }

        <span class="stock-label ${Number(product.stock) <= Number(product.min_stock) ? "low" : ""}">
          Stok ${Number(product.stock)}
        </span>
      </div>

      <div class="product-body">
        <span class="product-category">${escapeHtml(product.category || "Lainnya")}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <span class="product-code">${escapeHtml(product.barcode || product.sku || "Tanpa kode")}</span>

        <div class="product-price-row">
          <span class="product-price">${formatRupiah(product.sell_price)}</span>
          <div class="product-actions">
            ${isAdmin()
              ? `<button class="edit-product" onclick="openProductModal(${Number(product.id)})">Edit</button>`
              : ""
            }
            <button class="add-cart" onclick="addToCart(${Number(product.id)})" title="Tambah ke keranjang">+</button>
          </div>
        </div>
      </div>
    </article>
  `).join("");
}

$("#productSearch").addEventListener("input", renderProducts);
$("#productSearch").addEventListener("keydown", event => {
  if(event.key === "Enter"){
    event.preventDefault();
    const query = event.target.value.trim().toLowerCase();
    const exact = products.find(product =>
      String(product.barcode || "").toLowerCase() === query ||
      String(product.sku || "").toLowerCase() === query
    );

    if(exact){
      addToCart(Number(exact.id));
      event.target.value = "";
      renderProducts();
      showToast(`${exact.name} ditambahkan ke keranjang.`);
    }
  }
});

$("#categoryFilter").addEventListener("change", event => {
  selectedCategory = event.target.value;
  $$(".category-chip").forEach(button => {
    button.classList.toggle("active", button.dataset.category === selectedCategory);
  });
  renderProducts();
});

$("#addProductBtn").addEventListener("click", () => openProductModal());

function openProductModal(productId=null){
  if(!isAdmin()){
    showToast("Akses hanya untuk Administrator.");
    return;
  }

  const product = productId ? products.find(item => Number(item.id) === Number(productId)) : null;
  currentEditingProduct = product || null;

  $("#productModalTitle").textContent = product ? "Edit Produk" : "Tambah Produk";
  $("#pId").value = product?.id || "";
  $("#pBarcode").value = product?.barcode || "";
  $("#pSku").value = product?.sku || "";
  $("#pName").value = product?.name || "";
  $("#pCategory").value = product?.category || "";
  $("#pPurchase").value = product?.purchase_price || 0;
  $("#pSell").value = product?.sell_price || 0;
  $("#pStock").value = product?.stock || 0;
  $("#pMinStock").value = product?.min_stock || 0;
  $("#pImage").value = "";
  renderProductImagePreview(product?.image_path || "");
  $("#deleteProductBtn").classList.toggle("hidden", !product);

  $("#productModal").classList.add("active");
  document.body.classList.add("modal-open");
}

window.openProductModal = openProductModal;

function renderProductImagePreview(src=""){
  const preview = $("#productImagePreview");

  if(src){
    preview.innerHTML = `<img src="${escapeHtml(src)}" alt="Preview gambar produk">`;
  }else{
    preview.innerHTML = `<span>📷</span>`;
  }
}

$("#pImage").addEventListener("change", event => {
  const file = event.target.files?.[0];

  if(!file){
    renderProductImagePreview(currentEditingProduct?.image_path || "");
    return;
  }

  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if(!allowed.includes(file.type)){
    event.target.value = "";
    alert("Format gambar harus JPG, PNG, atau WEBP.");
    renderProductImagePreview(currentEditingProduct?.image_path || "");
    return;
  }

  if(file.size > 5 * 1024 * 1024){
    event.target.value = "";
    alert("Ukuran gambar maksimal 5 MB.");
    renderProductImagePreview(currentEditingProduct?.image_path || "");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => renderProductImagePreview(reader.result);
  reader.readAsDataURL(file);
});

function closeProductModal(){
  $("#productModal").classList.remove("active");
  document.body.classList.remove("modal-open");
  currentEditingProduct = null;
}

$("#closeProductModal").addEventListener("click", closeProductModal);
$("#cancelProductBtn").addEventListener("click", closeProductModal);

$("#productForm").addEventListener("submit", async event => {
  event.preventDefault();

  const formData = new FormData();
  formData.append("id", $("#pId").value);
  formData.append("barcode", $("#pBarcode").value.trim());
  formData.append("sku", $("#pSku").value.trim());
  formData.append("name", $("#pName").value.trim());
  formData.append("category", $("#pCategory").value.trim());
  formData.append("purchase_price", Number($("#pPurchase").value || 0));
  formData.append("sell_price", Number($("#pSell").value || 0));
  formData.append("stock", Number($("#pStock").value || 0));
  formData.append("min_stock", Number($("#pMinStock").value || 0));

  const imageFile = $("#pImage").files?.[0];
  if(imageFile){
    formData.append("image", imageFile);
  }

  try{
    await api("product_save", {
      method:"POST",
      body:formData
    });

    closeProductModal();
    await loadProducts();
    await loadDashboard();
    showToast("Produk berhasil disimpan.");
  }catch(error){
    alert(error.message);
  }
});

$("#deleteProductBtn").addEventListener("click", async () => {
  if(!currentEditingProduct) return;
  if(!confirm(`Hapus/nonaktifkan produk "${currentEditingProduct.name}"?`)) return;

  try{
    await api("product_delete", {
      method:"POST",
      body:JSON.stringify({id:currentEditingProduct.id})
    });

    cart = cart.filter(item => Number(item.id) !== Number(currentEditingProduct.id));
    saveCart();
    closeProductModal();
    await loadProducts();
    await loadDashboard();
    showToast("Produk dinonaktifkan.");
  }catch(error){
    alert(error.message);
  }
});


/* ---------------- USERS / ROLE ---------------- */

async function loadUsers(){
  if(!isAdmin()) return;

  try{
    const data = await api("users");
    users = data.data || [];
    renderUsers();
  }catch(error){
    showToast(error.message);
  }
}

function roleLabel(role){
  return role === "admin" ? "Administrator" : "Kasir / Non-Admin";
}

function renderUsers(){
  const tbody = $("#userTableBody");
  const empty = $("#emptyUsers");

  if(!tbody) return;

  tbody.innerHTML = users.map(user => `
    <tr>
      <td>
        <div class="user-list-name">
          <div class="avatar">${escapeHtml((user.name || user.username || "U").charAt(0).toUpperCase())}</div>
          <strong>${escapeHtml(user.name)}</strong>
        </div>
      </td>
      <td>${escapeHtml(user.username)}</td>
      <td>
        <span class="role-badge ${user.role === "admin" ? "admin" : "cashier"}">
          ${roleLabel(user.role)}
        </span>
      </td>
      <td>${escapeHtml(user.created_at || "-")}</td>
      <td class="user-action-cell">
        <button class="edit-product" onclick="openUserModal(${Number(user.id)})">Edit</button>
      </td>
    </tr>
  `).join("");

  empty.style.display = users.length ? "none" : "block";
}

function openUserModal(userId=null){
  if(!isAdmin()){
    showToast("Akses hanya untuk Administrator.");
    return;
  }

  const user = userId
    ? users.find(item => Number(item.id) === Number(userId))
    : null;

  currentEditingUser = user || null;

  $("#userModalTitle").textContent = user ? "Edit User" : "Tambah User";
  $("#uId").value = user?.id || "";
  $("#uName").value = user?.name || "";
  $("#uUsername").value = user?.username || "";
  $("#uRole").value = user?.role === "admin" ? "admin" : "cashier";
  $("#uPassword").value = "";

  const userPerms = user?.permissions || ["products", "cart"];
  $$(".uPermission").forEach(input => {
    input.checked = user?.role === "admin" ? true : userPerms.includes(input.value);
    input.disabled = user?.role === "admin";
  });

  $("#permissionHelp").textContent = user?.role === "admin"
    ? "Administrator otomatis memiliki semua akses menu."
    : "Pilih menu yang boleh ditampilkan untuk user ini.";

  $("#userPasswordHelp").textContent = user
    ? "Kosongkan jika password tidak ingin diubah."
    : "Password user baru minimal 6 karakter.";

  $("#deleteUserBtn").classList.toggle("hidden", !user);

  $("#userModal").classList.add("active");
  document.body.classList.add("modal-open");
}

window.openUserModal = openUserModal;

function closeUserModal(){
  $("#userModal").classList.remove("active");
  document.body.classList.remove("modal-open");
  currentEditingUser = null;
}

$("#addUserBtn")?.addEventListener("click", () => openUserModal());
$("#closeUserModal")?.addEventListener("click", closeUserModal);
$("#cancelUserBtn")?.addEventListener("click", closeUserModal);

$("#uRole")?.addEventListener("change", event => {
  const admin = event.target.value === "admin";

  $$(".uPermission").forEach(input => {
    input.disabled = admin;
    if(admin) input.checked = true;
  });

  $("#permissionHelp").textContent = admin
    ? "Administrator otomatis memiliki semua akses menu."
    : "Pilih menu yang boleh ditampilkan untuk user ini.";
});

$("#userForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if(!isAdmin()) return;

  const payload = {
    id: $("#uId").value,
    name: $("#uName").value.trim(),
    username: $("#uUsername").value.trim(),
    role: $("#uRole").value,
    password: $("#uPassword").value,
    permissions: $$(".uPermission")
      .filter(input => input.checked)
      .map(input => input.value)
  };

  try{
    await api("user_save", {
      method:"POST",
      body:JSON.stringify(payload)
    });

    closeUserModal();

    // Jika admin mengubah dirinya sendiri, refresh session user.
    const me = await api("me");
    currentUser = me.user;
    currentPermissions = me.permissions || [];
    $("#userName").textContent = currentUser.name || currentUser.username;
    $("#userRole").textContent = currentUser.role === "admin" ? "Administrator" : "Kasir";
    applyRoleUI();

    if(!isAdmin()){
      const home = firstAllowedSection();
      if(home) showSection(home);
      showToast("Role/autoriasi Anda telah diperbarui.");
      return;
    }

    await loadUsers();
    showToast("User & autorisasi menu berhasil disimpan.");
  }catch(error){
    alert(error.message);
  }
});

$("#deleteUserBtn")?.addEventListener("click", async () => {
  if(!isAdmin() || !currentEditingUser) return;

  if(!confirm(`Hapus user "${currentEditingUser.name}"?`)){
    return;
  }

  try{
    await api("user_delete", {
      method:"POST",
      body:JSON.stringify({id:currentEditingUser.id})
    });

    closeUserModal();
    await loadUsers();
    showToast("User berhasil dihapus.");
  }catch(error){
    alert(error.message);
  }
});


/* ---------------- CART ---------------- */

function saveCart(){
  localStorage.setItem("camilla_market_cart", JSON.stringify(cart));
  updateCartCounter();
}

function restoreCart(){
  try{
    const saved = JSON.parse(localStorage.getItem("camilla_market_cart") || "[]");
    cart = Array.isArray(saved) ? saved : [];
  }catch(_){
    cart = [];
  }
  updateCartCounter();
}

function addToCart(productId){
  const product = products.find(item => Number(item.id) === Number(productId));
  if(!product) return;

  if(Number(product.stock) <= 0){
    showToast("Stok produk habis.");
    return;
  }

  const existing = cart.find(item => Number(item.id) === Number(productId));

  if(existing){
    if(Number(existing.qty) >= Number(product.stock)){
      showToast("Qty sudah mencapai stok tersedia.");
      return;
    }
    existing.qty = Number(existing.qty) + 1;
    existing.stock = Number(product.stock);
    existing.price = Number(product.sell_price);
  }else{
    cart.push({
      id:Number(product.id),
      name:product.name,
      category:product.category || "",
      price:Number(product.sell_price),
      stock:Number(product.stock),
      qty:1
    });
  }

  saveCart();
  renderCart();
}

window.addToCart = addToCart;

function updateCartCounter(){
  const count = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  $("#sideCartCount").textContent = count;
  $("#topCartCount").textContent = count;
}

function cartTotal(){
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function updateCartSummary(){
  const total = cartTotal();
  const itemCount = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const paid = Number($("#paidInput").value || 0);
  const change = Math.max(0, paid - total);

  $("#cartItemCount").textContent = itemCount;
  $("#cartTotal").textContent = formatRupiah(total);
  $("#changeText").textContent = formatRupiah(change);

  return {total, paid, change, itemCount};
}

function changeQty(productId, delta){
  const item = cart.find(entry => Number(entry.id) === Number(productId));
  if(!item) return;

  let qty = Number(item.qty || 0) + Number(delta);

  if(qty <= 0){
    removeCartItem(productId);
    return;
  }

  if(qty > Number(item.stock)){
    qty = Number(item.stock);
    showToast(`Qty maksimal sesuai stok: ${item.stock}`);
  }

  item.qty = qty;
  saveCart();
  renderCart();
}

window.changeQty = changeQty;

function setQtyLive(productId, input){
  const item = cart.find(entry => Number(entry.id) === Number(productId));
  if(!item) return;

  const raw = String(input.value).trim();

  if(raw === ""){
    item.qty = 0;
  }else{
    let qty = Math.floor(Number(raw));
    if(!Number.isFinite(qty)) return;
    if(qty < 0) qty = 0;
    if(qty > Number(item.stock)){
      qty = Number(item.stock);
      input.value = qty;
      showToast(`Qty maksimal sesuai stok: ${item.stock}`);
    }
    item.qty = qty;
  }

  const subtotal = document.querySelector(`.subtotal-cell[data-id="${productId}"] strong`);
  if(subtotal){
    subtotal.textContent = formatRupiah(Number(item.price) * Number(item.qty || 0));
  }

  saveCart();
  updateCartSummary();
}

window.setQtyLive = setQtyLive;

function finalizeQty(productId, input){
  const item = cart.find(entry => Number(entry.id) === Number(productId));
  if(!item) return;

  let qty = Math.floor(Number(input.value));
  if(!Number.isFinite(qty) || qty < 1) qty = 1;

  if(qty > Number(item.stock)){
    qty = Number(item.stock);
    showToast(`Qty maksimal sesuai stok: ${item.stock}`);
  }

  item.qty = qty;
  input.value = qty;
  saveCart();

  const subtotal = document.querySelector(`.subtotal-cell[data-id="${productId}"] strong`);
  if(subtotal){
    subtotal.textContent = formatRupiah(Number(item.price) * qty);
  }

  updateCartSummary();
}

window.finalizeQty = finalizeQty;

function removeCartItem(productId){
  cart = cart.filter(item => Number(item.id) !== Number(productId));
  saveCart();
  renderCart();
}

window.removeCartItem = removeCartItem;

function renderCart(){
  const tbody = $("#cartTableBody");
  const empty = $("#emptyCart");

  if(!cart.length){
    tbody.innerHTML = "";
    empty.style.display = "block";
  }else{
    empty.style.display = "none";

    tbody.innerHTML = cart.map(item => `
      <tr>
        <td>
          <div class="cart-product">
            <div class="cart-product-icon">${categoryIcon(item.category)}</div>
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.category || "Lainnya")} • stok ${Number(item.stock)}</span>
            </div>
          </div>
        </td>

        <td>${formatRupiah(item.price)}</td>

        <td>
          <div class="qty-control">
            <button type="button" onclick="changeQty(${Number(item.id)}, -1)">−</button>
            <input
              type="number"
              inputmode="numeric"
              min="1"
              max="${Number(item.stock)}"
              step="1"
              value="${Number(item.qty)}"
              onfocus="this.select()"
              oninput="setQtyLive(${Number(item.id)}, this)"
              onblur="finalizeQty(${Number(item.id)}, this)"
              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
            <button type="button" onclick="changeQty(${Number(item.id)}, 1)">+</button>
          </div>
        </td>

        <td class="subtotal-cell" data-id="${Number(item.id)}">
          <strong>${formatRupiah(Number(item.price) * Number(item.qty))}</strong>
        </td>

        <td>
          <button class="remove-item" type="button" onclick="removeCartItem(${Number(item.id)})">✕</button>
        </td>
      </tr>
    `).join("");
  }

  updateCartCounter();
  updateCartSummary();
}

$("#paidInput").addEventListener("input", updateCartSummary);

$("#clearCartBtn").addEventListener("click", () => {
  if(!cart.length) return;
  if(confirm("Kosongkan semua isi keranjang?")){
    cart = [];
    saveCart();
    $("#paidInput").value = 0;
    renderCart();
  }
});

$("#checkoutBtn").addEventListener("click", async () => {
  if(!cart.length){
    showToast("Keranjang masih kosong.");
    return;
  }

  const summary = updateCartSummary();

  if(summary.paid < summary.total){
    showToast("Uang bayar masih kurang.");
    return;
  }

  const invalid = cart.find(item =>
    Number(item.qty) <= 0 || Number(item.qty) > Number(item.stock)
  );

  if(invalid){
    showToast(`Periksa QTY ${invalid.name}.`);
    return;
  }

  try{
    const data = await api("sale_create", {
      method:"POST",
      body:JSON.stringify({
        paid:summary.paid,
        items:cart.map(item => ({
          product_id:Number(item.id),
          qty:Number(item.qty)
        }))
      })
    });

    $("#checkoutMessage").textContent = "Pembayaran berhasil disimpan ke database.";
    $("#receiptBox").innerHTML = `
      <div><strong>No. Transaksi:</strong> ${escapeHtml(data.invoice_no)}</div>
      <div><strong>Total:</strong> ${formatRupiah(data.total)}</div>
      <div><strong>Bayar:</strong> ${formatRupiah(data.paid)}</div>
      <div><strong>Kembalian:</strong> ${formatRupiah(data.change)}</div>
    `;

    cart = [];
    saveCart();
    $("#paidInput").value = 0;
    renderCart();

    await loadProducts();
    await loadDashboard();

    $("#checkoutModal").classList.add("active");
  }catch(error){
    alert(error.message);
  }
});

$("#closeCheckoutModal").addEventListener("click", () => {
  $("#checkoutModal").classList.remove("active");
  document.body.classList.remove("modal-open");
});

/* ---------------- HISTORY ---------------- */

async function loadHistory(){
  const list = $("#historyList");
  const empty = $("#emptyHistory");

  try{
    const month = $("#historyMonth").value;

    // Hindari tampilan "Belum ada transaksi" ketika request masih berjalan.
    empty.style.display = "none";
    list.innerHTML = `
      <div style="padding:22px;text-align:center;color:var(--muted);font-size:12px">
        Memuat riwayat transaksi...
      </div>`;

    const data = await api("sales" + (month ? `&month=${encodeURIComponent(month)}` : ""));
    const rows = data.data || [];

    list.innerHTML = rows.map(row => `
      <article class="history-item">
        <div>
          <strong>${escapeHtml(row.invoice_no)}</strong>
          <span>${escapeHtml(row.created_at)} • Kasir ${escapeHtml(row.cashier)}</span>
        </div>
        <div class="history-total">
          <b>${formatRupiah(row.total)}</b>
          <span>Bayar ${formatRupiah(row.paid)} • Kembali ${formatRupiah(row.change_amount)}</span>
        </div>
      </article>
    `).join("");

    empty.style.display = rows.length ? "none" : "block";
  }catch(error){
    list.innerHTML = "";
    empty.style.display = "block";
    showToast(error.message);
  }
}

$("#historyFilterBtn").addEventListener("click", loadHistory);

/* ---------------- REPORT ---------------- */

async function loadReport(){
  try{
    const month = $("#reportMonth").value || currentMonth();
    $("#reportMonth").value = month;

    const data = await api(`monthly_report&month=${encodeURIComponent(month)}`);
    const summary = data.summary || {};

    $("#reportSales").textContent = formatRupiah(summary.sales);
    $("#reportTransactions").textContent = summary.transactions || 0;
    $("#reportAverage").textContent = formatRupiah(summary.average_transaction);

    $("#reportProducts").innerHTML = (data.top_products || []).map(row => `
      <tr>
        <td><strong>${escapeHtml(row.name)}</strong></td>
        <td>${Number(row.qty || 0)}</td>
        <td>${formatRupiah(row.amount)}</td>
      </tr>
    `).join("") || `<tr><td colspan="3">Belum ada data pada bulan ini.</td></tr>`;
  }catch(error){
    showToast(error.message);
  }
}

$("#reportFilterBtn").addEventListener("click", loadReport);


/* ---------------- MOBILE PULL TO REFRESH ---------------- */
let pullStartY = 0;
let pullStartX = 0;
let pullDistance = 0;
let pullActive = false;
let pullRefreshing = false;

const PULL_THRESHOLD = 75;

function isPullRefreshMobile(){
  return window.matchMedia("(max-width: 980px)").matches;
}

function getActiveSectionId(){
  return document.querySelector(".page-section.active")?.id || "dashboard";
}

async function refreshCurrentSection(){
  await syncCurrentAuthorization({silent:true});
  const section = getActiveSectionId();

  if(section === "dashboard" && hasPermission("dashboard")){
    await loadDashboard();
  }else if(section === "products" && hasPermission("products")){
    await loadProducts();
  }else if(section === "cart" && hasPermission("cart")){
    if(hasPermission("products")){
      await loadProducts();

      cart = cart.map(item => {
        const latest = products.find(product => Number(product.id) === Number(item.id));

        if(!latest) return item;

        return {
          ...item,
          price:Number(latest.sell_price),
          stock:Number(latest.stock),
          qty:Math.min(Number(item.qty || 1), Number(latest.stock))
        };
      }).filter(item => Number(item.stock) > 0);

      saveCart();
    }
    renderCart();
  }else if(section === "history" && hasPermission("history")){
    await loadHistory();
  }else if(section === "report" && hasPermission("report")){
    await loadReport();
  }

  if(hasPermission("dashboard") && section !== "dashboard"){
    await loadDashboard();
  }
}

function resetPullRefreshIndicator(){
  const indicator = $("#pullRefreshIndicator");
  const text = $("#pullRefreshText");

  indicator.classList.remove("visible", "ready", "refreshing");
  text.textContent = "Tarik untuk refresh";
  pullDistance = 0;
  pullActive = false;
}

document.addEventListener("touchstart", event => {
  if(!isPullRefreshMobile()) return;
  if(pullRefreshing) return;
  if(document.body.classList.contains("drawer-open")) return;

  // Saat sedang mengisi / scroll modal, jangan aktifkan pull-to-refresh halaman.
  if(event.target.closest(".modal-overlay.active")) return;

  // Pull-to-refresh hanya aktif jika halaman benar-benar di posisi paling atas.
  if(window.scrollY > 0) return;

  const touch = event.touches?.[0];
  if(!touch) return;

  pullStartY = touch.clientY;
  pullStartX = touch.clientX;
  pullDistance = 0;
  pullActive = true;
}, {passive:true});

document.addEventListener("touchmove", event => {
  if(!pullActive || pullRefreshing) return;
  if(!isPullRefreshMobile()) return;

  const touch = event.touches?.[0];
  if(!touch) return;

  const deltaY = touch.clientY - pullStartY;
  const deltaX = Math.abs(touch.clientX - pullStartX);

  // Abaikan gesture horizontal supaya tidak bentrok dengan swipe sidebar.
  if(deltaX > Math.abs(deltaY)){
    pullActive = false;
    return;
  }

  if(deltaY <= 0){
    resetPullRefreshIndicator();
    return;
  }

  pullDistance = deltaY;

  const indicator = $("#pullRefreshIndicator");
  const text = $("#pullRefreshText");

  if(pullDistance > 20){
    indicator.classList.add("visible");
  }

  if(pullDistance >= PULL_THRESHOLD){
    indicator.classList.add("ready");
    text.textContent = "Lepas untuk refresh";
  }else{
    indicator.classList.remove("ready");
    text.textContent = "Tarik untuk refresh";
  }
}, {passive:true});

document.addEventListener("touchend", async () => {
  if(!pullActive || pullRefreshing) return;

  if(pullDistance < PULL_THRESHOLD){
    resetPullRefreshIndicator();
    return;
  }

  const indicator = $("#pullRefreshIndicator");
  const text = $("#pullRefreshText");

  pullRefreshing = true;
  pullActive = false;

  indicator.classList.remove("ready");
  indicator.classList.add("visible", "refreshing");
  text.textContent = "Memuat data...";

  try{
    await refreshCurrentSection();
    text.textContent = "Data diperbarui";
    showToast("Data berhasil direfresh.");
  }catch(error){
    text.textContent = "Refresh gagal";
    showToast(error.message || "Gagal refresh data.");
  }

  setTimeout(() => {
    pullRefreshing = false;
    resetPullRefreshIndicator();
  }, 650);
}, {passive:true});

document.addEventListener("touchcancel", () => {
  if(!pullRefreshing){
    resetPullRefreshIndicator();
  }
});


/* ---------------- INIT ---------------- */

$("#historyMonth").value = currentMonth();
$("#reportMonth").value = currentMonth();

restoreCart();
renderCart();

(async () => {
  try{
    const data = await api("me");
    showApp(data.user, data.permissions || []);
  }catch(_){
    showLogin();
  }
})();
