<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/db.php';

function json_response(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function input(): array {
    $raw = file_get_contents('php://input');
    if ($raw !== '') {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return $_POST;
}

function require_auth(): array {
    if (empty($_SESSION['user']['id'])) {
        json_response(['ok' => false, 'message' => 'Belum login'], 401);
    }

    // Selalu ambil role/nama/username terbaru dari database.
    // Dengan ini perubahan role oleh Administrator langsung berlaku
    // pada session user yang sedang aktif.
    $pdo = db();
    $stmt = $pdo->prepare("
        SELECT id, username, name, role
        FROM users
        WHERE id=?
    ");
    $stmt->execute([(int)$_SESSION['user']['id']]);
    $fresh = $stmt->fetch();

    if (!$fresh) {
        session_destroy();
        json_response([
            'ok' => false,
            'message' => 'User sudah tidak tersedia.'
        ], 401);
    }

    $_SESSION['user'] = [
        'id' => (int)$fresh['id'],
        'username' => $fresh['username'],
        'name' => $fresh['name'],
        'role' => $fresh['role'],
    ];

    return $_SESSION['user'];
}


function require_admin(): array {
    $user = require_auth();

    if (($user['role'] ?? '') !== 'admin') {
        json_response([
            'ok' => false,
            'message' => 'Akses hanya untuk Administrator.'
        ], 403);
    }

    return $user;
}

function normalize_role(string $role): string {
    return strtolower(trim($role)) === 'admin' ? 'admin' : 'cashier';
}


function available_menu_codes(): array {
    return ['dashboard', 'products', 'cart', 'history', 'report'];
}

function default_cashier_permissions(): array {
    return ['products', 'cart'];
}

function get_user_permissions(PDO $pdo, array $user): array {
    // Pastikan role yang dipakai adalah role terbaru dari DB,
    // bukan role lama yang mungkin masih tersimpan di session.
    $stmt = $pdo->prepare("SELECT role FROM users WHERE id=?");
    $stmt->execute([(int)$user['id']]);
    $freshRole = $stmt->fetchColumn();

    if ($freshRole === 'admin') {
        return ['dashboard', 'products', 'cart', 'history', 'report', 'users'];
    }

    $stmt = $pdo->prepare("
        SELECT menu_code
        FROM user_menu_permissions
        WHERE user_id=? AND can_read=1
        ORDER BY menu_code
    ");
    $stmt->execute([(int)$user['id']]);

    $menus = array_column($stmt->fetchAll(), 'menu_code');

    // __none__ berarti Administrator memang sengaja tidak memberikan menu.
    if (in_array('__none__', $menus, true)) {
        return [];
    }

    // Kompatibilitas user lama yang belum pernah dikonfigurasi.
    if (!$menus) {
        return default_cashier_permissions();
    }

    return array_values(array_intersect($menus, available_menu_codes()));
}

function has_menu_permission(PDO $pdo, array $user, string $menuCode): bool {
    if (($user['role'] ?? '') === 'admin') {
        return true;
    }

    return in_array(
        $menuCode,
        get_user_permissions($pdo, $user),
        true
    );
}

function require_menu_permission(PDO $pdo, string $menuCode): array {
    $user = require_auth();

    if (!has_menu_permission($pdo, $user, $menuCode)) {
        json_response([
            'ok' => false,
            'message' => 'Anda tidak memiliki autorisasi untuk menu ini.'
        ], 403);
    }

    return $user;
}

function save_user_permissions(PDO $pdo, int $userId, array $menus): void {
    $allowed = available_menu_codes();
    $menus = array_values(array_unique(array_intersect($menus, $allowed)));

    $pdo->prepare("DELETE FROM user_menu_permissions WHERE user_id=?")
        ->execute([$userId]);

    $stmt = $pdo->prepare("
        INSERT INTO user_menu_permissions(user_id, menu_code, can_read)
        VALUES(?,?,1)
    ");

    // Marker khusus agar "tidak ada menu" berbeda dengan user lama
    // yang memang belum pernah diatur autorisasinya.
    if (!$menus) {
        $stmt->execute([$userId, '__none__']);
        return;
    }

    foreach ($menus as $menu) {
        $stmt->execute([$userId, $menu]);
    }
}


function delete_product_image(?string $relativePath): void {
    if (!$relativePath) return;
    if (!str_starts_with($relativePath, 'uploads/products/')) return;

    $fullPath = __DIR__ . '/' . ltrim($relativePath, '/');
    if (is_file($fullPath)) {
        @unlink($fullPath);
    }
}

function save_product_image(array $file): string {
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;

    if ($error !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Upload gambar gagal.');
    }

    $maxSize = 5 * 1024 * 1024;
    $size = (int)($file['size'] ?? 0);

    if ($size <= 0 || $size > $maxSize) {
        throw new RuntimeException('Ukuran gambar maksimal 5 MB.');
    }

    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        throw new RuntimeException('File gambar tidak valid.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmp);

    $allowed = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
    ];

    if (!isset($allowed[$mime])) {
        throw new RuntimeException('Format gambar harus JPG, PNG, atau WEBP.');
    }

    $uploadDir = __DIR__ . '/uploads/products';

    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Folder upload gambar tidak dapat dibuat.');
    }

    $filename = 'product_' . bin2hex(random_bytes(12)) . '.' . $allowed[$mime];
    $destination = $uploadDir . '/' . $filename;

    if (!move_uploaded_file($tmp, $destination)) {
        throw new RuntimeException('Gagal menyimpan gambar produk.');
    }

    return 'uploads/products/' . $filename;
}

function invoice_no(PDO $pdo): string {
    $prefix = 'TRX' . date('Ymd');
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE invoice_no LIKE ?");
    $stmt->execute([$prefix . '%']);
    $n = (int)$stmt->fetchColumn() + 1;
    return $prefix . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
}

$action = $_GET['action'] ?? '';
$pdo = db();

try {
    if ($action === 'login') {
        $data = input();
        $username = trim((string)($data['username'] ?? ''));
        $password = (string)($data['password'] ?? '');

        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            json_response(['ok' => false, 'message' => 'Username atau password salah'], 422);
        }

        $_SESSION['user'] = [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'name' => $user['name'],
            'role' => $user['role'],
        ];

        json_response([
            'ok' => true,
            'user' => $_SESSION['user'],
            'permissions' => get_user_permissions($pdo, $_SESSION['user'])
        ]);
    }

    if ($action === 'logout') {
        session_destroy();
        json_response(['ok' => true]);
    }

    if ($action === 'me') {
        $user = require_auth();
        json_response([
            'ok' => true,
            'user' => $user,
            'permissions' => get_user_permissions($pdo, $user)
        ]);
    }

    if ($action === 'access_state') {
        $user = require_auth();

        json_response([
            'ok' => true,
            'user' => $user,
            'permissions' => get_user_permissions($pdo, $user),
            'server_time' => date('Y-m-d H:i:s')
        ]);
    }

    if ($action === 'my_permissions') {
        $user = require_auth();

        json_response([
            'ok' => true,
            'user_id' => (int)$user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
            'permissions' => get_user_permissions($pdo, $user)
        ]);
    }

    $user = require_auth();

    if ($action === 'dashboard') {
        require_menu_permission($pdo, 'dashboard');
        $today = date('Y-m-d');
        $currentMonth = date('Y-m');

        $stmt = $pdo->prepare("SELECT COALESCE(SUM(total),0) total, COUNT(*) trx FROM sales WHERE substr(created_at,1,10)=?");
        $stmt->execute([$today]);
        $sale = $stmt->fetch();

        $products = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE active=1")->fetchColumn();
        $low = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE active=1 AND stock <= min_stock")->fetchColumn();

        $stmt = $pdo->prepare("
            SELECT s.invoice_no, s.total, s.created_at, u.name cashier
            FROM sales s JOIN users u ON u.id=s.cashier_id
            ORDER BY s.id DESC LIMIT 8
        ");
        $stmt->execute();
        $recent = $stmt->fetchAll();

        // Grafik omzet 7 hari terakhir, termasuk hari tanpa transaksi.
        $stmt = $pdo->prepare("
            SELECT substr(created_at,1,10) trx_date,
                   COALESCE(SUM(total),0) total,
                   COUNT(*) transactions
            FROM sales
            WHERE substr(created_at,1,10) BETWEEN ? AND ?
            GROUP BY substr(created_at,1,10)
            ORDER BY trx_date
        ");
        $startDate = date('Y-m-d', strtotime('-6 days'));
        $stmt->execute([$startDate, $today]);
        $salesRows = [];
        foreach ($stmt->fetchAll() as $row) {
            $salesRows[$row['trx_date']] = $row;
        }

        $salesChart = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} days"));
            $salesChart[] = [
                'date' => $date,
                'label' => date('d/m', strtotime($date)),
                'total' => isset($salesRows[$date]) ? (float)$salesRows[$date]['total'] : 0,
                'transactions' => isset($salesRows[$date]) ? (int)$salesRows[$date]['transactions'] : 0
            ];
        }

        // 5 produk terlaris pada bulan berjalan.
        $stmt = $pdo->prepare("
            SELECT p.name,
                   COALESCE(SUM(si.qty),0) qty,
                   COALESCE(SUM(si.subtotal),0) amount
            FROM sale_items si
            JOIN products p ON p.id = si.product_id
            JOIN sales s ON s.id = si.sale_id
            WHERE substr(s.created_at,1,7) = ?
            GROUP BY p.id, p.name
            ORDER BY qty DESC, amount DESC
            LIMIT 5
        ");
        $stmt->execute([$currentMonth]);
        $topProducts = $stmt->fetchAll();

        json_response([
            'ok' => true,
            'summary' => [
                'sales' => (float)$sale['total'],
                'transactions' => (int)$sale['trx'],
                'products' => $products,
                'low_stock' => $low
            ],
            'recent' => $recent,
            'charts' => [
                'sales_7_days' => $salesChart,
                'top_products_month' => $topProducts
            ]
        ]);
    }

    if ($action === 'products') {
        require_menu_permission($pdo, 'products');
        $q = trim((string)($_GET['q'] ?? ''));
        if ($q !== '') {
            $stmt = $pdo->prepare("
                SELECT * FROM products
                WHERE active=1 AND (
                    name LIKE :q OR barcode LIKE :q OR sku LIKE :q OR category LIKE :q
                )
                ORDER BY name
            ");
            $stmt->execute([':q' => "%$q%"]);
        } else {
            $stmt = $pdo->query("SELECT * FROM products WHERE active=1 ORDER BY name");
        }
        json_response(['ok' => true, 'data' => $stmt->fetchAll()]);
    }

    if ($action === 'product_save') {
        require_admin();
        $data = input();
        $id = (int)($data['id'] ?? 0);
        $name = trim((string)($data['name'] ?? ''));

        if ($name === '') {
            json_response(['ok'=>false,'message'=>'Nama produk wajib diisi'], 422);
        }

        $oldImage = null;

        if ($id > 0) {
            $stmt = $pdo->prepare("SELECT image_path FROM products WHERE id=?");
            $stmt->execute([$id]);
            $oldImage = $stmt->fetchColumn() ?: null;
        }

        $imagePath = $oldImage;

        if (
            isset($_FILES['image']) &&
            ($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE
        ) {
            $newImage = save_product_image($_FILES['image']);

            if ($oldImage && $oldImage !== $newImage) {
                delete_product_image($oldImage);
            }

            $imagePath = $newImage;
        }

        $values = [
            ':barcode' => trim((string)($data['barcode'] ?? '')) ?: null,
            ':sku' => trim((string)($data['sku'] ?? '')) ?: null,
            ':name' => $name,
            ':category' => trim((string)($data['category'] ?? '')),
            ':purchase_price' => (float)($data['purchase_price'] ?? 0),
            ':sell_price' => (float)($data['sell_price'] ?? 0),
            ':stock' => (float)($data['stock'] ?? 0),
            ':min_stock' => (float)($data['min_stock'] ?? 0),
            ':image_path' => $imagePath,
        ];

        if ($id > 0) {
            $values[':id'] = $id;

            $stmt = $pdo->prepare("
                UPDATE products SET
                    barcode=:barcode,
                    sku=:sku,
                    name=:name,
                    category=:category,
                    purchase_price=:purchase_price,
                    sell_price=:sell_price,
                    stock=:stock,
                    min_stock=:min_stock,
                    image_path=:image_path,
                    updated_at=CURRENT_TIMESTAMP
                WHERE id=:id
            ");
        } else {
            $stmt = $pdo->prepare("
                INSERT INTO products(
                    barcode, sku, name, category,
                    purchase_price, sell_price,
                    stock, min_stock, image_path
                )
                VALUES(
                    :barcode, :sku, :name, :category,
                    :purchase_price, :sell_price,
                    :stock, :min_stock, :image_path
                )
            ");
        }

        $stmt->execute($values);

        json_response([
            'ok'=>true,
            'image_path'=>$imagePath
        ]);
    }

    if ($action === 'product_delete') {
        require_admin();
        $data = input();
        $id = (int)($data['id'] ?? 0);
        $stmt = $pdo->prepare("UPDATE products SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?");
        $stmt->execute([$id]);
        json_response(['ok'=>true]);
    }

    if ($action === 'sale_create') {
        require_menu_permission($pdo, 'cart');
        $data = input();
        $items = $data['items'] ?? [];
        $paid = (float)($data['paid'] ?? 0);

        if (!is_array($items) || count($items) === 0) {
            json_response(['ok'=>false,'message'=>'Keranjang masih kosong'], 422);
        }

        $pdo->beginTransaction();
        $total = 0.0;
        $normalized = [];

        $check = $pdo->prepare("SELECT id,name,sell_price,stock FROM products WHERE id=? AND active=1");
        foreach ($items as $item) {
            $productId = (int)($item['product_id'] ?? 0);
            $qty = (float)($item['qty'] ?? 0);
            if ($qty <= 0) throw new RuntimeException('Qty tidak valid');

            $check->execute([$productId]);
            $product = $check->fetch();
            if (!$product) throw new RuntimeException('Produk tidak ditemukan');
            if ((float)$product['stock'] < $qty) {
                throw new RuntimeException("Stok {$product['name']} tidak cukup");
            }

            $price = (float)$product['sell_price'];
            $subtotal = $price * $qty;
            $total += $subtotal;
            $normalized[] = [
                'product_id' => $productId,
                'qty' => $qty,
                'price' => $price,
                'subtotal' => $subtotal
            ];
        }

        if ($paid < $total) {
            throw new RuntimeException('Uang bayar kurang');
        }

        $invoice = invoice_no($pdo);
        $change = $paid - $total;

        $stmt = $pdo->prepare("
            INSERT INTO sales(invoice_no,total,paid,change_amount,cashier_id)
            VALUES(?,?,?,?,?)
        ");
        $stmt->execute([$invoice,$total,$paid,$change,$user['id']]);
        $saleId = (int)$pdo->lastInsertId();

        $itemStmt = $pdo->prepare("
            INSERT INTO sale_items(sale_id,product_id,qty,price,subtotal)
            VALUES(?,?,?,?,?)
        ");
        $stockStmt = $pdo->prepare("UPDATE products SET stock=stock-?, updated_at=CURRENT_TIMESTAMP WHERE id=?");

        foreach ($normalized as $item) {
            $itemStmt->execute([$saleId,$item['product_id'],$item['qty'],$item['price'],$item['subtotal']]);
            $stockStmt->execute([$item['qty'],$item['product_id']]);
        }

        $pdo->commit();
        json_response([
            'ok'=>true,
            'invoice_no'=>$invoice,
            'total'=>$total,
            'paid'=>$paid,
            'change'=>$change
        ]);
    }

    if ($action === 'sales') {
        require_menu_permission($pdo, 'history');
        $month = trim((string)($_GET['month'] ?? ''));
        if ($month !== '') {
            $stmt = $pdo->prepare("
                SELECT s.*, u.name cashier
                FROM sales s JOIN users u ON u.id=s.cashier_id
                WHERE substr(s.created_at,1,7)=?
                ORDER BY s.id DESC
            ");
            $stmt->execute([$month]);
        } else {
            $stmt = $pdo->query("
                SELECT s.*, u.name cashier
                FROM sales s JOIN users u ON u.id=s.cashier_id
                ORDER BY s.id DESC LIMIT 100
            ");
        }
        json_response(['ok'=>true,'data'=>$stmt->fetchAll()]);
    }

    if ($action === 'sale_detail') {
        require_menu_permission($pdo, 'history');
        $id = (int)($_GET['id'] ?? 0);
        $stmt = $pdo->prepare("
            SELECT si.*, p.name, p.barcode
            FROM sale_items si JOIN products p ON p.id=si.product_id
            WHERE si.sale_id=?
        ");
        $stmt->execute([$id]);
        json_response(['ok'=>true,'data'=>$stmt->fetchAll()]);
    }

    if ($action === 'monthly_report') {
        require_menu_permission($pdo, 'report');
        $month = trim((string)($_GET['month'] ?? date('Y-m')));
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            json_response(['ok'=>false,'message'=>'Format bulan harus YYYY-MM'], 422);
        }

        $stmt = $pdo->prepare("
            SELECT COALESCE(SUM(total),0) sales, COUNT(*) transactions,
                   COALESCE(AVG(total),0) average_transaction
            FROM sales
            WHERE substr(created_at,1,7)=?
        ");
        $stmt->execute([$month]);
        $summary = $stmt->fetch();

        $stmt = $pdo->prepare("
            SELECT p.name, SUM(si.qty) qty, SUM(si.subtotal) amount
            FROM sale_items si
            JOIN products p ON p.id=si.product_id
            JOIN sales s ON s.id=si.sale_id
            WHERE substr(s.created_at,1,7)=?
            GROUP BY p.id,p.name
            ORDER BY qty DESC
            LIMIT 20
        ");
        $stmt->execute([$month]);

        json_response([
            'ok'=>true,
            'month'=>$month,
            'summary'=>[
                'sales'=>(float)$summary['sales'],
                'transactions'=>(int)$summary['transactions'],
                'average_transaction'=>(float)$summary['average_transaction'],
            ],
            'top_products'=>$stmt->fetchAll()
        ]);
    }


    if ($action === 'users') {
        require_admin();

        $stmt = $pdo->query("
            SELECT id, username, name, role, created_at
            FROM users
            ORDER BY
                CASE WHEN role='admin' THEN 0 ELSE 1 END,
                name,
                username
        ");

        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row['permissions'] = get_user_permissions($pdo, $row);
        }
        unset($row);

        json_response([
            'ok' => true,
            'data' => $rows
        ]);
    }

    if ($action === 'user_save') {
        $currentAdmin = require_admin();
        $data = input();

        $id = (int)($data['id'] ?? 0);
        $username = trim((string)($data['username'] ?? ''));
        $name = trim((string)($data['name'] ?? ''));
        $role = normalize_role((string)($data['role'] ?? 'cashier'));
        $password = (string)($data['password'] ?? '');
        $menus = $data['permissions'] ?? [];

        if (!is_array($menus)) {
            $menus = [];
        }

        if ($username === '') {
            json_response(['ok'=>false,'message'=>'Username wajib diisi.'], 422);
        }

        if ($name === '') {
            json_response(['ok'=>false,'message'=>'Nama user wajib diisi.'], 422);
        }

        if (!preg_match('/^[A-Za-z0-9._-]{3,50}$/', $username)) {
            json_response([
                'ok'=>false,
                'message'=>'Username minimal 3 karakter dan hanya boleh huruf, angka, titik, garis bawah, atau strip.'
            ], 422);
        }

        if ($id <= 0 && strlen($password) < 6) {
            json_response([
                'ok'=>false,
                'message'=>'Password user baru minimal 6 karakter.'
            ], 422);
        }

        if ($password !== '' && strlen($password) < 6) {
            json_response([
                'ok'=>false,
                'message'=>'Password minimal 6 karakter.'
            ], 422);
        }

        try {
            if ($id > 0) {
                $stmt = $pdo->prepare("SELECT id, role FROM users WHERE id=?");
                $stmt->execute([$id]);
                $existing = $stmt->fetch();

                if (!$existing) {
                    json_response(['ok'=>false,'message'=>'User tidak ditemukan.'], 404);
                }

                // Tidak boleh menurunkan role admin terakhir.
                if ($existing['role'] === 'admin' && $role !== 'admin') {
                    $adminCount = (int)$pdo->query(
                        "SELECT COUNT(*) FROM users WHERE role='admin'"
                    )->fetchColumn();

                    if ($adminCount <= 1) {
                        json_response([
                            'ok'=>false,
                            'message'=>'Minimal harus ada satu Administrator.'
                        ], 422);
                    }
                }

                if ($password !== '') {
                    $stmt = $pdo->prepare("
                        UPDATE users
                        SET username=?, name=?, role=?, password_hash=?
                        WHERE id=?
                    ");
                    $stmt->execute([
                        $username,
                        $name,
                        $role,
                        password_hash($password, PASSWORD_DEFAULT),
                        $id
                    ]);
                } else {
                    $stmt = $pdo->prepare("
                        UPDATE users
                        SET username=?, name=?, role=?
                        WHERE id=?
                    ");
                    $stmt->execute([
                        $username,
                        $name,
                        $role,
                        $id
                    ]);
                }

                // Jika admin mengedit dirinya sendiri, refresh session.
                if ($id === (int)$currentAdmin['id']) {
                    $_SESSION['user']['username'] = $username;
                    $_SESSION['user']['name'] = $name;
                    $_SESSION['user']['role'] = $role;
                }

            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO users(username, password_hash, name, role)
                    VALUES(?,?,?,?)
                ");
                $stmt->execute([
                    $username,
                    password_hash($password, PASSWORD_DEFAULT),
                    $name,
                    $role
                ]);

                $id = (int)$pdo->lastInsertId();
            }

            // Administrator selalu mendapat semua menu.
            // Non-admin mengikuti pilihan checkbox autorisasi.
            if ($role === 'admin') {
                save_user_permissions($pdo, $id, available_menu_codes());
            } else {
                save_user_permissions($pdo, $id, $menus);
            }

            json_response(['ok'=>true]);

        } catch (PDOException $e) {
            if (str_contains(strtolower($e->getMessage()), 'unique')) {
                json_response([
                    'ok'=>false,
                    'message'=>'Username sudah digunakan.'
                ], 422);
            }
            throw $e;
        }
    }

    if ($action === 'user_delete') {
        $currentAdmin = require_admin();
        $data = input();
        $id = (int)($data['id'] ?? 0);

        if ($id <= 0) {
            json_response(['ok'=>false,'message'=>'User tidak valid.'], 422);
        }

        if ($id === (int)$currentAdmin['id']) {
            json_response([
                'ok'=>false,
                'message'=>'Administrator yang sedang login tidak dapat menghapus dirinya sendiri.'
            ], 422);
        }

        $stmt = $pdo->prepare("SELECT role FROM users WHERE id=?");
        $stmt->execute([$id]);
        $role = $stmt->fetchColumn();

        if (!$role) {
            json_response(['ok'=>false,'message'=>'User tidak ditemukan.'], 404);
        }

        if ($role === 'admin') {
            $adminCount = (int)$pdo->query(
                "SELECT COUNT(*) FROM users WHERE role='admin'"
            )->fetchColumn();

            if ($adminCount <= 1) {
                json_response([
                    'ok'=>false,
                    'message'=>'Minimal harus ada satu Administrator.'
                ], 422);
            }
        }

        // Sales punya FK ke users. Untuk menjaga histori transaksi,
        // user yang sudah pernah melakukan transaksi tidak dihapus permanen.
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE cashier_id=?");
        $stmt->execute([$id]);
        $saleCount = (int)$stmt->fetchColumn();

        if ($saleCount > 0) {
            json_response([
                'ok'=>false,
                'message'=>'User sudah memiliki transaksi dan tidak dapat dihapus agar histori kasir tetap utuh. Ubah password/role jika user tidak dipakai lagi.'
            ], 422);
        }

        $stmt = $pdo->prepare("DELETE FROM users WHERE id=?");
        $stmt->execute([$id]);

        json_response(['ok'=>true]);
    }

    json_response(['ok'=>false,'message'=>'Action tidak dikenal'], 404);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_response(['ok'=>false,'message'=>$e->getMessage()], 500);
}
