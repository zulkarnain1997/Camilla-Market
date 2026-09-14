<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="Camilla Market Minimarket POS">
  <meta name="theme-color" content="#0f172a">
  <title>Camilla Market - Minimarket POS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="assets/css/style.css?v=20260915-logosame1">
</head>
<body>
  <div class="pull-refresh-indicator" id="pullRefreshIndicator">
    <div class="pull-refresh-spinner" id="pullRefreshSpinner"></div>
    <span id="pullRefreshText">Tarik untuk refresh</span>
  </div>
  <div class="mobile-drawer-overlay" id="mobileDrawerOverlay"></div>
  <div class="mobile-swipe-edge" id="mobileSwipeEdge" aria-hidden="true"></div>

  <!-- LOGIN -->
  <div class="login-shell" id="loginView">
    <form class="login-card" id="loginForm">
      <iframe class="login-logo" src="files/camilla-market-logo.html" title="Logo Camilla Market" scrolling="no"></iframe>
      <h1>Camilla Market POS</h1>
      <p>Masuk untuk mengelola transaksi minimarket.</p>

      <div class="login-field">
        <label>Username</label>
        <input id="username" value="admin" autocomplete="username">
      </div>

      <div class="login-field">
        <label>Password</label>
        <input id="password" type="password" value="admin123" autocomplete="current-password">
      </div>

      <button class="btn btn-block" type="submit" style="margin-top:18px">Masuk</button>
      <div class="login-error" id="loginError"></div>
    </form>
  </div>

  <!-- APPLICATION -->
  <div id="appView" class="hidden">
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <iframe class="brand-logo-frame" src="files/camilla-market-logo.html" title="Logo Camilla Market" scrolling="no"></iframe>
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
        <a href="#users" class="admin-only" data-section="users">
          <span>👥</span> User
        </a>
      </nav>

      <div class="sidebar-footer">
        <small>Camilla Market POS</small>
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
              <h2>Kelola penjualan Camilla Market lebih mudah.</h2>
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
          <div class="section-toolbar">
            <div>
              <h2>Produk & Stok</h2>
              <p>Cari produk, tambah ke keranjang, atau kelola master produk.</p>
            </div>

            <div class="toolbar-actions">
              <div class="search-box">
                <span>🔎</span>
                <input type="text" id="productSearch" placeholder="Nama / barcode / SKU...">
              </div>

              <select id="categoryFilter">
                <option value="all">Semua Kategori</option>
              </select>

              <button class="btn add-product-btn admin-only" id="addProductBtn">+ Produk</button>
            </div>
          </div>

          <div class="category-chips" id="categoryChips"></div>
          <div class="product-grid" id="productGrid"></div>
        </section>

        <!-- CART -->
        <section class="page-section" id="cart">
          <div class="section-toolbar">
            <div>
              <h2>Keranjang Belanja</h2>
              <p>QTY dapat diketik langsung dan total otomatis berubah.</p>
            </div>
            <button class="btn btn-danger-soft" id="clearCartBtn">Kosongkan Keranjang</button>
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
                <label>Uang Bayar</label>
                <input type="number" id="paidInput" min="0" value="0" inputmode="numeric">
              </div>

              <div class="summary-row change">
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
              <p>Ringkasan omzet dan produk terlaris berdasarkan bulan.</p>
            </div>

            <div class="report-filter">
              <input type="month" id="reportMonth">
              <button class="btn" id="reportFilterBtn">Tampilkan</button>
            </div>
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
          <input id="pBarcode">
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
          <label>Role</label>
          <select id="uRole">
            <option value="cashier">Kasir / Non-Admin</option>
            <option value="admin">Administrator</option>
          </select>
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
      <button class="btn btn-block" id="closeCheckoutModal">Selesai</button>
    </div>
  </div>

  <div class="toast hidden" id="toast"></div>

  <script src="assets/js/app.js?v=20260915-logosame1"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js?v=20260915-logosame1').catch(()=>{});
    }
  </script>
</body>
</html>
