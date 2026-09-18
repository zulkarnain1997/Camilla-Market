
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
let selectedCategories = new Set();
const PRODUCT_PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 40, 50];
let productPageSize = 50;
try{
  const savedProductPageSize = localStorage.getItem("camilla_product_page_size");
  if(savedProductPageSize === "all"){
    productPageSize = "all";
  }else if(PRODUCT_PAGE_SIZE_OPTIONS.includes(Number(savedProductPageSize))){
    productPageSize = Number(savedProductPageSize);
  }
}catch(_){}
let productCurrentPage = 1;
let currentEditingProduct = null;
let currentUser = null;
let users = [];
let currentEditingUser = null;
let currentPermissions = [];
let accessSyncTimer = null;
let accessSyncBusy = false;
let lastReceipt = null;
let lastReportData = null;
let branding = {
  website_name:"Ada Apa Aja",
  app_name:"Ada Apa Aja POS",
  icon:"files/default-logo.png"
};
let qrSettings = {items:[], activeItems:[], selectedId:null};
let currentEditingQrisId = null;
let selectedPaymentQris = null;

const SAVED_LOGIN_KEY = "camilla_saved_login_v1";
const SAVED_LOGIN_MASK = "••••••••";
let savedLoginState = null;

const pageMeta = {
  dashboard: ["Dashboard", "Ringkasan aktivitas minimarket hari ini"],
  products: ["Produk & Stok", "Kelola produk dan tambahkan barang ke keranjang"],
  cart: ["Keranjang", "QTY dapat diketik langsung dan total berubah otomatis"],
  history: ["Riwayat", "Daftar transaksi berdasarkan bulan"],
  report: ["Laporan Bulanan", "Summary penjualan, pemasukan, pengeluaran, dan produk terlaris"],
  finance: ["Pemasukan & Pengeluaran", "Kelola arus kas tambahan minimarket"],
  "qr-settings": ["Setting QR", "Pengaturan QR/QRIS untuk pembayaran"],
  "branding-settings": ["Branding Aplikasi", "Ubah nama website, nama aplikasi, dan icon"],
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
  const order = ["dashboard", "products", "cart", "history", "report", "finance", "qr-settings", "branding-settings"];
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
  ["dashboard", "products", "cart", "history", "report", "finance", "qr-settings", "branding-settings"].forEach(menuCode => {
    const link = document.querySelector(`.side-nav a[data-section="${menuCode}"]`);

    if(link){
      const allowed = hasPermission(menuCode);

      // Bersihkan state lama lalu terapkan permission terbaru.
      link.classList.toggle("hidden", !allowed);
      link.setAttribute("aria-hidden", allowed ? "false" : "true");
    }
  });

  // Menu User tetap hanya Administrator. Setting QR dan Branding mengikuti autorisasi.
  ["users"].forEach(sectionCode => {
    const adminLink = document.querySelector(`.side-nav a[data-section="${sectionCode}"]`);
    if(adminLink){
      adminLink.classList.toggle("hidden", !admin);
      adminLink.setAttribute("aria-hidden", admin ? "false" : "true");
    }
  });

  // Maintenance produk tetap hanya Administrator.
  ["#addProductBtn", "#downloadProductTemplateBtn", "#uploadProductExcelBtn"].forEach(selector => {
    const control = $(selector);
    if(control){
      control.classList.toggle("hidden", !admin);
      control.setAttribute("aria-hidden", admin ? "false" : "true");
    }
  });

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
      currentUser?.username !== nextUser?.username ||
      currentUser?.phone !== nextUser?.phone ||
      currentUser?.address !== nextUser?.address ||
      currentUser?.photo_path !== nextUser?.photo_path;

    currentUser = nextUser;
    currentPermissions = nextPermissions;

    $("#userName").textContent = currentUser.name || currentUser.username || "User";
    $("#userRole").textContent = currentUser.role === "admin" ? "Administrator" : "Kasir";
    renderCurrentUserAvatar();

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

function brandFilePrefix(){
  return String(branding.website_name || "Ada Apa Aja")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50) || "Ada Apa Aja";
}

