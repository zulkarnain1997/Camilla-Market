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

    // Auto migration profil user untuk database lama.
    // v1.0.17: no. telepon, alamat, dan foto user.
    $usersExists = $pdo->query(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'"
    )->fetchColumn();

    if ((int)$usersExists > 0) {
        $columns = $pdo->query("PRAGMA table_info(users)")->fetchAll();
        $columnNames = array_column($columns, 'name');

        if (!in_array('phone', $columnNames, true)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN phone TEXT NULL");
        }
        if (!in_array('address', $columnNames, true)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN address TEXT NULL");
        }
        if (!in_array('photo_path', $columnNames, true)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN photo_path TEXT NULL");
        }
        if (!in_array('email', $columnNames, true)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN email TEXT NULL");
        }

        $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL AND TRIM(email) <> ''");
    }

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

    // Auto migration transaksi & fitur pembayaran/keuangan.
    $salesExists = $pdo->query(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sales'"
    )->fetchColumn();

    if ((int)$salesExists > 0) {
        $columns = $pdo->query("PRAGMA table_info(sales)")->fetchAll();
        $columnNames = array_column($columns, 'name');

        if (!in_array('payment_method', $columnNames, true)) {
            $pdo->exec("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'");
        }
        if (!in_array('payment_status', $columnNames, true)) {
            $pdo->exec("ALTER TABLE sales ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid'");
        }
        if (!in_array('paid_at', $columnNames, true)) {
            $pdo->exec("ALTER TABLE sales ADD COLUMN paid_at TEXT NULL");
            $pdo->exec("UPDATE sales SET paid_at=created_at WHERE paid_at IS NULL");
        }
        if (!in_array('qris_setting_id', $columnNames, true)) {
            $pdo->exec("ALTER TABLE sales ADD COLUMN qris_setting_id INTEGER NULL");
        }
        if (!in_array('qris_name', $columnNames, true)) {
            $pdo->exec("ALTER TABLE sales ADD COLUMN qris_name TEXT NULL");
        }
    }

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS finance_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trx_date TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('income','expense')),
            category TEXT,
            description TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            created_by INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_finance_trx_date
        ON finance_transactions(trx_date);

        CREATE TABLE IF NOT EXISTS qris_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            payload TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_qris_settings_active
        ON qris_settings(is_active, is_default, id);

        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    " );

    // Autorisasi menu per user.
    // Default branding dapat diubah melalui menu Branding Aplikasi.
    $brandingDefaults = [
        'website_name' => 'Ada Apa Aja',
        'app_name' => 'Ada Apa Aja POS',
        'app_icon' => 'files/default-logo.png',
    ];
    $brandingStmt = $pdo->prepare("
        INSERT OR IGNORE INTO app_settings(setting_key, setting_value, updated_at)
        VALUES(?, ?, CURRENT_TIMESTAMP)
    ");
    foreach ($brandingDefaults as $key => $value) {
        $brandingStmt->execute([$key, $value]);
    }

    // v1.0.18: migrasi satu kali setting QRIS lama (single QRIS) ke tabel multi QRIS.
    $qrisMigrationMarkerStmt = $pdo->prepare(
        "SELECT setting_value FROM app_settings WHERE setting_key='multi_qris_migrated'"
    );
    $qrisMigrationMarkerStmt->execute();
    $qrisAlreadyMigrated = (string)($qrisMigrationMarkerStmt->fetchColumn() ?: '') === '1';

    if (!$qrisAlreadyMigrated) {
        $qrisCount = (int)$pdo->query("SELECT COUNT(*) FROM qris_settings")->fetchColumn();

        if ($qrisCount === 0) {
            $legacyPayloadStmt = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key='qr_payment_payload'");
            $legacyPayloadStmt->execute();
            $legacyPayload = trim((string)($legacyPayloadStmt->fetchColumn() ?: ''));

            if ($legacyPayload !== '') {
                $legacyNameStmt = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key='qr_payment_name'");
                $legacyNameStmt->execute();
                $legacyName = trim((string)($legacyNameStmt->fetchColumn() ?: ''));
                if ($legacyName === '') {
                    $legacyName = (string)($brandingDefaults['website_name'] ?? 'QRIS Utama');
                }

                $insertLegacyQris = $pdo->prepare("
                    INSERT INTO qris_settings(name,payload,is_active,is_default,created_at,updated_at)
                    VALUES(?,?,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                ");
                $insertLegacyQris->execute([$legacyName, $legacyPayload]);
            }
        }

        $migrationMarker = $pdo->prepare("
            INSERT INTO app_settings(setting_key,setting_value,updated_at)
            VALUES('multi_qris_migrated','1',CURRENT_TIMESTAMP)
            ON CONFLICT(setting_key) DO UPDATE SET
                setting_value='1',
                updated_at=CURRENT_TIMESTAMP
        ");
        $migrationMarker->execute();
    }

    // Pastikan QRIS aktif selalu memiliki satu default bila tersedia.
    $activeQrisCount = (int)$pdo->query("SELECT COUNT(*) FROM qris_settings WHERE is_active=1")->fetchColumn();
    $defaultQrisCount = (int)$pdo->query("SELECT COUNT(*) FROM qris_settings WHERE is_active=1 AND is_default=1")->fetchColumn();
    if ($activeQrisCount > 0 && $defaultQrisCount === 0) {
        $pdo->exec("
            UPDATE qris_settings
            SET is_default=1, updated_at=CURRENT_TIMESTAMP
            WHERE id=(SELECT id FROM qris_settings WHERE is_active=1 ORDER BY id ASC LIMIT 1)
        ");
    }

    // v1.0.14: semua logo/icon default web menggunakan folder /files.
    // Hanya path default lama yang dimigrasikan; icon custom di uploads/branding tetap dipertahankan.
    $legacyDefaultIcons = [
        'assets/default-app-icon.png',
        'assets/icon.svg',
    ];
    $placeholders = implode(',', array_fill(0, count($legacyDefaultIcons), '?'));
    $migrateIconStmt = $pdo->prepare(
        "UPDATE app_settings SET setting_value=?, updated_at=CURRENT_TIMESTAMP
         WHERE setting_key='app_icon' AND setting_value IN ($placeholders)"
    );
    $migrateIconStmt->execute(array_merge(['files/default-logo.png'], $legacyDefaultIcons));

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS saved_login_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            last_used_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_saved_login_tokens_user ON saved_login_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_saved_login_tokens_expiry ON saved_login_tokens(expires_at);
    " );

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
