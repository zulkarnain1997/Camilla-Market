<?php
declare(strict_types=1);

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dataDir = __DIR__ . '/data';
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0775, true);
    }

    $pdo = new PDO('sqlite:' . $dataDir . '/minimarket.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON;');
    $pdo->exec('PRAGMA journal_mode = WAL;');

    // Auto migration untuk database lama.
    // Menambahkan kolom image_path tanpa menghapus data produk/transaksi.
    $productsExists = $pdo->query(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='products'"
    )->fetchColumn();

    if ((int)$productsExists > 0) {
        $columns = $pdo->query("PRAGMA table_info(products)")->fetchAll();
        $columnNames = array_column($columns, 'name');

        if (!in_array('image_path', $columnNames, true)) {
            $pdo->exec("ALTER TABLE products ADD COLUMN image_path TEXT NULL");
        }
    }

    // Autorisasi menu per user.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS user_menu_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            menu_code TEXT NOT NULL,
            can_read INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, menu_code),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_user_menu_permissions_user
        ON user_menu_permissions(user_id);
    ");

    return $pdo;
}