function cacheBustedAsset(path){
  if(!path) return "files/default-logo.png";
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}v=${Date.now()}`;
}



function applyBranding(){
  const websiteName = branding.website_name || "Ada Apa Aja";
  const appName = branding.app_name || `${websiteName} POS`;
  const icon = branding.icon || "files/default-logo.png";
  const iconSrc = cacheBustedAsset(icon);

  document.title = appName;
  const description = `${websiteName} Ada Apa Aja POS`;
  $("#appMetaDescription")?.setAttribute("content", description);
  $("#dynamicFavicon")?.setAttribute("href", iconSrc);

  const textMap = {
    "#loginBrandName": appName,
    "#sidebarBrandName": appName,
    "#sidebarWebsiteName": websiteName,
    "#sidebarFooterBrand": appName,
    "#brandingPreviewAppName": appName,
    "#brandingPreviewWebsiteName": websiteName,
  };
  Object.entries(textMap).forEach(([selector, value]) => {
    const el = $(selector);
    if(el) el.textContent = value;
  });

  ["#loginBrandIcon", "#sidebarBrandIcon", "#brandingIconPreview", "#brandingPreviewIcon"].forEach(selector => {
    const el = $(selector);
    if(el) el.src = iconSrc;
  });

  if($("#dashboardWelcomeTitle")) {
    $("#dashboardWelcomeTitle").textContent = `Kelola penjualan ${websiteName} lebih mudah.`;
  }

  pageMeta.finance[1] = `Kelola arus kas tambahan ${websiteName}`;

  if($("#brandingWebsiteName")) $("#brandingWebsiteName").value = websiteName;
  if($("#brandingAppName")) $("#brandingAppName").value = appName;

  if(window.ReactNativeWebView?.postMessage){
    try{
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type:"branding-update",
        websiteName,
        appName,
        icon
      }));
    }catch(_){}
  }
}

async function loadBranding(){
  try{
    const data = await api("branding");
    branding = {
      website_name:data.website_name || "Ada Apa Aja",
      app_name:data.app_name || "Ada Apa Aja POS",
      icon:data.icon || "files/default-logo.png"
    };
    applyBranding();
    return branding;
  }catch(_){
    applyBranding();
    return branding;
  }
}

async function loadBrandingSettings(){
  await loadBranding();
}

const NATIVE_SCANNER_RESUME_FLAG = "camilla_native_scanner_resume";
const NATIVE_SCANNER_RESUME_SECTION = "camilla_native_scanner_section";
const NATIVE_SCANNER_RESUME_TARGET = "camilla_native_scanner_target";

function getActiveAppSection(){
  return document.querySelector(".page-section.active")?.id || firstAllowedSection() || "dashboard";
}

function getNativeScannerResumeState(){
  try{
    if(localStorage.getItem(NATIVE_SCANNER_RESUME_FLAG) !== "1"){
      return null;
    }

    return {
      section:localStorage.getItem(NATIVE_SCANNER_RESUME_SECTION) || "",
      target:localStorage.getItem(NATIVE_SCANNER_RESUME_TARGET) || ""
    };
  }catch(_){
    return null;
  }
}

function saveNativeScannerResumeState(target="cart"){
  try{
    let section = getActiveAppSection();

    // Scan dari form Tambah/Edit Produk harus kembali ke Produk & Stok.
    if(target === "master"){
      section = "products";
    }

    localStorage.setItem(NATIVE_SCANNER_RESUME_FLAG, "1");
    localStorage.setItem(NATIVE_SCANNER_RESUME_SECTION, section);
    localStorage.setItem(NATIVE_SCANNER_RESUME_TARGET, target);
    return section;
  }catch(_){
    return getActiveAppSection();
  }
}

function clearNativeScannerResumeState(){
  try{
    localStorage.removeItem(NATIVE_SCANNER_RESUME_FLAG);
    localStorage.removeItem(NATIVE_SCANNER_RESUME_SECTION);
    localStorage.removeItem(NATIVE_SCANNER_RESUME_TARGET);
  }catch(_){}

  document.documentElement.classList.remove("native-scanner-resume-pending");
}

function notifyNativeScannerResumeReady({authenticated=true, section=""} = {}){
  if(!window.ReactNativeWebView?.postMessage) return;

  try{
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:"scanner-resume-ready",
      authenticated,
      section
    }));
  }catch(_){}
}

function finishAuthBoot(){
  document.body.classList.remove("auth-booting");
  $("#authBootScreen")?.classList.add("hidden");
}

function showLogin(){
  const scannerResume = getNativeScannerResumeState();
  finishAuthBoot();

  stopAccessSync();
  currentUser = null;
  currentPermissions = [];

  $("#appView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");

  if(scannerResume){
    clearNativeScannerResumeState();
    notifyNativeScannerResumeReady({authenticated:false, section:""});
  }
}

function renderCurrentUserAvatar(){
  const avatar = $("#userAvatar");
  if(!avatar || !currentUser) return;

  if(currentUser.photo_path){
    avatar.classList.add("has-photo");
    avatar.innerHTML = `<img src="${escapeHtml(currentUser.photo_path)}" alt="Foto ${escapeHtml(currentUser.name || currentUser.username || 'User')}">`;
  }else{
    avatar.classList.remove("has-photo");
    avatar.textContent = (currentUser.name || currentUser.username || "U").charAt(0).toUpperCase();
  }
}

function showApp(user, permissions=[]){
  const scannerResume = getNativeScannerResumeState();
  finishAuthBoot();

  currentUser = user;
  currentPermissions = Array.isArray(permissions) ? permissions : [];

  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");

  $("#userName").textContent = user.name || user.username || "User";
  $("#userRole").textContent = user.role === "admin" ? "Administrator" : "Kasir";
  renderCurrentUserAvatar();

  applyRoleUI();

  // Permission dari login/me adalah sumber utama menu yang tampil.
  currentPermissions = normalizePermissions(currentPermissions);
  applyRoleUI();

  const home = firstAllowedSection();
  let landingSection = home;

  if(scannerResume?.section){
    const requested = scannerResume.section;
    const allowed = requested === "users"
      ? isAdmin()
      : hasPermission(requested);

    if(allowed){
      landingSection = requested;
    }
  }

  if(landingSection){
    showSection(landingSection);
  }else{
    // User tanpa menu akan tetap masuk, tetapi tidak bisa membuka fitur operasional.
    $$(".page-section").forEach(section => section.classList.remove("active"));
    $("#pageTitle").textContent = "Tidak Ada Akses";
    $("#pageSubtitle").textContent = "Hubungi Administrator untuk mendapatkan autorisasi menu.";
  }

  if(hasPermission("products")){
    loadProducts();
  }

  // Jika scanner dibuka dari form master produk, kembalikan form + isinya
  // bahkan ketika scan dibatalkan.
  if(scannerResume?.target === "master"){
    restoreProductBarcodeScanDraft();
  }

  startAccessSync();

  if(scannerResume){
    const restoredSection =
      document.querySelector(".page-section.active")?.id ||
      landingSection ||
      "";

    clearNativeScannerResumeState();
    notifyNativeScannerResumeReady({
      authenticated:true,
      section:restoredSection
    });
  }
}

function readSavedLogin(){try{const p=JSON.parse(localStorage.getItem(SAVED_LOGIN_KEY)||"null");if(p?.username&&p?.token)return p;}catch(_){}return null;}
function writeSavedLogin(username,token){savedLoginState={username,token};try{localStorage.setItem(SAVED_LOGIN_KEY,JSON.stringify(savedLoginState));}catch(_){}}
async function removeSavedLogin({notifyServer=true}={}){const saved=readSavedLogin();savedLoginState=null;try{localStorage.removeItem(SAVED_LOGIN_KEY);}catch(_){}if(notifyServer&&saved?.token){try{await api("saved_login_revoke",{method:"POST",body:JSON.stringify({token:saved.token})});}catch(_){}}restoreSavedLoginUI();}
function restoreSavedLoginUI(){savedLoginState=readSavedLogin();const u=$("#username"),p=$("#password"),c=$("#saveLoginPassword"),i=$("#savedLoginInfo");if(savedLoginState){if(u&&!u.value)u.value=savedLoginState.username;if(p&&!p.value){p.value=SAVED_LOGIN_MASK;p.dataset.savedLogin="1";}if(c)c.checked=true;i?.classList.remove("hidden");}else{if(p?.dataset.savedLogin==="1"){p.value="";delete p.dataset.savedLogin;}if(c)c.checked=false;i?.classList.add("hidden");}}
function openAccountModal(id){$(id)?.classList.add("active");document.body.classList.add("modal-open");}
function closeAccountModal(id){$(id)?.classList.remove("active");if(!document.querySelector(".modal-overlay.active"))document.body.classList.remove("modal-open");}

function setLoginPasswordVisibility(show){
  const passwordInput = $("#password");
  const toggle = $("#toggleLoginPassword");
  if(!passwordInput || !toggle) return;

  passwordInput.type = show ? "text" : "password";
  toggle.setAttribute("aria-pressed", show ? "true" : "false");
  toggle.setAttribute("aria-label", show ? "Sembunyikan password" : "Tampilkan password");
  toggle.setAttribute("title", show ? "Sembunyikan password" : "Tampilkan password");
  toggle.querySelector(".password-eye-open")?.classList.toggle("hidden", show);
  toggle.querySelector(".password-eye-closed")?.classList.toggle("hidden", !show);
}

function clearLoginCredentials(){
  const form = $("#loginForm");
  const username = $("#username");
  const password = $("#password");

  try{ form?.reset(); }catch(_){}

  if(username){
    username.value = "";
    username.defaultValue = "";
    username.setAttribute("value", "");
  }

  if(password){
    password.value = "";
    password.defaultValue = "";
    password.setAttribute("value", "");
  }

  setLoginPasswordVisibility(false);
  if($("#loginError")) $("#loginError").textContent = "";

  setTimeout(() => {
    if(!$("#loginView")?.classList.contains("hidden")){
      if(!readSavedLogin()){
        if(username && !document.activeElement?.isSameNode(username)) username.value = "";
        if(password && !document.activeElement?.isSameNode(password)) password.value = "";
      }
      setLoginPasswordVisibility(false);
      restoreSavedLoginUI();
    }
  }, 80);
}

$("#toggleLoginPassword")?.addEventListener("click", () => {
  setLoginPasswordVisibility($("#password")?.type === "password");
  $("#password")?.focus();
});

$("#password")?.addEventListener("beforeinput",event=>{const p=event.currentTarget;if(p.dataset.savedLogin==="1"){p.value="";delete p.dataset.savedLogin;}});
$("#username")?.addEventListener("input",()=>{const p=$("#password");if(p?.dataset.savedLogin==="1"&&$("#username").value.trim()!==savedLoginState?.username){p.value="";delete p.dataset.savedLogin;}});
$("#removeSavedLoginBtn")?.addEventListener("click",async()=>{await removeSavedLogin();clearLoginCredentials();showToast("Password tersimpan sudah dihapus dari perangkat ini.");});


$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault(); $("#loginError").textContent="";
  const username=$("#username").value.trim(), p=$("#password"), save=Boolean($("#saveLoginPassword")?.checked);
  const using=p?.dataset.savedLogin==="1"&&savedLoginState?.token&&savedLoginState?.username===username;
  try{
    let data;
    if(using){data=await api("saved_login",{method:"POST",body:JSON.stringify({username,token:savedLoginState.token})});}
    else {data=await api("login",{method:"POST",body:JSON.stringify({username,password:p.value,save_password:save})});if(save&&data.saved_login_token)writeSavedLogin(data.saved_username||username,data.saved_login_token);else if(!save&&readSavedLogin())await removeSavedLogin();}
    showApp(data.user,data.permissions||[]);
  }catch(error){if(using){await removeSavedLogin({notifyServer:false});if(p){p.value="";delete p.dataset.savedLogin;}}$("#loginError").textContent=error.message;}
});

$("#registerAccountBtn")?.addEventListener("click",()=>{$("#registerForm")?.reset();$("#registerMessage").textContent="";openAccountModal("#registerModal");setTimeout(()=>$("#regName")?.focus(),80);});
$("#closeRegisterModal")?.addEventListener("click",()=>closeAccountModal("#registerModal")); $("#cancelRegisterBtn")?.addEventListener("click",()=>closeAccountModal("#registerModal"));
$("#forgotPasswordBtn")?.addEventListener("click",()=>{$("#forgotPasswordForm")?.reset();$("#forgotPasswordMessage").textContent="";$("#forgotUsername").value=$("#username")?.value.trim()||"";openAccountModal("#forgotPasswordModal");});
$("#closeForgotPasswordModal")?.addEventListener("click",()=>closeAccountModal("#forgotPasswordModal")); $("#cancelForgotPasswordBtn")?.addEventListener("click",()=>closeAccountModal("#forgotPasswordModal"));
$$(".account-password-toggle").forEach(b=>b.addEventListener("click",()=>{const i=document.getElementById(b.dataset.passwordTarget||"");if(!i)return;const show=i.type==="password";i.type=show?"text":"password";b.textContent=show?"🙈":"👁";}));
$("#registerForm")?.addEventListener("submit",async e=>{e.preventDefault();const m=$("#registerMessage"),p=$("#regPassword").value,c=$("#regPasswordConfirm").value;m.textContent="";if(p!==c){m.textContent="Konfirmasi password tidak sama.";return;}try{const r=await api("register",{method:"POST",body:JSON.stringify({name:$("#regName").value.trim(),username:$("#regUsername").value.trim(),email:$("#regEmail").value.trim(),phone:$("#regPhone").value.trim(),password:p,password_confirm:c})});const u=$("#regUsername").value.trim();closeAccountModal("#registerModal");clearLoginCredentials();$("#username").value=u;$("#password").focus();showToast(r.message||"Pendaftaran berhasil.");}catch(err){m.textContent=err.message;}});
$("#forgotPasswordForm")?.addEventListener("submit",async e=>{e.preventDefault();const m=$("#forgotPasswordMessage"),p=$("#forgotNewPassword").value,c=$("#forgotConfirmPassword").value;m.textContent="";if(p!==c){m.textContent="Konfirmasi password baru tidak sama.";return;}try{const u=$("#forgotUsername").value.trim();const r=await api("password_reset",{method:"POST",body:JSON.stringify({username:u,email:$("#forgotEmail").value.trim(),phone:$("#forgotPhone").value.trim(),password:p,password_confirm:c})});await removeSavedLogin({notifyServer:false});closeAccountModal("#forgotPasswordModal");clearLoginCredentials();$("#username").value=u;showToast(r.message||"Password berhasil diubah.");}catch(err){m.textContent=err.message;}});

$("#logoutBtn").addEventListener("click", async () => {
  try{
    await api("logout", {method:"POST", body:"{}"});
  }catch(_){}

  cart = [];
  saveCart();
  showLogin();
  clearLoginCredentials();

  setTimeout(() => $("#username")?.focus(), 120);
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

  const meta = pageMeta[id] || [branding.app_name || "Ada Apa Aja POS", ""];
  $("#pageTitle").textContent = meta[0];
  $("#pageSubtitle").textContent = meta[1];
  $("#sidebar").classList.remove("open");
  document.body.classList.remove("drawer-open");

  if(id === "dashboard") loadDashboard();
  if(id === "products") loadProducts();
  if(id === "cart") renderCart();
  if(id === "history") loadHistory();
  if(id === "report") loadReport();
  if(id === "finance") loadFinance();
  if(id === "qr-settings") loadQrSettings();
  if(id === "branding-settings") loadBrandingSettings();
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

/* Excel Product & Stock Import (.xlsx, no external JS library required) */
function normalizeExcelHeader(value=""){
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s\-\/]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_");
}

function excelColumnIndex(cellRef="A1"){
  const match = String(cellRef).match(/[A-Z]+/i);
  if(!match) return 0;
  return match[0].toUpperCase().split("").reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

async function inflateZipEntry(bytes, method){
  if(method === 0) return bytes;
  if(method !== 8) throw new Error(`Metode kompresi Excel tidak didukung (${method}).`);
  if(typeof DecompressionStream === "undefined"){
    throw new Error("Browser/WebView terlalu lama untuk membaca file Excel. Update Chrome/Android System WebView lalu coba lagi.");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function createZipReader(arrayBuffer){
  const data = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let eocd = -1;
  const minOffset = Math.max(0, data.length - 65557);

  for(let i=data.length-22; i>=minOffset; i--){
    if(view.getUint32(i, true) === 0x06054b50){
      eocd = i;
      break;
    }
  }
  if(eocd < 0) throw new Error("File bukan XLSX yang valid (ZIP directory tidak ditemukan).");

  const totalEntries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map();

  for(let i=0; i<totalEntries; i++){
    if(view.getUint32(offset, true) !== 0x02014b50){
      throw new Error("Struktur file XLSX tidak valid.");
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.slice(offset + 46, offset + 46 + nameLength));

    entries.set(name, {method, compressedSize, localOffset});
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    has(name){ return entries.has(name); },
    async text(name){
      const entry = entries.get(name);
      if(!entry) throw new Error(`Bagian Excel tidak ditemukan: ${name}`);
      const local = entry.localOffset;
      if(view.getUint32(local, true) !== 0x04034b50){
        throw new Error("Local ZIP header file Excel tidak valid.");
      }
      const nameLength = view.getUint16(local + 26, true);
      const extraLength = view.getUint16(local + 28, true);
      const start = local + 30 + nameLength + extraLength;
      const compressed = data.slice(start, start + entry.compressedSize);
      const raw = await inflateZipEntry(compressed, entry.method);
      return decoder.decode(raw);
    }
  };
}

function xmlDocument(xmlText, label="XML"){
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if(doc.getElementsByTagName("parsererror").length){
    throw new Error(`${label} pada file Excel tidak valid.`);
  }
  return doc;
}

function xmlElements(node, localName){
  return [...node.getElementsByTagNameNS("*", localName)];
}

async function parseXlsxProductRows(file){
  if(!file || !/\.xlsx$/i.test(file.name || "")){
    throw new Error("Pilih file Excel dengan format .xlsx");
  }
  if(file.size > 10 * 1024 * 1024){
    throw new Error("Ukuran file Excel maksimal 10 MB.");
  }

  const zip = createZipReader(await file.arrayBuffer());
  const workbookDoc = xmlDocument(await zip.text("xl/workbook.xml"), "Workbook");
  const relsDoc = xmlDocument(await zip.text("xl/_rels/workbook.xml.rels"), "Workbook relationship");
  const sheets = xmlElements(workbookDoc, "sheet");
  if(!sheets.length) throw new Error("Sheet Excel tidak ditemukan.");

  const preferred = sheets.find(sheet => String(sheet.getAttribute("name") || "").toLowerCase() === "produk_import") || sheets[0];
  const relId = preferred.getAttribute("r:id") || preferred.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const relationship = xmlElements(relsDoc, "Relationship").find(rel => rel.getAttribute("Id") === relId);
  if(!relationship) throw new Error("Lokasi sheet Excel tidak ditemukan.");

  let target = relationship.getAttribute("Target") || "worksheets/sheet1.xml";
  target = target.replace(/^\/+/, "");
  const sheetPath = target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;

  let sharedStrings = [];
  if(zip.has("xl/sharedStrings.xml")){
    const sharedDoc = xmlDocument(await zip.text("xl/sharedStrings.xml"), "Shared strings");
    sharedStrings = xmlElements(sharedDoc, "si").map(si =>
      xmlElements(si, "t").map(t => t.textContent || "").join("")
    );
  }

  const sheetDoc = xmlDocument(await zip.text(sheetPath), "Worksheet");
  const rowNodes = xmlElements(sheetDoc, "row");
  const matrix = rowNodes.map(rowNode => {
    const row = [];
    xmlElements(rowNode, "c").forEach(cell => {
      const index = excelColumnIndex(cell.getAttribute("r") || "A1");
      const type = cell.getAttribute("t") || "";
      let value = "";
      if(type === "inlineStr"){
        value = xmlElements(cell, "t").map(t => t.textContent || "").join("");
      }else{
        const valueNode = xmlElements(cell, "v")[0];
        value = valueNode ? (valueNode.textContent || "") : "";
        if(type === "s" && value !== "") value = sharedStrings[Number(value)] ?? "";
      }
      row[index] = String(value ?? "").trim();
    });
    return row;
  });

  const headerRowIndex = matrix.findIndex(row => row.some(value => String(value || "").trim() !== ""));
  if(headerRowIndex < 0) throw new Error("File Excel kosong.");

  const headers = matrix[headerRowIndex].map(normalizeExcelHeader);
  const aliases = {
    barcode:["BARCODE","KODE_BARCODE","CODE_BARCODE"],
    sku:["SKU","KODE_PRODUK","PRODUCT_CODE","KODE_ITEM"],
    name:["NAMA_PRODUK","NAME","PRODUCT_NAME","NAMA"],
    category:["KATEGORI","CATEGORY"],
    purchase_price:["HARGA_BELI","PURCHASE_PRICE","HARGA_MODAL","COST"],
    sell_price:["HARGA_JUAL","SELL_PRICE","PRICE","HARGA"],
    stock:["STOK","STOCK","QTY"],
    min_stock:["MIN_STOK","MIN_STOCK","STOK_MINIMUM","MINIMUM_STOK"]
  };

  const indexes = {};
  Object.entries(aliases).forEach(([field, names]) => {
    indexes[field] = headers.findIndex(header => names.includes(header));
  });

  if(indexes.name < 0 || indexes.sell_price < 0 || (indexes.barcode < 0 && indexes.sku < 0)){
    throw new Error("Header template tidak sesuai. Gunakan Template Excel dari menu Produk & Stok.");
  }

  const get = (row, field) => indexes[field] >= 0 ? String(row[indexes[field]] ?? "").trim() : "";
  const rows = [];
  for(let i=headerRowIndex+1; i<matrix.length; i++){
    const row = matrix[i];
    const mapped = {
      excel_row: i + 1,
      barcode: get(row, "barcode"),
      sku: get(row, "sku"),
      name: get(row, "name"),
      category: get(row, "category"),
      purchase_price: get(row, "purchase_price"),
      sell_price: get(row, "sell_price"),
      stock: get(row, "stock"),
      min_stock: get(row, "min_stock")
    };
    if(Object.entries(mapped).some(([key,value]) => key !== "excel_row" && String(value).trim() !== "")){
      rows.push(mapped);
    }
  }

  if(!rows.length) throw new Error("Tidak ada data produk pada file Excel.");
  if(rows.length > 2000) throw new Error("Maksimal 2.000 produk per sekali upload.");
  return rows;
}

async function importProductExcel(file){
  if(!isAdmin()){
    showToast("Akses upload Excel hanya untuk Administrator.");
    return;
  }

  const button = $("#uploadProductExcelBtn");
  const originalHtml = button?.innerHTML || "Upload Excel";
  try{
    if(button){
      button.disabled = true;
      button.classList.add("is-loading");
      button.innerHTML = `<span class="product-excel-icon" aria-hidden="true">⟳</span><span class="product-excel-label">Membaca Excel...</span>`;
    }
    const rows = await parseXlsxProductRows(file);

    if(!confirm(`Import ${rows.length} baris produk?\n\nBarcode/SKU yang sudah ada akan di-update, sedangkan kode baru akan ditambahkan.`)){
      return;
    }

    if(button){
      button.innerHTML = `<span class="product-excel-icon" aria-hidden="true">⟳</span><span class="product-excel-label">Mengupload...</span>`;
    }
    const result = await api("product_import", {
      method:"POST",
      body:JSON.stringify({rows})
    });

    await loadProducts();
    if(hasPermission("dashboard")) await loadDashboard();

    const errors = Array.isArray(result.errors) ? result.errors : [];
    let message = `Import selesai.\n\nBaris diproses: ${result.processed || 0}\nProduk baru: ${result.inserted || 0}\nProduk di-update: ${result.updated || 0}\nGagal: ${result.failed || 0}`;
    if(errors.length){
      message += "\n\nDetail gagal:\n" + errors.slice(0, 12).map(item => `Baris ${item.row}: ${item.message}`).join("\n");
      if(errors.length > 12) message += `\n... dan ${errors.length - 12} error lainnya.`;
    }
    alert(message);
    showToast("Upload Excel Produk & Stok selesai.");
  }catch(error){
    alert(error.message || "Upload Excel gagal.");
  }finally{
    if(button){
      button.disabled = false;
      button.classList.remove("is-loading");
      button.innerHTML = originalHtml;
    }
    const input = $("#productExcelFile");
    if(input) input.value = "";
  }
}

$("#downloadProductTemplateBtn")?.addEventListener("click", async () => {
  if(!isAdmin()){
    showToast("Akses template Excel hanya untuk Administrator.");
    return;
  }

  const button = $("#downloadProductTemplateBtn");
  const oldHtml = button?.innerHTML || "Download Template";
  try{
    if(button){
      button.disabled = true;
      button.classList.add("is-loading");
      button.innerHTML = `<span class="product-excel-icon" aria-hidden="true">⟳</span><span class="product-excel-label">Menyiapkan...</span>`;
    }
    const response = await fetch("templates/Template_Upload_Product_Stock_Camilla_Market.xlsx", {cache:"no-store"});
    if(!response.ok) throw new Error("Template Excel tidak ditemukan di server.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for(let i=0; i<bytes.length; i+=chunkSize){
      binary += String.fromCharCode(...bytes.subarray(i, i+chunkSize));
    }
    deliverExportFile({
      file_name:`Template_Upload_Product_Stock_${brandFilePrefix()}.xlsx`,
      mime_type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64:btoa(binary)
    });
  }catch(error){
    showToast(error.message || "Template Excel gagal disiapkan.");
  }finally{
    if(button){
      button.disabled = false;
      button.classList.remove("is-loading");
      button.innerHTML = oldHtml;
    }
  }
});

$("#uploadProductExcelBtn")?.addEventListener("click", () => {
  if(!isAdmin()){
    showToast("Akses upload Excel hanya untuk Administrator.");
    return;
  }
  $("#productExcelFile")?.click();
});

$("#productExcelFile")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if(file) importProductExcel(file);
});

async function loadProducts(){
  try{
    const query = $("#productSearch").value.trim();
    const data = await api("products" + (query ? `&q=${encodeURIComponent(query)}` : ""));

    products = data.data || [];
    productCurrentPage = 1;
    buildCategories();
    renderProducts();
  }catch(error){
    showToast(error.message);
  }
}

function buildCategories(){
  const categories = [...new Set(products.map(item => item.category).filter(Boolean))].sort();

  selectedCategories = new Set(
    [...selectedCategories].filter(category => categories.includes(category))
  );

  const isAll = selectedCategories.size === 0;

  $("#categoryChips").innerHTML = ["all", ...categories].map(category => {
    const checked = category === "all"
      ? isAll
      : selectedCategories.has(category);

    return `
      <label class="category-filter-option ${checked ? "active" : ""}">
        <input
          type="checkbox"
          class="category-filter-checkbox"
          data-category="${escapeHtml(category)}"
          ${checked ? "checked" : ""}>
        <span>${category === "all" ? "Semua kategori" : escapeHtml(category)}</span>
      </label>
    `;
  }).join("");

  updateCategoryFilterSummary();

  $$(".category-filter-checkbox").forEach(input => {
    input.addEventListener("change", () => {
      const category = input.dataset.category;

      if(category === "all"){
        selectedCategories.clear();
      }else if(selectedCategories.has(category)){
        selectedCategories.delete(category);
      }else{
        selectedCategories.add(category);
      }

      productCurrentPage = 1;
      buildCategories();
      renderProducts();
    });
  });
}

function updateCategoryFilterSummary(){
  const summary = $("#categoryFilterSummary");
  const resetButton = $("#clearCategoryFilterBtn");
  if(!summary) return;

  if(selectedCategories.size === 0){
    summary.textContent = "Semua kategori";
    resetButton?.classList.add("hidden");
    return;
  }

  if(selectedCategories.size === 1){
    summary.textContent = [...selectedCategories][0];
  }else{
    summary.textContent = `${selectedCategories.size} kategori dipilih`;
  }
  resetButton?.classList.remove("hidden");
}

function setCategoryFilterDropdownState(isOpen){
  const dropdown = $("#categoryFilterDropdown");
  const menu = $("#categoryFilterMenu");
  const toggle = $("#categoryFilterToggle");
  if(!dropdown || !menu || !toggle) return;

  dropdown.classList.toggle("open", isOpen);
  menu.classList.toggle("hidden", !isOpen);
  toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

$("#categoryFilterToggle")?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  const menu = $("#categoryFilterMenu");
  setCategoryFilterDropdownState(menu?.classList.contains("hidden") ?? true);
});

$("#categoryFilterMenu")?.addEventListener("click", event => {
  event.stopPropagation();
});

document.addEventListener("click", event => {
  const dropdown = $("#categoryFilterDropdown");
  if(!dropdown) return;
  if(!dropdown.contains(event.target)){
    setCategoryFilterDropdownState(false);
  }
});

document.addEventListener("keydown", event => {
  if(event.key === "Escape"){
    setCategoryFilterDropdownState(false);
  }
});

$("#clearCategoryFilterBtn")?.addEventListener("click", () => {
  selectedCategories.clear();
  productCurrentPage = 1;
  buildCategories();
  renderProducts();
});

function productPageTokens(currentPage, totalPages){
  if(totalPages <= 7){
    return Array.from({length:totalPages}, (_, index) => index + 1);
  }

  const tokens = [1];
  const rangeStart = Math.max(2, currentPage - 1);
  const rangeEnd = Math.min(totalPages - 1, currentPage + 1);

  if(rangeStart > 2) tokens.push("ellipsis-left");
  for(let page = rangeStart; page <= rangeEnd; page++) tokens.push(page);
  if(rangeEnd < totalPages - 1) tokens.push("ellipsis-right");

  tokens.push(totalPages);
  return tokens;
}

function renderProductPagination(totalItems){
  const box = $("#productPagination");
  if(!box) return;

  if(totalItems <= 0){
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }

  const showAll = productPageSize === "all";
  const numericPageSize = showAll ? totalItems : Number(productPageSize || 50);
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalItems / numericPageSize));
  productCurrentPage = Math.min(Math.max(1, productCurrentPage), totalPages);

  const startItem = showAll ? 1 : ((productCurrentPage - 1) * numericPageSize) + 1;
  const endItem = showAll ? totalItems : Math.min(productCurrentPage * numericPageSize, totalItems);
  const tokens = productPageTokens(productCurrentPage, totalPages);

  box.innerHTML = `
    <div class="product-pagination-summary">
      <span class="product-result-text">
        Menampilkan <strong>${startItem}-${endItem}</strong> dari <strong>${totalItems}</strong> produk
      </span>
      <label class="product-page-size-label" for="productPageSizeSelect">
        <span>Per halaman</span>
        <select id="productPageSizeSelect" class="product-page-size-select" aria-label="Jumlah produk per halaman">
          ${PRODUCT_PAGE_SIZE_OPTIONS.map(size => `
            <option value="${size}" ${productPageSize === size ? "selected" : ""}>${size}</option>
          `).join("")}
          <option value="all" ${showAll ? "selected" : ""}>All</option>
        </select>
      </label>
    </div>
    ${totalPages > 1 ? `
      <div class="product-pagination-controls">
        <button class="product-page-btn product-page-nav" type="button" data-page="${productCurrentPage - 1}" ${productCurrentPage === 1 ? "disabled" : ""} aria-label="Halaman sebelumnya">
          ‹ <span>Sebelumnya</span>
        </button>
        ${tokens.map(token => {
          if(typeof token === "string"){
            return `<span class="product-page-ellipsis" aria-hidden="true">…</span>`;
          }
          return `<button class="product-page-btn ${token === productCurrentPage ? "active" : ""}" type="button" data-page="${token}" aria-label="Halaman ${token}" ${token === productCurrentPage ? 'aria-current="page"' : ""}>${token}</button>`;
        }).join("")}
        <button class="product-page-btn product-page-nav" type="button" data-page="${productCurrentPage + 1}" ${productCurrentPage === totalPages ? "disabled" : ""} aria-label="Halaman berikutnya">
          <span>Berikutnya</span> ›
        </button>
      </div>
    ` : ""}
  `;

  box.classList.remove("hidden");

  $("#productPageSizeSelect")?.addEventListener("change", event => {
    const value = event.target.value;
    productPageSize = value === "all" ? "all" : Number(value);
    productCurrentPage = 1;
    try{
      localStorage.setItem("camilla_product_page_size", String(productPageSize));
    }catch(_){}
    renderProducts();
  });

  box.querySelectorAll("button[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      if(button.disabled) return;
      const page = Number(button.dataset.page || 1);
      if(!Number.isFinite(page) || page < 1 || page > totalPages || page === productCurrentPage) return;
      productCurrentPage = page;
      renderProducts();

      const productSection = $("#products");
      const top = productSection?.getBoundingClientRect().top ?? 0;
      if(top < 0){
        productSection?.scrollIntoView({behavior:"smooth", block:"start"});
      }
    });
  });
}

function renderProducts(){
  const query = $("#productSearch").value.trim().toLowerCase();

  const filtered = products.filter(product => {
    const text = `${product.name || ""} ${product.barcode || ""} ${product.sku || ""}`.toLowerCase();
    const searchMatch = text.includes(query);
    const categoryMatch = selectedCategories.size === 0 || selectedCategories.has(product.category);
    return searchMatch && categoryMatch;
  });

  const grid = $("#productGrid");

  if(!filtered.length){
    productCurrentPage = 1;
    grid.innerHTML = `<div class="no-result">Produk tidak ditemukan.</div>`;
    renderProductPagination(0);
    return;
  }

  let visibleProducts = filtered;

  if(productPageSize !== "all"){
    const pageSize = Number(productPageSize || 50);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    productCurrentPage = Math.min(Math.max(1, productCurrentPage), totalPages);
    const startIndex = (productCurrentPage - 1) * pageSize;
    visibleProducts = filtered.slice(startIndex, startIndex + pageSize);
  }else{
    productCurrentPage = 1;
  }

  grid.innerHTML = visibleProducts.map(product => `
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
            <div class="product-qty-add" aria-label="Jumlah produk yang ditambahkan">
              <div
                class="product-qty-editor hidden"
                id="productQtyEditor-${Number(product.id)}"
                aria-label="Atur jumlah produk">
                <span class="product-qty-editor-label">Qty</span>
                <div class="product-qty-stepper">
                  <button
                    type="button"
                    class="product-qty-btn"
                    onclick="adjustProductQty(${Number(product.id)}, -1)"
                    ${Number(product.stock) <= 0 ? "disabled" : ""}
                    aria-label="Kurangi jumlah">−</button>
                  <input
                    id="productQty-${Number(product.id)}"
                    class="product-qty-input"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="${Math.max(0, Number(product.stock || 0))}"
                    value="0"
                    ${Number(product.stock) <= 0 ? "disabled" : ""}
                    oninput="normalizeProductQty(${Number(product.id)})"
                    onkeydown="handleProductQtyKeydown(event, ${Number(product.id)})"
                    aria-label="Jumlah ${escapeHtml(product.name)}">
                  <button
                    type="button"
                    class="product-qty-btn"
                    onclick="adjustProductQty(${Number(product.id)}, 1)"
                    ${Number(product.stock) <= 0 ? "disabled" : ""}
                    aria-label="Tambah jumlah">+</button>
                </div>
              </div>
              <button
                id="productAddBtn-${Number(product.id)}"
                class="add-cart product-add-trigger"
                onclick="handleProductAddClick(${Number(product.id)})"
                title="Pilih jumlah produk"
                ${Number(product.stock) <= 0 ? "disabled" : ""}>+</button>
            </div>
          </div>
        </div>
      </div>
    </article>
  `).join("");

  renderProductPagination(filtered.length);
}

$("#productSearch").addEventListener("input", () => {
  productCurrentPage = 1;
  renderProducts();
});
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
      productCurrentPage = 1;
      renderProducts();
      showToast(`${exact.name} ditambahkan ke keranjang.`);
    }
  }
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



/* ---------------- BARCODE SCANNER ---------------- */
let barcodeScanTarget = "cart";
let barcodeStream = null;
let barcodeScanFrame = null;
let barcodeBusy = false;
let barcodeZxingControls = null;
let barcodeScannerEngine = "";
let barcodePreferredDeviceId = "";
let barcodeLastValue = "";
let barcodeLastAt = 0;

async function findProductByBarcode(code){
  const normalized = String(code || "").trim();
  if(!normalized) return null;

  let product = products.find(item =>
    String(item.barcode || "").trim() === normalized ||
    String(item.sku || "").trim() === normalized
  );

  if(product) return product;

  try{
    const data = await api(`products&q=${encodeURIComponent(normalized)}`);
    const rows = data.data || [];
    product = rows.find(item =>
      String(item.barcode || "").trim() === normalized ||
      String(item.sku || "").trim() === normalized
    ) || null;

    if(product && !products.some(item => Number(item.id) === Number(product.id))){
      products.push(product);
    }
    return product;
  }catch(_){
    return null;
  }
}

function isDuplicateBarcodeRead(code){
  const value = String(code || "").trim();
  const now = Date.now();
  const duplicate = value && value === barcodeLastValue && (now - barcodeLastAt) < 1200;
  barcodeLastValue = value;
  barcodeLastAt = now;
  return duplicate;
}

async function processScannedBarcode(rawCode, target=barcodeScanTarget){
  const code = String(rawCode || "").trim();
  if(!code || barcodeBusy || isDuplicateBarcodeRead(code)) return;
  barcodeBusy = true;

  try{
    if(target === "master"){
      $("#pBarcode").value = code;
      showToast(`Barcode ${code} berhasil dibaca.`);
      return;
    }

    const product = await findProductByBarcode(code);
    if(!product){
      $("#productSearch").value = code;
      await loadProducts();
      showToast(`Barcode ${code} belum terdaftar. Daftarkan pada master produk.`);
      return;
    }

    addToCart(Number(product.id));
    $("#productSearch").value = "";
    showToast(`${product.name} ditambahkan ke keranjang.`);
  }finally{
    setTimeout(() => { barcodeBusy = false; }, 450);
  }
}

function saveProductBarcodeScanDraft(){
  const modal = $("#productModal");
  if(!modal?.classList.contains("active")) return;

  try{
    localStorage.setItem("camilla_product_scan_draft", JSON.stringify({
      id: $("#pId")?.value || "",
      barcode: $("#pBarcode")?.value || "",
      sku: $("#pSku")?.value || "",
      name: $("#pName")?.value || "",
      category: $("#pCategory")?.value || "",
      purchase_price: $("#pPurchase")?.value || "0",
      sell_price: $("#pSell")?.value || "0",
      stock: $("#pStock")?.value || "0",
      min_stock: $("#pMinStock")?.value || "0"
    }));
  }catch(_){}
}

function restoreProductBarcodeScanDraft(){
  let draft = null;

  try{
    draft = JSON.parse(localStorage.getItem("camilla_product_scan_draft") || "null");
    localStorage.removeItem("camilla_product_scan_draft");
  }catch(_){
    draft = null;
  }

  if(!draft) return false;

  openProductModal();

  $("#pId").value = draft.id || "";
  $("#pBarcode").value = draft.barcode || "";
  $("#pSku").value = draft.sku || "";
  $("#pName").value = draft.name || "";
  $("#pCategory").value = draft.category || "";
  $("#pPurchase").value = draft.purchase_price || 0;
  $("#pSell").value = draft.sell_price || 0;
  $("#pStock").value = draft.stock || 0;
  $("#pMinStock").value = draft.min_stock || 0;

  if(draft.id){
    currentEditingProduct = {
      id: Number(draft.id),
      image_path: ""
    };
    $("#productModalTitle").textContent = "Edit Produk";
    $("#deleteProductBtn")?.classList.remove("hidden");
  }

  return true;
}

window.handleNativeBarcode = function(code, target="cart"){
  stopBrowserBarcodeScanner();

  if(target === "master"){
    restoreProductBarcodeScanDraft();
  }

  processScannedBarcode(code, target);
};

async function requestBarcodeScan(target="cart"){
  barcodeScanTarget = target;

  if(window.ReactNativeWebView?.postMessage){
    if(target === "master"){
      saveProductBarcodeScanDraft();
    }

    const section = saveNativeScannerResumeState(target);

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:"scan-barcode",
      target,
      section
    }));
    return;
  }

  await startBrowserBarcodeScanner(target);
}

function scannerStatus(message){
  const status = $("#barcodeScannerStatus");
  if(status) status.textContent = message;
}

function cameraLabel(device, index){
  const label = String(device?.label || "").trim();
  return label || `Kamera ${index + 1}`;
}

async function populateBarcodeCameras(selectedId=""){
  const select = $("#barcodeCameraSelect");
  if(!select || !navigator.mediaDevices?.enumerateDevices) return [];

  try{
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter(item => item.kind === "videoinput");

    const current = selectedId || barcodePreferredDeviceId || select.value || "";
    select.innerHTML = `<option value="">Kamera otomatis</option>` + devices.map((device, index) =>
      `<option value="${escapeHtml(device.deviceId)}">${escapeHtml(cameraLabel(device, index))}</option>`
    ).join("");

    if(current && devices.some(item => item.deviceId === current)){
      select.value = current;
    }

    return devices;
  }catch(_){
    return [];
  }
}

function chooseDefaultCamera(devices=[]){
  if(!Array.isArray(devices) || !devices.length) return "";

  // Di HP prioritaskan kamera belakang. Di laptop umumnya hanya ada integrated webcam,
  // sehingga kamera pertama adalah pilihan paling aman.
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  if(mobile){
    const rear = devices.find(item => /back|rear|environment|belakang/i.test(item.label || ""));
    if(rear) return rear.deviceId;
  }

  return devices[0].deviceId || "";
}

async function loadZxingBrowser(){
  if(window.ZXingBrowser?.BrowserMultiFormatReader){
    return window.ZXingBrowser;
  }

  const existing = document.querySelector('script[data-camilla-zxing="1"]');
  if(existing){
    await new Promise((resolve, reject) => {
      if(window.ZXingBrowser?.BrowserMultiFormatReader){
        resolve();
        return;
      }
      existing.addEventListener("load", resolve, {once:true});
      existing.addEventListener("error", reject, {once:true});
    });
    return window.ZXingBrowser;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@zxing/browser@0.1.5/umd/zxing-browser.min.js";
    script.async = true;
    script.dataset.camillaZxing = "1";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Library scanner gagal dimuat."));
    document.head.appendChild(script);
  });

  return window.ZXingBrowser;
}

async function startNativeBarcodeDetector(target="cart", preferredDeviceId=""){
  barcodeScannerEngine = "native";
  const video = $("#barcodeVideo");

  const videoConstraints = preferredDeviceId
    ? {deviceId:{exact:preferredDeviceId}, width:{ideal:1280}, height:{ideal:720}}
    : {facingMode:{ideal:"environment"}, width:{ideal:1280}, height:{ideal:720}};

  barcodeStream = await navigator.mediaDevices.getUserMedia({
    video:videoConstraints,
    audio:false
  });

  video.srcObject = barcodeStream;
  await video.play();

  const devices = await populateBarcodeCameras(preferredDeviceId);
  const activeTrack = barcodeStream.getVideoTracks?.()[0];
  const activeSettings = activeTrack?.getSettings?.() || {};
  const activeId = activeSettings.deviceId || preferredDeviceId || chooseDefaultCamera(devices);
  if(activeId){
    barcodePreferredDeviceId = activeId;
    const select = $("#barcodeCameraSelect");
    if(select && [...select.options].some(opt => opt.value === activeId)) select.value = activeId;
  }

  const supported = await BarcodeDetector.getSupportedFormats();
  const wanted = ["ean_13","ean_8","upc_a","upc_e","code_128","code_39","code_93","codabar","itf","qr_code"];
  const formats = wanted.filter(item => supported.includes(item));
  const detector = new BarcodeDetector(formats.length ? {formats} : undefined);

  scannerStatus("Kamera aktif. Arahkan barcode ke dalam kotak.");

  const detect = async () => {
    if(!barcodeStream || barcodeScannerEngine !== "native") return;
    try{
      const codes = await detector.detect(video);
      if(codes?.length){
        const value = codes[0].rawValue || "";
        if(value){
          const activeTarget = barcodeScanTarget;
          stopBrowserBarcodeScanner();
          await processScannedBarcode(value, activeTarget);
          return;
        }
      }
    }catch(_){ }
    barcodeScanFrame = requestAnimationFrame(detect);
  };

  barcodeScanFrame = requestAnimationFrame(detect);
}

async function startZxingBarcodeScanner(target="cart", preferredDeviceId=""){
  barcodeScannerEngine = "zxing";
  scannerStatus("Menyiapkan scanner kompatibilitas kamera laptop...");

  const ZXing = await loadZxingBrowser();
  if(!ZXing?.BrowserMultiFormatReader){
    throw new Error("Scanner kompatibilitas tidak tersedia.");
  }

  let devices = [];
  try{
    devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
  }catch(_){
    devices = await populateBarcodeCameras(preferredDeviceId);
  }

  const select = $("#barcodeCameraSelect");
  if(select){
    const current = preferredDeviceId || barcodePreferredDeviceId || "";
    select.innerHTML = `<option value="">Kamera otomatis</option>` + devices.map((device, index) =>
      `<option value="${escapeHtml(device.deviceId)}">${escapeHtml(cameraLabel(device, index))}</option>`
    ).join("");
    if(current && devices.some(item => item.deviceId === current)) select.value = current;
  }

  const deviceId = preferredDeviceId || barcodePreferredDeviceId || chooseDefaultCamera(devices) || undefined;
  if(deviceId) barcodePreferredDeviceId = deviceId;

  const reader = new ZXing.BrowserMultiFormatReader();
  barcodeZxingControls = await reader.decodeFromVideoDevice(
    deviceId,
    $("#barcodeVideo"),
    async (result) => {
      if(!result || barcodeBusy) return;
      const value = result.getText ? result.getText() : String(result.text || result || "");
      if(!value) return;

      const activeTarget = barcodeScanTarget;
      stopBrowserBarcodeScanner();
      await processScannedBarcode(value, activeTarget);
    }
  );

  scannerStatus("Kamera laptop/webcam aktif. Arahkan barcode ke dalam kotak.");
}

async function startBrowserBarcodeScanner(target="cart", preferredDeviceId=""){
  barcodeScanTarget = target;
  barcodePreferredDeviceId = preferredDeviceId || barcodePreferredDeviceId || "";

  const modal = $("#barcodeScannerModal");
  if(!modal) return;

  if(!navigator.mediaDevices?.getUserMedia){
    showToast("Browser ini tidak mendukung akses kamera.");
    return;
  }

  // getUserMedia hanya diizinkan browser pada HTTPS/localhost.
  if(!window.isSecureContext && !["localhost", "127.0.0.1"].includes(location.hostname)){
    showToast(`Kamera browser memerlukan HTTPS. Buka ${branding.app_name || "aplikasi"} melalui HTTPS.`);
    return;
  }

  stopBrowserBarcodeScanner({keepModal:true});
  modal.classList.add("active");
  document.body.classList.add("modal-open");
  $("#barcodeManualInput").value = "";
  scannerStatus("Meminta izin kamera...");

  try{
    if(typeof BarcodeDetector !== "undefined"){
      await startNativeBarcodeDetector(target, barcodePreferredDeviceId);
    }else{
      await startZxingBarcodeScanner(target, barcodePreferredDeviceId);
    }
  }catch(error){
    // Jika BarcodeDetector ada tetapi gagal pada browser/device tertentu,
    // coba ZXing sebelum menyerah.
    if(barcodeScannerEngine === "native"){
      try{
        stopBrowserBarcodeScanner({keepModal:true});
        modal.classList.add("active");
        document.body.classList.add("modal-open");
        await startZxingBarcodeScanner(target, barcodePreferredDeviceId);
        return;
      }catch(_){ }
    }

    stopBrowserBarcodeScanner({keepModal:true});
    modal.classList.add("active");
    document.body.classList.add("modal-open");
    scannerStatus("Kamera tidak dapat dibuka. Periksa izin kamera browser atau pilih kamera lain.");
  }
}

function stopBrowserBarcodeScanner({keepModal=false}={}){
  if(barcodeScanFrame){
    cancelAnimationFrame(barcodeScanFrame);
    barcodeScanFrame = null;
  }

  if(barcodeZxingControls){
    try{ barcodeZxingControls.stop(); }catch(_){ }
    barcodeZxingControls = null;
  }

  if(barcodeStream){
    barcodeStream.getTracks().forEach(track => track.stop());
    barcodeStream = null;
  }

  barcodeScannerEngine = "";

  const video = $("#barcodeVideo");
  if(video) video.srcObject = null;

  const modal = $("#barcodeScannerModal");
  if(modal && !keepModal) modal.classList.remove("active");

  if(!keepModal && !document.querySelector(".modal-overlay.active")){
    document.body.classList.remove("modal-open");
  }
}

$("#scanProductBarcodeBtn")?.addEventListener("click", () => requestBarcodeScan("cart"));
$("#scanCartBarcodeBtn")?.addEventListener("click", () => requestBarcodeScan("cart"));
$("#scanMasterBarcodeBtn")?.addEventListener("click", () => requestBarcodeScan("master"));
$("#closeBarcodeScanner")?.addEventListener("click", () => stopBrowserBarcodeScanner());
$("#cancelBarcodeScanner")?.addEventListener("click", () => stopBrowserBarcodeScanner());

$("#barcodeCameraSelect")?.addEventListener("change", async event => {
  barcodePreferredDeviceId = event.target.value || "";
  await startBrowserBarcodeScanner(barcodeScanTarget, barcodePreferredDeviceId);
});

$("#refreshBarcodeCameraBtn")?.addEventListener("click", async () => {
  await populateBarcodeCameras(barcodePreferredDeviceId);
  showToast("Daftar kamera diperbarui.");
});

async function submitManualBarcode(){
  const input = $("#barcodeManualInput");
  const value = input?.value?.trim() || "";
  if(!value) return;
  const target = barcodeScanTarget;
  stopBrowserBarcodeScanner();
  await processScannedBarcode(value, target);
}

$("#barcodeManualSubmit")?.addEventListener("click", submitManualBarcode);
$("#barcodeManualInput")?.addEventListener("keydown", event => {
  if(event.key === "Enter"){
    event.preventDefault();
    submitManualBarcode();
  }
});

window.addEventListener("beforeunload", () => stopBrowserBarcodeScanner());
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "hidden" && $("#barcodeScannerModal")?.classList.contains("active")){
    stopBrowserBarcodeScanner();
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

  tbody.innerHTML = users.map(user => {
    const avatarHtml = user.photo_path
      ? `<div class="avatar has-photo"><img src="${escapeHtml(user.photo_path)}" alt="Foto ${escapeHtml(user.name || user.username || 'User')}"></div>`
      : `<div class="avatar">${escapeHtml((user.name || user.username || "U").charAt(0).toUpperCase())}</div>`;

    return `
      <tr>
        <td>
          <div class="user-list-name">
            ${avatarHtml}
            <strong>${escapeHtml(user.name)}</strong>
          </div>
        </td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.email || "-")}</td>
        <td>${escapeHtml(user.phone || "-")}</td>
        <td class="user-address-cell" title="${escapeHtml(user.address || '')}">${escapeHtml(user.address || "-")}</td>
        <td>
          <span class="role-badge ${user.role === "admin" ? "admin" : "cashier"}">
            ${roleLabel(user.role)}
          </span>
        </td>
        <td>${escapeHtml(user.created_at || "-")}</td>
        <td class="user-action-cell">
          <button class="edit-product" onclick="openUserModal(${Number(user.id)})">Edit</button>
        </td>
      </tr>`;
  }).join("");

  empty.style.display = users.length ? "none" : "block";
}

function renderUserPhotoPreview(src="", fallback="U"){
  const preview = $("#userPhotoPreview");
  if(!preview) return;
  if(src){
    preview.innerHTML = `<img src="${escapeHtml(src)}" alt="Preview foto user">`;
  }else{
    preview.innerHTML = `<span>${escapeHtml((fallback || "U").charAt(0).toUpperCase())}</span>`;
  }
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
  $("#uEmail").value = user?.email || "";
  $("#uPhone").value = user?.phone || "";
  $("#uAddress").value = user?.address || "";
  $("#uRole").value = user?.role === "admin" ? "admin" : "cashier";
  $("#uPassword").value = "";
  $("#uPhoto").value = "";
  $("#uRemovePhoto").checked = false;
  $("#userPhotoRemoveWrap").classList.toggle("hidden", !user?.photo_path);
  renderUserPhotoPreview(user?.photo_path || "", user?.name || user?.username || "U");

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

$("#uPhoto")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if(!file){
    renderUserPhotoPreview(currentEditingUser?.photo_path || "", currentEditingUser?.name || currentEditingUser?.username || $("#uName")?.value || "U");
    return;
  }

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if(!allowed.includes(file.type)){
    event.target.value = "";
    alert("Format foto harus JPG, PNG, atau WEBP.");
    return;
  }
  if(file.size > 3 * 1024 * 1024){
    event.target.value = "";
    alert("Ukuran foto maksimal 3 MB.");
    return;
  }

  $("#uRemovePhoto").checked = false;
  const reader = new FileReader();
  reader.onload = () => renderUserPhotoPreview(reader.result, $("#uName")?.value || "U");
  reader.readAsDataURL(file);
});

$("#uRemovePhoto")?.addEventListener("change", event => {
  if(event.target.checked){
    if($("#uPhoto")) $("#uPhoto").value = "";
    renderUserPhotoPreview("", $("#uName")?.value || currentEditingUser?.name || "U");
  }else{
    renderUserPhotoPreview(currentEditingUser?.photo_path || "", currentEditingUser?.name || "U");
  }
});

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

  const form = new FormData();
  form.append("id", $("#uId").value);
  form.append("name", $("#uName").value.trim());
  form.append("username", $("#uUsername").value.trim());
  form.append("email", $("#uEmail").value.trim());
  form.append("phone", $("#uPhone").value.trim());
  form.append("address", $("#uAddress").value.trim());
  form.append("role", $("#uRole").value);
  form.append("password", $("#uPassword").value);
  form.append("remove_photo", $("#uRemovePhoto")?.checked ? "1" : "0");
  form.append("permissions", JSON.stringify($$(".uPermission")
    .filter(input => input.checked)
    .map(input => input.value)));

  const photoFile = $("#uPhoto").files?.[0];
  if(photoFile){
    form.append("photo", photoFile);
  }

  try{
    await api("user_save", {
      method:"POST",
      body:form
    });

    closeUserModal();

    // Jika admin mengubah dirinya sendiri, refresh session user.
    const me = await api("me");
    currentUser = me.user;
    currentPermissions = me.permissions || [];
    $("#userName").textContent = currentUser.name || currentUser.username;
    $("#userRole").textContent = currentUser.role === "admin" ? "Administrator" : "Kasir";
    renderCurrentUserAvatar();
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

let activeProductQtyEditorId = null;

function getProductQtyInput(productId){
  return document.getElementById(`productQty-${Number(productId)}`);
}

function getProductQtyEditor(productId){
  return document.getElementById(`productQtyEditor-${Number(productId)}`);
}

function getProductAddButton(productId){
  return document.getElementById(`productAddBtn-${Number(productId)}`);
}

function clampProductQty(productId, value){
  const product = products.find(item => Number(item.id) === Number(productId));
  const stock = Math.max(0, Number(product?.stock || 0));
  if(stock <= 0) return 0;

  const numeric = Math.floor(Number(value || 0));
  if(!Number.isFinite(numeric)) return 0;
  return Math.min(stock, Math.max(0, numeric));
}

function normalizeProductQty(productId){
  const input = getProductQtyInput(productId);
  if(!input) return 0;

  const qty = clampProductQty(productId, input.value);
  input.value = qty;
  return qty;
}

function closeProductQtyEditor(productId, resetQty = false){
  const editor = getProductQtyEditor(productId);
  const button = getProductAddButton(productId);
  const input = getProductQtyInput(productId);

  editor?.classList.add("hidden");
  if(button){
    button.textContent = "+";
    button.classList.remove("confirm");
    button.title = "Pilih jumlah produk";
  }
  if(resetQty && input) input.value = 0;
  if(Number(activeProductQtyEditorId) === Number(productId)) activeProductQtyEditorId = null;
}

function openProductQtyEditor(productId){
  if(activeProductQtyEditorId !== null && Number(activeProductQtyEditorId) !== Number(productId)){
    closeProductQtyEditor(activeProductQtyEditorId, false);
  }

  const editor = getProductQtyEditor(productId);
  const button = getProductAddButton(productId);
  const input = getProductQtyInput(productId);
  if(!editor || !button || !input || input.disabled) return;

  editor.classList.remove("hidden");
  button.textContent = "✓";
  button.classList.add("confirm");
  button.title = "Tambahkan ke keranjang";
  activeProductQtyEditorId = Number(productId);

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function adjustProductQty(productId, delta){
  const input = getProductQtyInput(productId);
  if(!input || input.disabled) return;

  const current = clampProductQty(productId, input.value);
  const next = clampProductQty(productId, current + Number(delta || 0));
  input.value = next;
  input.focus();
}

function addProductQtyToCart(productId){
  const input = getProductQtyInput(productId);
  const qty = input ? normalizeProductQty(productId) : 0;

  if(qty <= 0){
    showToast("Masukkan jumlah produk minimal 1.");
    input?.focus();
    return false;
  }

  if(addToCart(productId, qty)){
    closeProductQtyEditor(productId, true);
    return true;
  }
  return false;
}

function handleProductAddClick(productId){
  const editor = getProductQtyEditor(productId);
  if(!editor || editor.classList.contains("hidden")){
    openProductQtyEditor(productId);
    return;
  }
  addProductQtyToCart(productId);
}

function handleProductQtyKeydown(event, productId){
  if(event.key === "Enter"){
    event.preventDefault();
    addProductQtyToCart(productId);
  }else if(event.key === "Escape"){
    event.preventDefault();
    closeProductQtyEditor(productId, false);
  }
}

function addToCart(productId, quantity = 1){
  const product = products.find(item => Number(item.id) === Number(productId));
  if(!product) return false;

  const stock = Number(product.stock || 0);
  if(stock <= 0){
    showToast("Stok produk habis.");
    return false;
  }

  const qtyToAdd = Math.max(1, Math.floor(Number(quantity || 1)));
  const existing = cart.find(item => Number(item.id) === Number(productId));
  const currentQty = existing ? Number(existing.qty || 0) : 0;
  const finalQty = currentQty + qtyToAdd;

  if(finalQty > stock){
    const remaining = Math.max(0, stock - currentQty);
    if(remaining <= 0){
      showToast("Qty di keranjang sudah mencapai stok tersedia.");
    }else{
      showToast(`Maksimal dapat menambahkan ${remaining} lagi. Stok tersedia ${stock}.`);
    }
    return false;
  }

  if(existing){
    existing.qty = finalQty;
    existing.stock = stock;
    existing.price = Number(product.sell_price);
  }else{
    cart.push({
      id:Number(product.id),
      name:product.name,
      category:product.category || "",
      price:Number(product.sell_price),
      stock:stock,
      qty:qtyToAdd
    });
  }

  saveCart();
  renderCart();
  showToast(`${qtyToAdd} x ${product.name} ditambahkan ke keranjang.`);
  return true;
}

window.addToCart = addToCart;
window.addProductQtyToCart = addProductQtyToCart;
window.handleProductAddClick = handleProductAddClick;
window.openProductQtyEditor = openProductQtyEditor;
window.closeProductQtyEditor = closeProductQtyEditor;
window.handleProductQtyKeydown = handleProductQtyKeydown;
window.adjustProductQty = adjustProductQty;
window.normalizeProductQty = normalizeProductQty;

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

function getCartTotal(){
  return cart.reduce((sum,item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function selectedPaymentMethod(){
  return $("#paymentMethod")?.value || "cash";
}

function applyPaymentMethodUI(){
  const isQr = selectedPaymentMethod() === "qr";
  $("#cashPaymentField")?.classList.toggle("hidden", isQr);
  $("#changeRow")?.classList.toggle("hidden", isQr);
  if(isQr){
    $("#paidInput").value = String(getCartTotal());
  }
  updateCartSummary();
}

$("#paymentMethod")?.addEventListener("change", applyPaymentMethodUI);

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
  const method = selectedPaymentMethod();

  if(method === "cash" && summary.paid < summary.total){
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

  if(method === "qr"){
    await openQrPayment(summary.total);
    return;
  }

  await finalizeSale("cash", summary.paid);
});


function normalizeQrisSetting(item){
  return {
    id:Number(item?.id || 0),
    name:String(item?.name || "QRIS"),
    payload:String(item?.payload || ""),
    is_active:Number(item?.is_active || 0) === 1,
    is_default:Number(item?.is_default || 0) === 1,
    created_at:item?.created_at || "",
    updated_at:item?.updated_at || ""
  };
}

function getDefaultActiveQris(){
  const active = qrSettings.activeItems || [];
  if(!active.length) return null;

  const current = active.find(item => Number(item.id) === Number(qrSettings.selectedId));
  if(current) return current;

  return active.find(item => item.is_default) || active[0];
}

function renderQrCode(container, payload, size=220, emptyMessage="Payload QRIS tidak tersedia."){
  if(!container) return false;

  container.innerHTML = "";
  const value = String(payload || "").trim();

  if(!value){
    container.innerHTML = `<div class="qr-empty">${escapeHtml(emptyMessage)}</div>`;
    return false;
  }

  if(typeof QRCode === "undefined"){
    container.innerHTML = '<div class="qr-empty">Library QR belum termuat. Periksa koneksi lalu refresh halaman.</div>';
    return false;
  }

  try{
    new QRCode(container, {
      text:value,
      width:size,
      height:size,
      correctLevel:QRCode.CorrectLevel?.M ?? undefined
    });
    return true;
  }catch(error){
    console.error("QR render error", error);
    container.innerHTML = '<div class="qr-empty">QR gagal dibuat. Periksa payload QRIS.</div>';
    return false;
  }
}

function renderQrisPreview(payload){
  const preview = $("#qrSettingPreviewCode");
  renderQrCode(preview, payload, 220, "Masukkan payload QRIS untuk melihat preview.");
}

function resetQrisEditor(){
  currentEditingQrisId = null;
  if($("#qrisSettingId")) $("#qrisSettingId").value = "";
  if($("#qrisFormTitle")) $("#qrisFormTitle").textContent = "Tambah QRIS";
  if($("#qrMerchantName")) $("#qrMerchantName").value = "";
  if($("#qrPaymentPayload")) $("#qrPaymentPayload").value = "";
  if($("#qrisIsActive")) $("#qrisIsActive").checked = true;
  if($("#qrisIsDefault")) $("#qrisIsDefault").checked = false;
  $("#cancelQrisEditBtn")?.classList.add("hidden");
  renderQrisPreview("");
}

function fillQrisEditor(item){
  if(!item) return resetQrisEditor();

  currentEditingQrisId = Number(item.id);
  if($("#qrisSettingId")) $("#qrisSettingId").value = String(item.id);
  if($("#qrisFormTitle")) $("#qrisFormTitle").textContent = "Edit QRIS";
  if($("#qrMerchantName")) $("#qrMerchantName").value = item.name || "";
  if($("#qrPaymentPayload")) $("#qrPaymentPayload").value = item.payload || "";
  if($("#qrisIsActive")) $("#qrisIsActive").checked = !!item.is_active;
  if($("#qrisIsDefault")) $("#qrisIsDefault").checked = !!item.is_default;
  $("#cancelQrisEditBtn")?.classList.remove("hidden");
  renderQrisPreview(item.payload || "");
  $("#qrMerchantName")?.focus();
}

function renderQrisSettingsList(){
  const box = $("#qrisSettingsList");
  if(!box) return;

  const items = qrSettings.items || [];
  const info = $("#qrisListInfo");
  if(info){
    const activeCount = items.filter(item => item.is_active).length;
    info.textContent = `${items.length} QRIS tersimpan • ${activeCount} aktif`;
  }

  if(!items.length){
    box.innerHTML = `
      <div class="empty-state qris-empty-list">
        <div>📱</div>
        <h3>Belum ada QRIS</h3>
        <p>Tambahkan QRIS pertama untuk digunakan saat pembayaran.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = items.map(item => `
    <div class="qris-setting-card ${item.is_active ? "" : "is-inactive"}" data-qris-card-id="${item.id}">
      <div class="qris-card-qr-wrap">
        <div class="qris-card-qr" data-qris-code-id="${item.id}" aria-label="QR ${escapeHtml(item.name)}"></div>
      </div>
      <div class="qris-card-main">
        <div class="qris-card-copy">
          <div class="qris-card-title">
            <strong>${escapeHtml(item.name)}</strong>
            ${item.is_default ? '<span class="qris-badge default">Default</span>' : ""}
            ${item.is_active ? '<span class="qris-badge active">Aktif</span>' : '<span class="qris-badge inactive">Nonaktif</span>'}
          </div>
          <small>${escapeHtml(item.payload ? `${item.payload.slice(0,42)}${item.payload.length > 42 ? "…" : ""}` : "Payload kosong")}</small>
        </div>
      </div>
      <div class="qris-card-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-qris-edit="${item.id}">Edit</button>
        <button class="btn btn-danger btn-sm" type="button" data-qris-delete="${item.id}">Hapus</button>
      </div>
    </div>
  `).join("");

  // Render QR setiap setting secara terpisah. Dengan ini QR kedua, ketiga, dst.
  // tidak bergantung pada preview form atau QRIS default.
  requestAnimationFrame(() => {
    items.forEach(item => {
      const qrBox = box.querySelector(`[data-qris-code-id="${item.id}"]`);
      renderQrCode(qrBox, item.payload, 112, "Payload QRIS kosong.");
    });
  });
}

