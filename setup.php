<?php
declare(strict_types=1);
require __DIR__ . '/db.php';

$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $pdo = db();

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                barcode TEXT UNIQUE,
                sku TEXT UNIQUE,
                name TEXT NOT NULL,
                category TEXT,
                purchase_price REAL NOT NULL DEFAULT 0,
                sell_price REAL NOT NULL DEFAULT 0,
                stock REAL NOT NULL DEFAULT 0,
                min_stock REAL NOT NULL DEFAULT 0,
                image_path TEXT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_no TEXT NOT NULL UNIQUE,
                total REAL NOT NULL,
                paid REAL NOT NULL,
                change_amount REAL NOT NULL,
                cashier_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cashier_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS sale_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                qty REAL NOT NULL,
                price REAL NOT NULL,
                subtotal REAL NOT NULL,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            );

            CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
            CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
            CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
        ");

        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute(['admin']);
        if (!$stmt->fetch()) {
            $stmt = $pdo->prepare("
                INSERT INTO users(username, password_hash, name, role)
                VALUES (?, ?, ?, ?)
            ");
            $stmt->execute([
                'admin',
                password_hash('admin123', PASSWORD_DEFAULT),
                'Administrator',
                'admin'
            ]);
        }

        $count = (int)$pdo->query("SELECT COUNT(*) FROM products")->fetchColumn();
        if ($count === 0) {
            $stmt = $pdo->prepare("
                INSERT INTO products(barcode, sku, name, category, purchase_price, sell_price, stock, min_stock)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $seed = [
                ['8991002101812', 'BRG001', 'Air Mineral 600ml', 'Minuman', 2500, 4000, 48, 10],
                ['8999999041782', 'BRG002', 'Mi Instan Goreng', 'Makanan', 2600, 3500, 60, 12],
                ['8998866200590', 'BRG003', 'Kopi Sachet', 'Minuman', 1500, 2500, 40, 8],
                ['8992760221026', 'BRG004', 'Biskuit Cokelat', 'Snack', 6500, 8500, 24, 6],
            ];
            foreach ($seed as $row) {
                $stmt->execute($row);
            }
        }

        $message = 'Database berhasil disiapkan. Login: admin / admin123';
    } catch (Throwable $e) {
        $message = 'Error: ' . $e->getMessage();
    }
}
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Setup Minimarket</title>
    <style>
        body{font-family:Arial,sans-serif;background:#f4f7fb;padding:30px;color:#1f2937}
        .box{max-width:650px;margin:auto;background:#fff;padding:28px;border-radius:18px;box-shadow:0 12px 35px rgba(0,0,0,.08)}
        button{background:#166534;color:#fff;border:0;padding:13px 18px;border-radius:10px;font-weight:700;cursor:pointer}
        .msg{padding:12px;background:#ecfdf5;border-radius:10px;margin:16px 0}
        code{background:#f3f4f6;padding:2px 5px;border-radius:5px}
    </style>
</head>
<body>
<div class="box">
    <h1>Setup Minimarket</h1>
    <p>Tekan tombol di bawah untuk membuat database dan data awal.</p>
    <?php if ($message): ?><div class="msg"><?= htmlspecialchars($message) ?></div><?php endif; ?>
    <form method="post"><button type="submit">Install / Prepare Database</button></form>
    <p>Setelah selesai buka <code>index.php</code>.</p>
</div>
</body>
</html>
