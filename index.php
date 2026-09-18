<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" id="appMetaDescription" content="Ada Apa Aja POS">
  <meta name="theme-color" content="#0f172a">
  <title>Ada Apa Aja POS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" id="dynamicFavicon" href="files/default-logo.png">
  <link rel="manifest" href="manifest.php">
  <link rel="stylesheet" href="assets/css/style.css?v=20260918-auth-boot-v134">
  <script>
    try {
      if (localStorage.getItem("camilla_native_scanner_resume") === "1") {
        document.documentElement.classList.add("native-scanner-resume-pending");
      }
    } catch (_) {}
  </script>
</head>
<body class="auth-booting">
  <div class="auth-boot-screen" id="authBootScreen" aria-live="polite">
    <div class="auth-boot-card">
      <img src="files/default-logo.png" alt="Ada Apa Aja" class="auth-boot-logo">
      <div class="auth-boot-spinner" aria-hidden="true"></div>
      <span>Memuat sesi...</span>
    </div>
  </div>
  <div class="pull-refresh-indicator" id="pullRefreshIndicator">
    <div class="pull-refresh-spinner" id="pullRefreshSpinner"></div>
    <span id="pullRefreshText">Tarik untuk refresh</span>
  </div>
  <div class="mobile-drawer-overlay" id="mobileDrawerOverlay"></div>
  <div class="mobile-swipe-edge" id="mobileSwipeEdge" aria-hidden="true"></div>

  <!-- LOGIN -->
  <div class="login-shell" id="loginView">
    <form class="login-card" id="loginForm" autocomplete="off">
      <img class="login-logo branding-icon" id="loginBrandIcon" src="files/default-logo.png" alt="Icon aplikasi">
      <h1 id="loginBrandName">Ada Apa Aja POS</h1>
      <p>Masuk untuk mengelola transaksi toko serba ada.</p>

      <div class="login-field">
        <label>Username</label>
        <input id="username" name="cm_login_username" value="" autocomplete="off" autocapitalize="none" spellcheck="false">
      </div>

      <div class="login-field">
        <label>Password</label>
        <div class="login-password-wrap">
          <input id="password" name="cm_login_password" type="password" value="" autocomplete="new-password">
          <button
            class="login-password-toggle"
            id="toggleLoginPassword"
            type="button"
            aria-label="Tampilkan password"
            aria-pressed="false"
            title="Tampilkan password">
            <svg class="password-eye password-eye-open" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"></path>
              <circle cx="12" cy="12" r="2.7"></circle>
            </svg>
            <svg class="password-eye password-eye-closed hidden" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 3l18 18"></path>
              <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-2.2 2.8"></path>
              <path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 6 10 6c1.6 0 3-.4 4.2-.9"></path>
              <path d="M10.1 10.1a2.7 2.7 0 0 0 3.8 3.8"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="login-options-row">
        <label class="login-save-password"><input type="checkbox" id="saveLoginPassword"><span>Simpan Password</span></label>
        <button type="button" class="login-link-button" id="forgotPasswordBtn">Lupa Password?</button>
      </div>
      <div class="saved-login-info hidden" id="savedLoginInfo"><span>Password akun ini tersimpan aman di perangkat.</span><button type="button" id="removeSavedLoginBtn">Hapus</button></div>
      <button class="btn btn-block" type="submit" style="margin-top:14px">Masuk</button>
      <div class="login-register-row"><span>Belum punya akun?</span><button type="button" class="login-link-button" id="registerAccountBtn">Daftar</button></div>
      <div class="login-error" id="loginError"></div>
    </form>
  </div>

  <div class="modal-overlay" id="registerModal"><div class="modal login-account-modal"><div class="modal-head-row"><div><h2>Daftar Akun</h2><p class="login-account-subtitle">Akun baru otomatis dibuat sebagai Kasir / Non-Admin.</p></div><button class="modal-close" type="button" id="closeRegisterModal">✕</button></div><form id="registerForm" class="modal-form" autocomplete="off">
    <div class="field"><label>Nama Lengkap</label><input id="regName" required></div><div class="field"><label>Username</label><input id="regUsername" required autocomplete="off"></div><div class="field"><label>Email</label><input id="regEmail" type="email" required></div><div class="field"><label>No. Telepon</label><input id="regPhone" type="tel" required></div>
    <div class="field"><label>Password</label><div class="login-password-wrap"><input id="regPassword" type="password" required minlength="6"><button class="login-password-toggle account-password-toggle" type="button" data-password-target="regPassword">👁</button></div></div><div class="field"><label>Konfirmasi Password</label><div class="login-password-wrap"><input id="regPasswordConfirm" type="password" required minlength="6"><button class="login-password-toggle account-password-toggle" type="button" data-password-target="regPasswordConfirm">👁</button></div></div>
    <div class="login-account-message" id="registerMessage"></div><div class="modal-form-actions"><button type="button" class="btn btn-secondary" id="cancelRegisterBtn">Batal</button><button type="submit" class="btn">Daftar Akun</button></div></form></div></div>

  <div class="modal-overlay" id="forgotPasswordModal"><div class="modal login-account-modal"><div class="modal-head-row"><div><h2>Lupa Password</h2><p class="login-account-subtitle">Verifikasi username, email, dan nomor telepon yang terdaftar.</p></div><button class="modal-close" type="button" id="closeForgotPasswordModal">✕</button></div><form id="forgotPasswordForm" class="modal-form" autocomplete="off">
    <div class="field"><label>Username</label><input id="forgotUsername" required></div><div class="field"><label>Email Terdaftar</label><input id="forgotEmail" type="email" required></div><div class="field full"><label>No. Telepon Terdaftar</label><input id="forgotPhone" type="tel" required></div>
    <div class="field"><label>Password Baru</label><div class="login-password-wrap"><input id="forgotNewPassword" type="password" required minlength="6"><button class="login-password-toggle account-password-toggle" type="button" data-password-target="forgotNewPassword">👁</button></div></div><div class="field"><label>Konfirmasi Password Baru</label><div class="login-password-wrap"><input id="forgotConfirmPassword" type="password" required minlength="6"><button class="login-password-toggle account-password-toggle" type="button" data-password-target="forgotConfirmPassword">👁</button></div></div>
    <div class="login-account-message" id="forgotPasswordMessage"></div><div class="modal-form-actions"><button type="button" class="btn btn-secondary" id="cancelForgotPasswordBtn">Batal</button><button type="submit" class="btn">Ganti Password</button></div></form></div></div>

  <!-- APPLICATION -->
  <div id="appView" class="hidden">
    <aside class="sidebar" id="sidebar">
      <div class="brand brand-dynamic">
        <img class="brand-logo-frame branding-icon" id="sidebarBrandIcon" src="files/default-logo.png" alt="Icon aplikasi">
        <div class="brand-copy">
          <strong id="sidebarBrandName">Ada Apa Aja POS</strong>
          <small id="sidebarWebsiteName">Ada Apa Aja</small>
        </div>
      </div>

      <nav class="side-nav">
        <a href="#dashboard" class="active" data-section="dashboard" data-auth-menu="dashboard">
          <span>🏠</span> Dashboard
        </a>
        <a href="#products" data-section="products" data-auth-menu="products">
          <span>🛒</span> Produk & Stok
        </a>
        <a href="#cart" data-section="cart" data-auth-menu="cart">
          <span>🧺</span> Keranjang
          <b class="cart-badge" id="sideCartCount">0</b>
        </a>
        <a href="#history" data-section="history" data-auth-menu="history">
          <span>🧾</span> Riwayat
        </a>
        <a href="#report" data-section="report" data-auth-menu="report">
          <span>📊</span> Laporan Bulanan
        </a>
        <a href="#finance" data-section="finance" data-auth-menu="finance">
          <span>💰</span> Pemasukan & Pengeluaran
        </a>
        <a href="#qr-settings" data-section="qr-settings" data-auth-menu="qr-settings">
          <span>🔳</span> Setting QR
        </a>
        <a href="#branding-settings" data-section="branding-settings" data-auth-menu="branding-settings">
          <span>🎨</span> Branding Aplikasi
        </a>
        <a href="#users" class="admin-only" data-section="users">
          <span>👥</span> User
        </a>
      </nav>

      <div class="sidebar-footer">
        <small id="sidebarFooterBrand">Ada Apa Aja POS</small>
        <button class="logout-btn" id="logoutBtn">Keluar</button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-btn menu-btn" id="menuBtn">☰</button>
          <div>
            <h1 id="pageTitle">Dashboard</h1>
            <p id="pageSubtitle">Ringkasan aktivitas minimarket hari ini</p>
          </div>
        </div>

        <div class="topbar-actions">
          <div class="search-box top-search">
            <span>🔎</span>
            <input type="text" id="globalSearch" placeholder="Cari produk...">
          </div>

          <button class="cart-button" id="quickCartBtn" title="Keranjang">
            🧺
            <span id="topCartCount">0</span>
          </button>

          <div class="user-box">
            <div class="avatar" id="userAvatar">A</div>
            <div class="user-text">
              <strong id="userName">Admin</strong>
              <small id="userRole">Kasir</small>
            </div>
          </div>
        </div>
      </header>

      <div class="content">

        <!-- DASHBOARD -->
        <section class="page-section active" id="dashboard">
          <div class="welcome-card">
            <div>
              <span class="eyebrow">Selamat datang 👋</span>
              <h2 id="dashboardWelcomeTitle">Kelola penjualan lebih mudah.</h2>
              <p>Pantau transaksi, produk terlaris, stok, dan nilai penjualan dalam satu tampilan.</p>
            </div>
            <button class="btn btn-light" onclick="showSection('products')">Mulai Transaksi</button>
          </div>

          <div class="stats-grid">
            <article class="stat-card">
              <div class="stat-icon">💰</div>
              <div>
                <span>Penjualan Hari Ini</span>
                <strong id="salesToday">Rp 0</strong>
                <small>Omzet transaksi hari ini</small>
              </div>
            </article>

            <article class="stat-card">
              <div class="stat-icon">🧾</div>
              <div>
                <span>Total Transaksi</span>
                <strong id="transactionCount">0</strong>
                <small>Transaksi hari ini</small>
              </div>
            </article>

            <article class="stat-card">
              <div class="stat-icon">📦</div>
              <div>
                <span>Total Produk</span>
                <strong id="productCount">0</strong>
                <small>Produk aktif</small>
              </div>
            </article>

            <article class="stat-card warning">
              <div class="stat-icon">⚠️</div>
              <div>
                <span>Stok Menipis</span>
                <strong id="lowStockCount">0</strong>
                <small>Perlu restock</small>
              </div>
            </article>
          </div>

          <div class="dashboard-grid">
            <article class="panel chart-panel">
              <div class="panel-head">
                <div>
                  <h3>Grafik Penjualan</h3>
                  <p>Omzet 7 hari terakhir</p>
                </div>
                <button class="btn" id="refreshDashboardBtn">Refresh</button>
              </div>
              <div class="chart" id="salesChart"></div>
            </article>

            <article class="panel">
              <div class="panel-head">
                <div>
                  <h3>Produk Terlaris</h3>
                  <p>Bulan berjalan</p>
                </div>
              </div>
              <div class="best-products" id="bestProducts"></div>
            </article>
          </div>

          <div class="panel" style="margin-top:20px">
            <div class="panel-head">
              <div>
                <h3>Transaksi Terbaru</h3>
                <p>Aktivitas penjualan terbaru</p>
              </div>
            </div>
            <div class="cart-table-wrap">
              <table class="cart-table">
                <thead>
                  <tr><th>Invoice</th><th>Kasir</th><th>Total</th><th>Waktu</th></tr>
                </thead>
                <tbody id="recentSales"></tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- PRODUCTS -->
        <section class="page-section" id="products">
          <div class="product-control-card">
            <div class="product-control-row product-control-top">
              <div class="product-toolbar-copy">
                <h2>Produk & Stok</h2>
                <p>Cari produk, tambah ke keranjang, atau kelola master<br class="desktop-break"> produk.</p>
              </div>

              <div class="product-filter-row">
                <div class="search-box product-search-box">
                  <span class="product-search-icon" aria-hidden="true">⌕</span>
                  <input type="text" id="productSearch" placeholder="Nama / barcode / SKU...">
                </div>
                <button class="btn btn-secondary product-scan-btn" id="scanProductBarcodeBtn" type="button">
                  <span class="product-scan-icon" aria-hidden="true">▣</span>
                  <span>Scan Barcode</span>
                </button>
              </div>
            </div>

            <div class="product-control-divider"></div>

            <div class="product-control-row product-control-bottom">
              <div class="category-filter-title">
                <strong>Filter Kategori</strong>
                <small>Pilih satu atau lebih kategori dari dropdown.</small>
              </div>

              <div class="product-bottom-actions">
                <div class="category-filter-dropdown" id="categoryFilterDropdown">
                  <button
                    type="button"
                    class="category-filter-trigger"
                    id="categoryFilterToggle"
                    aria-haspopup="true"
                    aria-expanded="false">
                    <span class="category-filter-trigger-label">Kategori</span>
                    <span class="category-filter-trigger-value" id="categoryFilterSummary">Semua kategori</span>
                    <span class="category-filter-trigger-icon" aria-hidden="true">⌄</span>
                  </button>
                  <div class="category-filter-menu hidden" id="categoryFilterMenu">
                    <div class="category-filter-menu-head">
                      <strong>Pilih Kategori</strong>
                      <button type="button" class="category-filter-reset hidden" id="clearCategoryFilterBtn">Reset</button>
                    </div>
                    <div class="category-filter-options" id="categoryChips"></div>
                  </div>
                </div>

                <button class="btn admin-only product-excel-btn product-excel-download" id="downloadProductTemplateBtn" type="button" title="Download template Excel Produk & Stok">
                  <span class="product-excel-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14a2 2 0 0 0 2-2v-3"></path><path d="M3 16v3a2 2 0 0 0 2 2"></path>
                    </svg>
                  </span>
                  <span class="product-excel-label">Download Template</span>
                </button>

                <button class="btn admin-only product-excel-btn product-excel-upload" id="uploadProductExcelBtn" type="button" title="Upload data Produk & Stok dari Excel">
                  <span class="product-excel-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 21V9"></path><path d="m7 14 5-5 5 5"></path><path d="M5 3h14a2 2 0 0 1 2 2v3"></path><path d="M3 8V5a2 2 0 0 1 2-2"></path>
                    </svg>
                  </span>
                  <span class="product-excel-label">Upload Excel</span>
                </button>
                <input id="productExcelFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
                <button class="btn add-product-btn admin-only product-add-btn" id="addProductBtn">+ Produk</button>
              </div>
            </div>
          </div>

          <div class="product-grid" id="productGrid"></div>
          <div class="product-pagination hidden" id="productPagination" aria-label="Paging produk"></div>
        </section>

        <!-- CART -->
        <section class="page-section" id="cart">
          <div class="section-toolbar">
            <div>
              <h2>Keranjang Belanja</h2>
              <p>QTY dapat diketik langsung dan total otomatis berubah.</p>
            </div>
            <div class="toolbar-actions">
              <button class="btn btn-secondary" id="scanCartBarcodeBtn" type="button">📷 Scan Barcode</button>
              <button class="btn btn-danger-soft" id="clearCartBtn">Kosongkan Keranjang</button>
            </div>
          </div>

          <div class="cart-layout">
            <div class="panel cart-table-panel">
              <div class="cart-table-wrap">
                <table class="cart-table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Harga</th>
                      <th width="150">QTY</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="cartTableBody"></tbody>
                </table>
              </div>

              <div class="empty-state" id="emptyCart">
                <div>🧺</div>
                <h3>Keranjang masih kosong</h3>
                <p>Tambahkan produk dari menu Produk & Stok.</p>
                <button class="btn" onclick="showSection('products')">Lihat Produk</button>
              </div>
            </div>

            <aside class="panel summary-card">
              <h3>Ringkasan Belanja</h3>

              <div class="summary-row">
                <span>Total Item</span>
                <strong id="cartItemCount">0</strong>
              </div>

              <div class="summary-row total">
                <span>Total Bayar</span>
                <strong id="cartTotal">Rp 0</strong>
              </div>

              <div class="pay-field">
                <label>Metode Pembayaran</label>
                <select id="paymentMethod">
                  <option value="cash">Tunai</option>
                  <option value="qr">QR Code / QRIS</option>
                </select>
              </div>

              <div class="pay-field" id="cashPaymentField">
                <label>Uang Bayar</label>
                <input type="number" id="paidInput" min="0" value="0" inputmode="numeric">
              </div>

              <div class="summary-row change" id="changeRow">
                <span>Kembalian</span>
                <strong id="changeText">Rp 0</strong>
              </div>

              <button class="btn btn-block" id="checkoutBtn">Bayar & Simpan</button>
            </aside>
          </div>
        </section>

        <!-- HISTORY -->
        <section class="page-section" id="history">
          <div class="section-toolbar">
            <div>
              <h2>Riwayat Transaksi</h2>
              <p>Lihat transaksi berdasarkan bulan.</p>
            </div>

            <div class="history-filter">
              <input type="month" id="historyMonth">
              <button class="btn" id="historyFilterBtn">Tampilkan</button>
            </div>
          </div>

          <div class="panel">
            <div class="history-list" id="historyList"></div>
            <div class="empty-state" id="emptyHistory">
              <div>🧾</div>
              <h3>Belum ada transaksi</h3>
              <p>Transaksi selesai akan muncul di sini.</p>
            </div>
          </div>
        </section>

        <!-- REPORT -->
        <section class="page-section" id="report">
          <div class="section-toolbar">
            <div>
              <h2>Laporan Bulanan</h2>
              <p>Summary penjualan, pemasukan, pengeluaran, dan produk terlaris.</p>
            </div>

            <div class="report-filter">
              <input type="month" id="reportMonth">
              <button class="btn" id="reportFilterBtn">Tampilkan</button>
              <button class="btn btn-secondary" id="exportPdfBtn" type="button">📄 Export PDF</button>
              <button class="btn btn-secondary" id="exportExcelBtn" type="button">📗 Export Excel</button>
            </div>
          </div>

          <div class="export-info">
            <strong>Export siap untuk Web & Android.</strong> PDF dan Excel dibuat langsung oleh server tanpa library CDN, lalu file diunduh atau dibagikan melalui perangkat.
          </div>

          <div class="stats-grid">
            <article class="stat-card">
              <div class="stat-icon">💵</div>
              <div><span>Omzet</span><strong id="reportSales">Rp 0</strong><small>Bulan terpilih</small></div>
            </article>
            <article class="stat-card">
              <div class="stat-icon">🧾</div>
              <div><span>Transaksi</span><strong id="reportTransactions">0</strong><small>Total transaksi</small></div>
            </article>
            <article class="stat-card">
              <div class="stat-icon">📈</div>
              <div><span>Rata-rata</span><strong id="reportAverage">Rp 0</strong><small>Per transaksi</small></div>
            </article>
          </div>

          <div class="stats-grid finance-stats" style="margin-top:14px">
            <article class="stat-card">
              <div class="stat-icon">💰</div>
              <div><span>Total Pemasukan</span><strong id="reportIncome">Rp 0</strong><small>Penjualan + pemasukan lain</small></div>
            </article>
            <article class="stat-card">
              <div class="stat-icon">💸</div>
              <div><span>Total Pengeluaran</span><strong id="reportExpenses">Rp 0</strong><small>Biaya bulan terpilih</small></div>
            </article>
            <article class="stat-card">
              <div class="stat-icon">🧮</div>
              <div><span>Pemasukan Bersih</span><strong id="reportNetIncome">Rp 0</strong><small>Pemasukan - pengeluaran</small></div>
            </article>
          </div>

          <div class="dashboard-grid" style="margin-top:20px">
            <div class="panel">
              <div class="panel-head"><div><h3>Ringkasan Metode Pembayaran</h3><p>Tunai dan QR/QRIS pada bulan terpilih.</p></div></div>
              <div class="summary-list">
                <div class="summary-row"><span>Tunai</span><strong id="reportCashSales">Rp 0</strong></div>
                <div class="summary-row"><span>QR / QRIS</span><strong id="reportQrSales">Rp 0</strong></div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-head"><div><h3>Arus Kas Tambahan</h3><p>Di luar transaksi penjualan.</p></div></div>
              <div class="summary-list">
                <div class="summary-row"><span>Pemasukan Lain</span><strong id="reportManualIncome">Rp 0</strong></div>
                <div class="summary-row"><span>Pengeluaran</span><strong id="reportExpenseDetail">Rp 0</strong></div>
              </div>
            </div>
          </div>

          <div class="panel" style="margin-top:20px">
            <div class="panel-head">
              <div><h3>Produk Terlaris</h3><p>Berdasarkan QTY terjual</p></div>
            </div>
            <div class="cart-table-wrap">
              <table class="report-products">
                <thead><tr><th>Produk</th><th>QTY</th><th>Nilai Penjualan</th></tr></thead>
                <tbody id="reportProducts"></tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- FINANCE -->
        <section class="page-section" id="finance">
          <div class="section-toolbar">
            <div>
              <h2>Pemasukan & Pengeluaran</h2>
              <p>Catat dan pantau arus kas selain transaksi penjualan.</p>
            </div>
            <div class="report-filter">
              <input type="month" id="financeMonth">
              <button class="btn" id="financeFilterBtn" type="button">Tampilkan</button>
            </div>
          </div>

          <div class="stats-grid finance-stats">
            <article class="stat-card"><div class="stat-icon">📥</div><div><span>Pemasukan Lain</span><strong id="financeIncomeTotal">Rp 0</strong><small>Bulan terpilih</small></div></article>
            <article class="stat-card"><div class="stat-icon">📤</div><div><span>Pengeluaran</span><strong id="financeExpenseTotal">Rp 0</strong><small>Bulan terpilih</small></div></article>
            <article class="stat-card"><div class="stat-icon">💼</div><div><span>Selisih</span><strong id="financeNetTotal">Rp 0</strong><small>Pemasukan lain - pengeluaran</small></div></article>
          </div>

          <div class="panel" id="financeEntryPanel" style="margin-top:20px">
            <div class="panel-head"><div><h3>Input Arus Kas</h3><p>Tambahkan pemasukan lain atau biaya operasional.</p></div></div>
            <form id="financeForm" class="finance-form">
              <input type="date" id="financeDate" required>
              <select id="financeType"><option value="expense">Pengeluaran</option><option value="income">Pemasukan Lain</option></select>
              <input id="financeCategory" placeholder="Kategori (opsional)">
              <input id="financeDescription" placeholder="Keterangan" required>
              <input type="number" id="financeAmount" min="1" placeholder="Nominal" required inputmode="numeric">
              <button class="btn" type="submit">Simpan</button>
            </form>
          </div>

          <div class="panel" style="margin-top:20px">
            <div class="panel-head"><div><h3>Riwayat Pemasukan & Pengeluaran</h3><p>Data berdasarkan bulan yang dipilih.</p></div></div>
            <div class="cart-table-wrap">
              <table class="report-products"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori / Keterangan</th><th>Nominal</th><th>Input Oleh</th><th></th></tr></thead><tbody id="financeTableBody"></tbody></table>
            </div>
          </div>
        </section>


        <!-- BRANDING SETTINGS -->
        <section class="page-section" id="branding-settings">
          <div class="section-toolbar">
            <div>
              <h2>Branding Aplikasi</h2>
              <p>Ubah identitas website dan aplikasi tanpa perlu mengubah source code.</p>
            </div>
          </div>

          <div class="branding-layout">
            <div class="panel branding-setting-page">
              <form id="brandingSettingsForm" class="branding-settings-form">
                <div class="field">
                  <label>Nama Website</label>
                  <input id="brandingWebsiteName" maxlength="80" placeholder="Contoh: Toko Sejahtera" required>
                  <small>Dipakai pada judul website, laporan, struk, dan nama merchant default.</small>
                </div>

                <div class="field">
                  <label>Nama Aplikasi</label>
                  <input id="brandingAppName" maxlength="80" placeholder="Contoh: Toko Sejahtera POS" required>
                  <small>Dipakai pada halaman login, sidebar, dan identitas aplikasi.</small>
                </div>

                <div class="field full">
                  <label>Icon / Logo Aplikasi</label>
                  <div class="branding-icon-editor">
                    <img id="brandingIconPreview" src="files/default-logo.png" alt="Preview icon aplikasi">
                    <div class="branding-icon-actions">
                      <input id="brandingIconFile" type="file" accept="image/png,image/jpeg,image/webp">
                      <small>Gunakan PNG/JPG/WEBP. Maksimal 3 MB. Gambar otomatis dinormalisasi menjadi PNG 512×512 agar tampilan web dan icon launcher APK konsisten saat build.</small>
                      <button class="btn btn-secondary" id="resetBrandingIconBtn" type="button">Gunakan Icon Default</button>
                    </div>
                  </div>
                </div>

                <div class="branding-note">
                  <strong>Perubahan web langsung aktif.</strong> Untuk nama dan icon launcher APK Android, lakukan build ulang APK setelah branding diubah karena launcher Android ditentukan saat proses build.
                </div>

                <div class="modal-form-actions">
                  <button class="btn" type="submit">Simpan Branding</button>
                </div>
              </form>
            </div>

            <div class="panel branding-preview-panel">
              <div class="panel-head">
                <div><h3>Preview Branding</h3><p>Tampilan identitas yang sedang aktif.</p></div>
              </div>
              <div class="branding-preview-card">
                <img id="brandingPreviewIcon" src="files/default-logo.png" alt="Preview branding">
                <strong id="brandingPreviewAppName">Ada Apa Aja POS</strong>
                <span id="brandingPreviewWebsiteName">Ada Apa Aja</span>
              </div>
            </div>
          </div>
        </section>

        <!-- QR SETTINGS -->
        <section class="page-section" id="qr-settings">
          <div class="section-toolbar">
            <div>
              <h2>Setting QRIS</h2>
              <p>Kelola beberapa QRIS pembayaran dan tentukan QRIS default.</p>
            </div>
            <button class="btn" id="addQrisSettingBtn" type="button">+ Tambah QRIS</button>
          </div>

          <div class="qris-settings-grid">
            <div class="panel qr-setting-page">
              <div class="panel-head">
                <div>
                  <h3 id="qrisFormTitle">Tambah QRIS</h3>
                  <p>Simpan nama merchant dan payload QRIS. Beberapa QRIS dapat aktif bersamaan.</p>
                </div>
              </div>

              <form id="qrSettingsForm" class="qr-settings-form">
                <input type="hidden" id="qrisSettingId" value="">
                <div class="field">
                  <label>Nama QRIS / Merchant</label>
                  <input id="qrMerchantName" placeholder="Contoh: QRIS BCA / QRIS Utama" required>
                </div>
                <div class="field full">
                  <label>Payload QR / QRIS</label>
                  <textarea id="qrPaymentPayload" rows="5" placeholder="Paste payload QR/QRIS di sini" required></textarea>
                </div>

                <div class="qris-option-row field full">
                  <label class="qris-check">
                    <input type="checkbox" id="qrisIsActive" checked>
                    <span><strong>Aktif</strong><small>QRIS dapat dipilih saat pembayaran.</small></span>
                  </label>
                  <label class="qris-check">
                    <input type="checkbox" id="qrisIsDefault">
                    <span><strong>Jadikan Default</strong><small>Otomatis dipilih saat membuka pembayaran QR.</small></span>
                  </label>
                </div>

                <div class="modal-form-actions field full">
                  <button class="btn btn-secondary hidden" id="cancelQrisEditBtn" type="button">Batal Edit</button>
                  <button class="btn" type="submit">Simpan QRIS</button>
                </div>
              </form>

              <div class="qr-setting-preview">
                <div>
                  <strong>Preview QRIS</strong>
                  <small>Preview mengikuti payload pada form di atas.</small>
                </div>
                <div id="qrSettingPreviewCode" class="qr-payment-code"></div>
              </div>
              <div class="export-info" style="margin-top:14px">
                Anda dapat menyimpan lebih dari satu QRIS. Saat pembayaran, kasir dapat memilih QRIS aktif yang ingin digunakan.
              </div>
            </div>

            <div class="panel qris-list-panel">
              <div class="panel-head">
                <div>
                  <h3>Daftar QRIS</h3>
                  <p id="qrisListInfo">Belum ada setting QRIS.</p>
                </div>
              </div>
              <div id="qrisSettingsList" class="qris-settings-list"></div>
            </div>
          </div>
        </section>

        <!-- USERS -->
        <section class="page-section admin-only-section" id="users">
          <div class="section-toolbar">
            <div>
              <h2>Manajemen User</h2>
              <p>Atur Administrator dan user kasir.</p>
            </div>

            <button class="btn" id="addUserBtn">+ User Baru</button>
          </div>

          <div class="panel">
            <div class="user-role-info">
              <div>
                <strong>Administrator</strong>
                <span>Akses penuh ke produk, stok, gambar, harga, user, riwayat dan laporan.</span>
              </div>
              <div>
                <strong>Kasir / Non-Admin</strong>
                <span>Hanya dapat memilih produk, mengisi keranjang dan menyimpan transaksi.</span>
              </div>
            </div>

            <div class="user-table-wrap">
              <table class="user-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>No. Telp</th>
                    <th>Alamat</th>
                    <th>Role</th>
                    <th>Dibuat</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="userTableBody"></tbody>
              </table>
            </div>

            <div class="empty-state" id="emptyUsers" style="display:none">
              <div>👥</div>
              <h3>Belum ada user</h3>
            </div>
          </div>
        </section>


      </div>
    </main>
  </div>

  <!-- PRODUCT MODAL -->
  <div class="modal-overlay" id="productModal">
    <div class="modal wide">
      <div class="modal-head-row">
        <div>
          <h2 id="productModalTitle">Tambah Produk</h2>
          <p style="color:var(--muted);font-size:12px;margin-top:4px">Isi master produk dan stok.</p>
        </div>
        <button class="modal-close" type="button" id="closeProductModal">✕</button>
      </div>

      <form id="productForm" class="modal-form">
        <input type="hidden" id="pId">

        <div class="field">
          <label>Barcode</label>
          <div class="barcode-input-row">
            <input id="pBarcode" autocomplete="off" inputmode="numeric">
            <button class="btn btn-secondary barcode-scan-inline" id="scanMasterBarcodeBtn" type="button">📷 Scan</button>
          </div>
          <small>Scan barcode kemasan produk atau ketik manual.</small>
        </div>

        <div class="field">
          <label>SKU</label>
          <input id="pSku">
        </div>

        <div class="field full">
          <label>Nama Produk</label>
          <input id="pName" required>
        </div>

        <div class="field full">
          <label>Gambar Produk</label>
          <div class="product-image-upload">
            <div class="product-image-preview" id="productImagePreview">
              <span>📷</span>
            </div>

            <div class="product-image-upload-control">
              <input
                id="pImage"
                type="file"
                accept="image/jpeg,image/png,image/webp">

              <small>
                Format JPG, PNG, atau WEBP. Maksimal 5 MB.
                Saat edit produk, pilih gambar baru hanya jika ingin mengganti gambar.
              </small>
            </div>
          </div>
        </div>

        <div class="field">
          <label>Kategori</label>
          <input id="pCategory">
        </div>

        <div class="field">
          <label>Harga Beli</label>
          <input id="pPurchase" type="number" min="0">
        </div>

        <div class="field">
          <label>Harga Jual</label>
          <input id="pSell" type="number" min="0" required>
        </div>

        <div class="field">
          <label>Stok</label>
          <input id="pStock" type="number" min="0" step="1">
        </div>

        <div class="field">
          <label>Minimum Stok</label>
          <input id="pMinStock" type="number" min="0" step="1">
        </div>

        <div class="modal-form-actions">
          <button type="button" class="btn btn-secondary" id="cancelProductBtn">Batal</button>
          <button type="button" class="btn btn-danger hidden" id="deleteProductBtn">Hapus</button>
          <button type="submit" class="btn">Simpan</button>
        </div>
      </form>
    </div>
  </div>


  <!-- USER MODAL -->
  <div class="modal-overlay" id="userModal">
    <div class="modal wide user-modal-card">
      <div class="modal-head-row">
        <div>
          <h2 id="userModalTitle">Tambah User</h2>
          <p style="color:var(--muted);font-size:12px;margin-top:4px">
            Tentukan role Administrator atau Kasir.
          </p>
        </div>
        <button class="modal-close" type="button" id="closeUserModal">✕</button>
      </div>

      <form id="userForm" class="modal-form">
        <input type="hidden" id="uId">

        <div class="field">
          <label>Nama User</label>
          <input id="uName" required autocomplete="off">
        </div>

        <div class="field">
          <label>Username</label>
          <input id="uUsername" required autocomplete="off">
        </div>

        <div class="field">
          <label>Email</label>
          <input id="uEmail" type="email" autocomplete="email" placeholder="nama@email.com">
          <small>Email digunakan untuk identitas akun dan pemulihan password.</small>
        </div>

        <div class="field">
          <label>No. Telepon</label>
          <input id="uPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Contoh: 081234567890">
        </div>

        <div class="field">
          <label>Role</label>
          <select id="uRole">
            <option value="cashier">Kasir / Non-Admin</option>
            <option value="admin">Administrator</option>
          </select>
        </div>

        <div class="field full">
          <label>Alamat</label>
          <textarea id="uAddress" rows="3" maxlength="500" placeholder="Alamat lengkap user"></textarea>
        </div>

        <div class="field full">
          <label>Foto User</label>
          <div class="user-photo-upload">
            <div class="user-photo-preview" id="userPhotoPreview"><span>👤</span></div>
            <div class="user-photo-upload-control">
              <input id="uPhoto" type="file" accept="image/jpeg,image/png,image/webp">
              <small>Format JPG, PNG, atau WEBP. Maksimal 3 MB.</small>
              <label class="user-photo-remove hidden" id="userPhotoRemoveWrap">
                <input type="checkbox" id="uRemovePhoto"> Hapus foto yang tersimpan
              </label>
            </div>
          </div>
        </div>

        <div class="field full" id="userPermissionField">
          <label>Autoriasi Menu</label>

          <div class="menu-permission-box">
            <label class="menu-permission-item">
              <input type="checkbox" class="uPermission" value="dashboard">
              <span>
                <b>Dashboard</b>
                <small>Ringkasan penjualan, grafik, dan transaksi terbaru.</small>
              </span>
            </label>

            <label class="menu-permission-item">
              <input type="checkbox" class="uPermission" value="products">
              <span>
                <b>Produk & Stok</b>
                <small>Melihat daftar produk dan memilih barang.</small>
              </span>
            </label>

            <label class="menu-permission-item">
              <input type="checkbox" class="uPermission" value="cart">
              <span>
                <b>Keranjang</b>
                <small>Input QTY, pembayaran, dan simpan transaksi.</small>
              </span>
            </label>

            <label class="menu-permission-item">
              <input type="checkbox" class="uPermission" value="history">
              <span>
                <b>Riwayat</b>
                <small>Melihat riwayat transaksi berdasarkan bulan.</small>
              </span>
            </label>

            <label class="menu-permission-item">
              <input type="checkbox" class="uPermission" value="report">
              <span>
                <b>Laporan Bulanan</b>
                <small>Melihat omzet dan produk terlaris bulanan.</small>
              </span>
            </label>

            <label class="menu-permission-item">
              <input type="checkbox" class="uPermission" value="finance">
              <span>
                <b>Pemasukan & Pengeluaran</b>
                <small>Input dan melihat arus kas tambahan.</small>
              </span>
            </label>


            <label class="menu-permission-item">
              <input type="checkbox" class="uPermission" value="qr-settings">
              <span>
                <b>Setting QR</b>
                <small>Melihat dan mengubah QR/QRIS pembayaran.</small>
              </span>
            </label>

            <label class="menu-permission-item">
              <input type="checkbox" class="uPermission" value="branding-settings">
              <span>
                <b>Branding Aplikasi</b>
                <small>Mengubah nama website, nama aplikasi, dan logo.</small>
              </span>
            </label>
          </div>

          <small id="permissionHelp">
            Pilih menu yang boleh ditampilkan untuk user ini.
          </small>
        </div>

        <div class="field">
          <label>Password</label>
          <input id="uPassword" type="password" minlength="6" autocomplete="new-password">
          <small id="userPasswordHelp">
            Minimal 6 karakter.
          </small>
        </div>

        <div class="modal-form-actions">
          <button type="button" class="btn btn-secondary" id="cancelUserBtn">Batal</button>
          <button type="button" class="btn btn-danger hidden" id="deleteUserBtn">Hapus</button>
          <button type="submit" class="btn">Simpan</button>
        </div>
      </form>
    </div>
  </div>

  <!-- CHECKOUT MODAL -->
  <div class="modal-overlay" id="checkoutModal">
    <div class="modal">
      <div class="modal-icon">✅</div>
      <h2>Transaksi Berhasil</h2>
      <p id="checkoutMessage">Pembayaran berhasil diproses.</p>
      <div class="receipt-box" id="receiptBox"></div>
      <div class="modal-form-actions">
        <button class="btn btn-secondary" id="printReceiptBtn" type="button">🖨 Print Struk</button>
        <button class="btn" id="closeCheckoutModal" type="button">Selesai</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="qrPaymentModal">
    <div class="modal qris-payment-modal">
      <div class="modal-icon">📱</div>
      <h2>Pembayaran QRIS</h2>
      <p>Scan QR di bawah lalu pastikan pembayaran sudah diterima.</p>

      <div class="pay-field qris-payment-selector" id="qrPaymentAccountWrap">
        <label>Pilih QRIS</label>
        <select id="qrPaymentAccountSelect"></select>
      </div>

      <div id="qrPaymentCode" class="qr-payment-code"></div>
      <div class="receipt-box">
        <div><strong>QRIS:</strong> <span id="qrPaymentMerchant">Ada Apa Aja</span></div>
        <div><strong>Total:</strong> <span id="qrPaymentTotal">Rp 0</span></div>
      </div>
      <div class="modal-form-actions">
        <button class="btn btn-secondary" id="cancelQrPayment" type="button">Batal</button>
        <button class="btn" id="confirmQrPayment" type="button">Pembayaran Sudah Diterima</button>
      </div>
    </div>
  </div>


  <!-- BARCODE SCANNER MODAL (Laptop/Web + Android native bridge) -->
  <div class="modal-overlay" id="barcodeScannerModal">
    <div class="modal barcode-scanner-modal">
      <div class="modal-head-row">
        <div>
          <h2>Scan Barcode Produk</h2>
          <p style="color:var(--muted);font-size:12px;margin-top:4px">Gunakan kamera laptop/webcam atau kamera HP, lalu arahkan barcode ke dalam kotak.</p>
        </div>
        <button class="modal-close" type="button" id="closeBarcodeScanner">✕</button>
      </div>

      <div class="barcode-camera-toolbar">
        <select id="barcodeCameraSelect" aria-label="Pilih kamera">
          <option value="">Kamera otomatis</option>
        </select>
        <button class="btn btn-secondary" id="refreshBarcodeCameraBtn" type="button">↻ Kamera</button>
      </div>

      <div class="barcode-camera-wrap">
        <video id="barcodeVideo" autoplay playsinline muted></video>
        <div class="barcode-frame"></div>
        <div class="barcode-scan-line" aria-hidden="true"></div>
      </div>

      <p class="barcode-scanner-status" id="barcodeScannerStatus">Menyiapkan kamera...</p>
      <small class="barcode-security-note">Kamera browser memerlukan izin kamera dan berjalan melalui HTTPS atau localhost.</small>

      <div class="barcode-manual-wrap">
        <input id="barcodeManualInput" type="text" inputmode="numeric" autocomplete="off" placeholder="Atau ketik barcode manual...">
        <button class="btn btn-secondary" id="barcodeManualSubmit" type="button">Gunakan</button>
      </div>

      <div class="modal-form-actions">
        <button class="btn btn-secondary" id="cancelBarcodeScanner" type="button">Batal</button>
      </div>
    </div>
  </div>

  <div class="toast hidden" id="toast"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="assets/js/app.js?v=20260918-auth-boot-v134"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js?v=20260918-auth-boot-v134').catch(()=>{});
    }
  </script>
</body>
</html>