async function loadQrSettings(){
  try{
    const data = await api("qr_settings");
    const items = (data.data || []).map(normalizeQrisSetting);

    qrSettings.items = items;
    qrSettings.activeItems = items.filter(item => item.is_active);

    const defaultItem = qrSettings.activeItems.find(item => item.is_default) || qrSettings.activeItems[0] || null;
    if(defaultItem && !qrSettings.activeItems.some(item => Number(item.id) === Number(qrSettings.selectedId))){
      qrSettings.selectedId = defaultItem.id;
    }else if(!defaultItem){
      qrSettings.selectedId = null;
    }

    renderQrisSettingsList();

    if(currentEditingQrisId){
      const editing = items.find(item => Number(item.id) === Number(currentEditingQrisId));
      if(editing) fillQrisEditor(editing);
      else resetQrisEditor();
    }
  }catch(error){
    const box = $("#qrisSettingsList");
    if(box) box.innerHTML = '<div class="qr-empty">Gagal membaca setting QRIS.</div>';
    throw error;
  }
}

function renderQrPaymentSelection(item, total){
  selectedPaymentQris = item || null;

  $("#qrPaymentMerchant").textContent = item?.name || "QRIS";
  $("#qrPaymentTotal").textContent = formatRupiah(total);

  const box = $("#qrPaymentCode");
  renderQrCode(box, item?.payload || "", 220, "Payload QRIS tidak tersedia.");
}

async function openQrPayment(total){
  try{
    await loadQrSettings();
  }catch(error){
    showToast(error.message || "Gagal membaca setting QRIS.");
    return;
  }

  const activeItems = qrSettings.activeItems || [];
  if(!activeItems.length){
    showToast("Belum ada QRIS aktif. Hubungi Administrator.");
    if(hasPermission("qr-settings")) showSection("qr-settings");
    return;
  }

  const select = $("#qrPaymentAccountSelect");
  const wrap = $("#qrPaymentAccountWrap");

  select.innerHTML = activeItems.map(item => `
    <option value="${item.id}">${escapeHtml(item.name)}${item.is_default ? " • Default" : ""}</option>
  `).join("");

  const selected = getDefaultActiveQris();
  if(selected){
    select.value = String(selected.id);
    qrSettings.selectedId = selected.id;
  }

  wrap?.classList.toggle("hidden", activeItems.length <= 1);

  $("#qrPaymentModal").classList.add("active");
  document.body.classList.add("modal-open");

  requestAnimationFrame(() => renderQrPaymentSelection(selected, total));
}

$("#qrPaymentAccountSelect")?.addEventListener("change", event => {
  const id = Number(event.target.value || 0);
  const item = (qrSettings.activeItems || []).find(row => Number(row.id) === id) || null;
  if(!item) return;

  qrSettings.selectedId = item.id;
  renderQrPaymentSelection(item, getCartTotal());
});

$("#cancelQrPayment")?.addEventListener("click", () => {
  $("#qrPaymentModal").classList.remove("active");
  document.body.classList.remove("modal-open");
  selectedPaymentQris = null;
});

$("#confirmQrPayment")?.addEventListener("click", async () => {
  const btn = $("#confirmQrPayment");

  if(!selectedPaymentQris?.id){
    showToast("Pilih QRIS yang digunakan.");
    return;
  }

  btn.disabled = true;
  try{
    await finalizeSale("qr", getCartTotal(), selectedPaymentQris.id);
    $("#qrPaymentModal").classList.remove("active");
    selectedPaymentQris = null;
  }finally{
    btn.disabled = false;
    document.body.classList.remove("modal-open");
  }
});

async function finalizeSale(paymentMethod, paid, qrisSettingId = null){
  const receiptItems = cart.map(item => ({
    name:item.name,
    qty:Number(item.qty),
    price:Number(item.price),
    subtotal:Number(item.qty) * Number(item.price)
  }));

  try{
    const data = await api("sale_create", {
      method:"POST",
      body:JSON.stringify({
        paid:Number(paid),
        payment_method:paymentMethod,
        qris_setting_id:paymentMethod === "qr" ? Number(qrisSettingId || 0) : null,
        items:cart.map(item => ({
          product_id:Number(item.id),
          qty:Number(item.qty)
        }))
      })
    });

    lastReceipt = {...data, items:receiptItems};
    $("#checkoutMessage").textContent = "Pembayaran berhasil disimpan ke database.";
    $("#receiptBox").innerHTML = `
      <div><strong>No. Transaksi:</strong> ${escapeHtml(data.invoice_no)}</div>
      <div><strong>Metode:</strong> ${data.payment_method === "qr" ? "QR Code / QRIS" : "Tunai"}</div>
      ${data.payment_method === "qr" && data.qris_name ? `<div><strong>QRIS:</strong> ${escapeHtml(data.qris_name)}</div>` : ""}
      <div><strong>Total:</strong> ${formatRupiah(data.total)}</div>
      <div><strong>Bayar:</strong> ${formatRupiah(data.paid)}</div>
      <div><strong>Kembalian:</strong> ${formatRupiah(data.change)}</div>
    `;

    cart = [];
    saveCart();
    $("#paidInput").value = 0;
    renderCart();

    await loadProducts();
    if(hasPermission("dashboard")) await loadDashboard();

    $("#checkoutModal").classList.add("active");
    document.body.classList.add("modal-open");
  }catch(error){
    alert(error.message);
    throw error;
  }
}

function buildReceiptHtml(){
  if(!lastReceipt) return "";
  const r = lastReceipt;
  const rows = (r.items || []).map(item => `
    <tr><td>${escapeHtml(item.name)}</td><td style="text-align:center">${item.qty}</td><td style="text-align:right">${formatRupiah(item.subtotal)}</td></tr>
  `).join("");

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(r.invoice_no)}</title><style>
    @page{size:58mm auto;margin:3mm}body{font-family:Arial,sans-serif;width:52mm;margin:0;font-size:10px;color:#111}
    h2{text-align:center;margin:0 0 3px;font-size:14px}.center{text-align:center}.line{border-top:1px dashed #333;margin:7px 0}
    table{width:100%;border-collapse:collapse;font-size:9px}td{padding:2px 0;vertical-align:top}.tot td{font-weight:bold;font-size:10px}
  </style></head><body>
    <h2>${escapeHtml((branding.website_name || "MINIMARKET").toUpperCase())}</h2><div class="center">Struk Penjualan</div><div class="line"></div>
    <div>No: ${escapeHtml(r.invoice_no)}</div><div>Tanggal: ${escapeHtml(r.created_at || "")}</div><div>Kasir: ${escapeHtml(r.cashier || "")}</div>
    <div>Bayar: ${r.payment_method === "qr" ? "QR Code / QRIS" : "Tunai"}</div>
    ${r.payment_method === "qr" && r.qris_name ? `<div>QRIS: ${escapeHtml(r.qris_name)}</div>` : ""}
    <div class="line"></div>
    <table>${rows}</table><div class="line"></div><table>
      <tr class="tot"><td>Total</td><td style="text-align:right">${formatRupiah(r.total)}</td></tr>
      <tr><td>Bayar</td><td style="text-align:right">${formatRupiah(r.paid)}</td></tr>
      <tr><td>Kembali</td><td style="text-align:right">${formatRupiah(r.change)}</td></tr>
    </table><div class="line"></div><div class="center">Terima kasih telah berbelanja</div>
  </body></html>`;
}

function printReceipt(){
  if(!lastReceipt){
    showToast("Belum ada struk yang dapat dicetak.");
    return;
  }

  const html = buildReceiptHtml();
  if(window.ReactNativeWebView?.postMessage){
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:"print-html",
      html,
      title:`Struk ${lastReceipt.invoice_no}`
    }));
    showToast("Membuka printer perangkat...");
    return;
  }

  const w = window.open("", "_blank", "width=420,height=700");
  if(!w) return showToast("Popup print diblokir browser.");
  w.document.write(html.replace('</body>', '<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400)}<\\/script></body>'));
  w.document.close();
}

$("#printReceiptBtn")?.addEventListener("click", printReceipt);

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
          <span>${row.payment_method === "qr" ? `QRIS${row.qris_name ? ` - ${escapeHtml(row.qris_name)}` : ""}` : "Tunai"} • Bayar ${formatRupiah(row.paid)} • Kembali ${formatRupiah(row.change_amount)}</span>
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
    lastReportData = data;
    const summary = data.summary || {};

    $("#reportSales").textContent = formatRupiah(summary.sales);
    $("#reportTransactions").textContent = summary.transactions || 0;
    $("#reportAverage").textContent = formatRupiah(summary.average_transaction);
    $("#reportIncome").textContent = formatRupiah(summary.income);
    $("#reportExpenses").textContent = formatRupiah(summary.expenses);
    $("#reportNetIncome").textContent = formatRupiah(summary.net_income);
    $("#reportCashSales").textContent = formatRupiah(summary.cash_sales);
    $("#reportQrSales").textContent = formatRupiah(summary.qr_sales);
    $("#reportManualIncome").textContent = formatRupiah(summary.manual_income);
    $("#reportExpenseDetail").textContent = formatRupiah(summary.expenses);

    $("#reportProducts").innerHTML = (data.top_products || []).map(row => `
      <tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${Number(row.qty || 0)}</td><td>${formatRupiah(row.amount)}</td></tr>
    `).join("") || `<tr><td colspan="3">Belum ada data pada bulan ini.</td></tr>`;
  }catch(error){
    showToast(error.message);
  }
}

$("#reportFilterBtn")?.addEventListener("click", loadReport);

/* ---------------- FINANCE ---------------- */
async function loadFinance(){
  try{
    const month = $("#financeMonth").value || currentMonth();
    $("#financeMonth").value = month;
    const data = await api(`finance_list&month=${encodeURIComponent(month)}`);

    $("#financeIncomeTotal").textContent = formatRupiah(data.income);
    $("#financeExpenseTotal").textContent = formatRupiah(data.expense);
    $("#financeNetTotal").textContent = formatRupiah(data.net);

    $("#financeTableBody").innerHTML = (data.data || []).map(row => `
      <tr>
        <td>${escapeHtml(row.trx_date)}</td>
        <td><span class="finance-type ${row.type}">${row.type === "income" ? "Pemasukan" : "Pengeluaran"}</span></td>
        <td><strong>${escapeHtml(row.category || "-")}</strong><br><small>${escapeHtml(row.description)}</small></td>
        <td>${formatRupiah(row.amount)}</td>
        <td>${escapeHtml(row.created_by_name || "-")}</td>
        <td>${isAdmin() ? `<button class="btn btn-danger btn-sm" type="button" onclick="deleteFinance(${Number(row.id)})">Hapus</button>` : ""}</td>
      </tr>
    `).join("") || `<tr><td colspan="6">Belum ada data pemasukan/pengeluaran pada bulan ini.</td></tr>`;
  }catch(error){
    showToast(error.message);
  }
}

$("#financeFilterBtn")?.addEventListener("click", loadFinance);

$("#financeForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if(!hasPermission("finance")) return showToast("Anda tidak memiliki akses menu keuangan.");
  try{
    await api("finance_create", {method:"POST", body:JSON.stringify({
      trx_date:$("#financeDate").value,
      type:$("#financeType").value,
      category:$("#financeCategory").value.trim(),
      description:$("#financeDescription").value.trim(),
      amount:Number($("#financeAmount").value || 0)
    })});
    $("#financeDescription").value = "";
    $("#financeCategory").value = "";
    $("#financeAmount").value = "";
    showToast("Data keuangan disimpan.");
    await loadFinance();
  }catch(error){ showToast(error.message); }
});

window.deleteFinance = async function(id){
  if(!isAdmin()) return showToast("Hanya Administrator yang dapat menghapus data.");
  if(!confirm("Hapus data pemasukan/pengeluaran ini?")) return;
  try{
    await api("finance_delete", {method:"POST",body:JSON.stringify({id})});
    await loadFinance();
  }catch(error){ showToast(error.message); }
};

/* ---------------- BRANDING SETTINGS ---------------- */
async function normalizeBrandingIconToPng(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try{
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if(!ctx) throw new Error("Canvas browser tidak tersedia.");
        ctx.clearRect(0, 0, size, size);
        const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const x = Math.round((size - w) / 2);
        const y = Math.round((size - h) / 2);
        ctx.drawImage(img, x, y, w, h);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if(!blob) return reject(new Error("Gagal mengubah icon ke PNG."));
          resolve(new File([blob], "branding-icon.png", {type:"image/png"}));
        }, "image/png", 1);
      }catch(error){
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("File icon tidak dapat dibaca."));
    };
    img.src = url;
  });
}

$("#brandingIconFile")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if(!file) return;
  if(file.size > 3 * 1024 * 1024){
    event.target.value = "";
    return showToast("Ukuran icon maksimal 3 MB.");
  }
  const reader = new FileReader();
  reader.onload = () => {
    if($("#brandingIconPreview")) $("#brandingIconPreview").src = String(reader.result || "");
    if($("#brandingPreviewIcon")) $("#brandingPreviewIcon").src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
});

$("#brandingWebsiteName")?.addEventListener("input", event => {
  if($("#brandingPreviewWebsiteName")) $("#brandingPreviewWebsiteName").textContent = event.target.value || "Nama Website";
});

$("#brandingAppName")?.addEventListener("input", event => {
  if($("#brandingPreviewAppName")) $("#brandingPreviewAppName").textContent = event.target.value || "Nama Aplikasi";
});

$("#brandingSettingsForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if(!hasPermission("branding-settings")) return showToast("Anda tidak memiliki autorisasi menu Branding Aplikasi.");

  const websiteName = $("#brandingWebsiteName").value.trim();
  const appName = $("#brandingAppName").value.trim();
  const iconFile = $("#brandingIconFile")?.files?.[0];

  try{
    await api("branding_save", {
      method:"POST",
      body:JSON.stringify({website_name:websiteName, app_name:appName})
    });

    if(iconFile){
      const uploadFile = await normalizeBrandingIconToPng(iconFile);
      const form = new FormData();
      form.append("icon", uploadFile, "branding-icon.png");
      await api("branding_icon_upload", {method:"POST", body:form});
      $("#brandingIconFile").value = "";
    }

    await loadBranding();
    showToast("Branding aplikasi berhasil diperbarui.");
  }catch(error){
    showToast(error.message || "Gagal menyimpan branding.");
  }
});

$("#resetBrandingIconBtn")?.addEventListener("click", async () => {
  if(!hasPermission("branding-settings")) return;
  if(!confirm("Gunakan kembali icon default aplikasi?")) return;
  try{
    await api("branding_icon_reset", {method:"POST", body:"{}"});
    if($("#brandingIconFile")) $("#brandingIconFile").value = "";
    await loadBranding();
    showToast("Icon default digunakan kembali.");
  }catch(error){
    showToast(error.message || "Gagal mereset icon.");
  }
});

/* ---------------- QR SETTINGS ---------------- */
$("#addQrisSettingBtn")?.addEventListener("click", () => {
  if(!hasPermission("qr-settings")) return;
  resetQrisEditor();
  $("#qrMerchantName")?.focus();
});

$("#cancelQrisEditBtn")?.addEventListener("click", () => {
  resetQrisEditor();
});

$("#qrPaymentPayload")?.addEventListener("input", event => {
  renderQrisPreview(event.target.value);
});

$("#qrSettingsForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if(!hasPermission("qr-settings")) return;

  const name = $("#qrMerchantName").value.trim();
  const payload = $("#qrPaymentPayload").value.trim();

  if(!name){
    showToast("Nama QRIS / Merchant wajib diisi.");
    $("#qrMerchantName")?.focus();
    return;
  }

  if(!payload){
    showToast("Payload QRIS wajib diisi.");
    $("#qrPaymentPayload")?.focus();
    return;
  }

  try{
    await api("qr_settings_save", {
      method:"POST",
      body:JSON.stringify({
        id:Number(currentEditingQrisId || 0),
        name,
        payload,
        is_active:$("#qrisIsActive").checked ? 1 : 0,
        is_default:$("#qrisIsDefault").checked ? 1 : 0
      })
    });

    showToast(currentEditingQrisId ? "QRIS berhasil diperbarui." : "QRIS berhasil ditambahkan.");
    resetQrisEditor();
    await loadQrSettings();
  }catch(error){
    showToast(error.message || "Gagal menyimpan QRIS.");
  }
});

$("#qrisSettingsList")?.addEventListener("click", async event => {
  const editBtn = event.target.closest("[data-qris-edit]");
  const deleteBtn = event.target.closest("[data-qris-delete]");

  if(editBtn){
    const id = Number(editBtn.dataset.qrisEdit || 0);
    const item = (qrSettings.items || []).find(row => Number(row.id) === id);
    if(item) fillQrisEditor(item);
    return;
  }

  if(deleteBtn){
    if(!hasPermission("qr-settings")) return;

    const id = Number(deleteBtn.dataset.qrisDelete || 0);
    const item = (qrSettings.items || []).find(row => Number(row.id) === id);
    if(!item) return;

    if(!confirm(`Hapus setting QRIS "${item.name}"?`)) return;

    try{
      await api("qr_settings_delete", {
        method:"POST",
        body:JSON.stringify({id})
      });

      if(Number(currentEditingQrisId) === id) resetQrisEditor();
      showToast("QRIS berhasil dihapus.");
      await loadQrSettings();
    }catch(error){
      showToast(error.message || "Gagal menghapus QRIS.");
    }
  }
});

/* ---------------- SERVER EXPORT ---------------- */
function base64ToBlob(base64, mimeType){
  const raw = atob(base64);
  const chunks = [];
  const step = 1024;
  for(let i=0; i<raw.length; i+=step){
    const part = raw.slice(i, i+step);
    const bytes = new Uint8Array(part.length);
    for(let j=0; j<part.length; j++) bytes[j] = part.charCodeAt(j);
    chunks.push(bytes);
  }
  return new Blob(chunks, {type:mimeType});
}

function deliverExportFile(file){
  if(window.ReactNativeWebView?.postMessage){
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:"download-file",
      fileName:file.file_name,
      mimeType:file.mime_type,
      base64:file.base64
    }));
    showToast("File siap disimpan dari perangkat.");
    return;
  }

  const blob = base64ToBlob(file.base64, file.mime_type);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportReport(format){
  const month = $("#reportMonth").value || currentMonth();
  const button = format === "pdf" ? $("#exportPdfBtn") : $("#exportExcelBtn");
  const oldText = button?.textContent;
  if(button){ button.disabled = true; button.textContent = "Menyiapkan..."; }
  try{
    const file = await api(`report_export&month=${encodeURIComponent(month)}&format=${encodeURIComponent(format)}`);
    deliverExportFile(file);
  }catch(error){
    showToast(error.message || "Export gagal.");
  }finally{
    if(button){ button.disabled = false; button.textContent = oldText; }
  }
}

$("#exportPdfBtn")?.addEventListener("click", () => exportReport("pdf"));
$("#exportExcelBtn")?.addEventListener("click", () => exportReport("excel"));

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
  }else if(section === "finance" && hasPermission("finance")){
    await loadFinance();
  }else if(section === "qr-settings" && hasPermission("qr-settings")){
    await loadQrSettings();
  }else if(section === "branding-settings" && hasPermission("branding-settings")){
    await loadBrandingSettings();
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
if($("#financeMonth")) $("#financeMonth").value = currentMonth();

restoreCart();
renderCart();

(async () => {
  await loadBranding();
  try{
    const data = await api("me");
    showApp(data.user, data.permissions || []);
  }catch(_){
    showLogin();
    restoreSavedLoginUI();
  }
})();


document.addEventListener("DOMContentLoaded", () => { if($("#financeDate")) $("#financeDate").value = new Date().toISOString().slice(0,10); applyPaymentMethodUI(); });
