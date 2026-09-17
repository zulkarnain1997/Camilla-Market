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

function app_setting(PDO $pdo, string $key, string $default = ''): string {
    $stmt = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key=?");
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();
    if ($value === false || $value === null || trim((string)$value) === '') {
        return $default;
    }
    return (string)$value;
}

function app_branding(PDO $pdo): array {
    $icon = app_setting($pdo, 'app_icon', 'files/default-logo.png');
    if (in_array($icon, ['assets/default-app-icon.png', 'assets/icon.svg'], true)) {
        $icon = 'files/default-logo.png';
    }

    return [
        'website_name' => app_setting($pdo, 'website_name', 'Ada Apa Aja'),
        'app_name' => app_setting($pdo, 'app_name', 'Ada Apa Aja POS'),
        'icon' => $icon,
    ];
}

function save_app_setting(PDO $pdo, string $key, string $value): void {
    $stmt = $pdo->prepare("\n        INSERT INTO app_settings(setting_key,setting_value,updated_at)\n        VALUES(?,?,CURRENT_TIMESTAMP)\n        ON CONFLICT(setting_key) DO UPDATE SET\n            setting_value=excluded.setting_value,\n            updated_at=CURRENT_TIMESTAMP\n    ");
    $stmt->execute([$key, $value]);
}

function branding_file_prefix(string $name): string {
    $clean = preg_replace('/[^A-Za-z0-9]+/', '_', $name) ?? 'Ada Apa Aja';
    $clean = trim($clean, '_');
    return $clean !== '' ? substr($clean, 0, 50) : 'Ada Apa Aja';
}

function public_user_session(array $user): array {
    return [
        'id' => (int)$user['id'],
        'username' => (string)$user['username'],
        'email' => (string)($user['email'] ?? ''),
        'name' => (string)$user['name'],
        'phone' => (string)($user['phone'] ?? ''),
        'address' => (string)($user['address'] ?? ''),
        'photo_path' => $user['photo_path'] ?? null,
        'role' => (string)$user['role'],
    ];
}

function start_user_session(array $user): array {
    session_regenerate_id(true);
    $_SESSION['user'] = public_user_session($user);
    return $_SESSION['user'];
}

function create_saved_login_token(PDO $pdo, int $userId): string {
    $pdo->exec("DELETE FROM saved_login_tokens WHERE expires_at <= CURRENT_TIMESTAMP");
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $expires = date('Y-m-d H:i:s', time() + 90 * 86400);
    $stmt = $pdo->prepare("INSERT INTO saved_login_tokens(user_id,token_hash,expires_at,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)");
    $stmt->execute([$userId,$hash,$expires]);
    $cleanup=$pdo->prepare("DELETE FROM saved_login_tokens WHERE user_id=? AND id NOT IN (SELECT id FROM saved_login_tokens WHERE user_id=? ORDER BY id DESC LIMIT 10)");
    $cleanup->execute([$userId,$userId]);
    return $token;
}

function normalize_email(string $email): string { return strtolower(trim($email)); }

function require_auth(): array {
    if (empty($_SESSION['user']['id'])) {
        json_response(['ok' => false, 'message' => 'Belum login'], 401);
    }

    // Selalu ambil role/nama/username terbaru dari database.
    // Dengan ini perubahan role oleh Administrator langsung berlaku
    // pada session user yang sedang aktif.
    $pdo = db();
    $stmt = $pdo->prepare("
        SELECT id, username, email, name, phone, address, photo_path, role
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
        'email' => $fresh['email'] ?? '',
        'name' => $fresh['name'],
        'phone' => $fresh['phone'] ?? '',
        'address' => $fresh['address'] ?? '',
        'photo_path' => $fresh['photo_path'] ?? null,
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
    return ['dashboard', 'products', 'cart', 'history', 'report', 'finance', 'qr-settings', 'branding-settings'];
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
        return array_merge(available_menu_codes(), ['users']);
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


function delete_user_photo(?string $relativePath): void {
    if (!$relativePath) return;
    if (!str_starts_with($relativePath, 'uploads/users/')) return;

    $fullPath = __DIR__ . '/' . ltrim($relativePath, '/');
    if (is_file($fullPath)) {
        @unlink($fullPath);
    }
}

function save_user_photo(array $file): string {
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Upload foto user gagal.');
    }

    $maxSize = 3 * 1024 * 1024;
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > $maxSize) {
        throw new RuntimeException('Ukuran foto user maksimal 3 MB.');
    }

    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        throw new RuntimeException('File foto user tidak valid.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmp);
    $allowed = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
    ];

    if (!isset($allowed[$mime])) {
        throw new RuntimeException('Format foto user harus JPG, PNG, atau WEBP.');
    }

    $uploadDir = __DIR__ . '/uploads/users';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Folder upload foto user tidak dapat dibuat.');
    }

    $filename = 'user_' . bin2hex(random_bytes(12)) . '.' . $allowed[$mime];
    $destination = $uploadDir . '/' . $filename;
    if (!move_uploaded_file($tmp, $destination)) {
        throw new RuntimeException('Gagal menyimpan foto user.');
    }

    return 'uploads/users/' . $filename;
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

function validate_month(string $month): string {
    $month = trim($month);
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        json_response(['ok'=>false,'message'=>'Format bulan harus YYYY-MM'], 422);
    }
    return $month;
}

function monthly_report_data(PDO $pdo, string $month): array {
    $month = validate_month($month);

    $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(total),0) sales, COUNT(*) transactions,
               COALESCE(AVG(total),0) average_transaction,
               COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0) cash_sales,
               COALESCE(SUM(CASE WHEN payment_method='qr' THEN total ELSE 0 END),0) qr_sales
        FROM sales
        WHERE substr(created_at,1,7)=? AND payment_status='paid'
    ");
    $stmt->execute([$month]);
    $summary = $stmt->fetch();

    $stmt = $pdo->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) manual_income,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) expenses
        FROM finance_transactions
        WHERE substr(trx_date,1,7)=?
    ");
    $stmt->execute([$month]);
    $financeSummary = $stmt->fetch();

    $sales = (float)$summary['sales'];
    $manualIncome = (float)$financeSummary['manual_income'];
    $expenses = (float)$financeSummary['expenses'];
    $income = $sales + $manualIncome;

    $stmt = $pdo->prepare("
        SELECT p.name, SUM(si.qty) qty, SUM(si.subtotal) amount
        FROM sale_items si
        JOIN products p ON p.id=si.product_id
        JOIN sales s ON s.id=si.sale_id
        WHERE substr(s.created_at,1,7)=? AND s.payment_status='paid'
        GROUP BY p.id,p.name
        ORDER BY qty DESC
        LIMIT 50
    ");
    $stmt->execute([$month]);
    $topProducts = $stmt->fetchAll();

    $stmt = $pdo->prepare("
        SELECT f.id, f.trx_date, f.type, f.category, f.description, f.amount,
               f.created_at, u.name created_by_name
        FROM finance_transactions f
        JOIN users u ON u.id=f.created_by
        WHERE substr(f.trx_date,1,7)=?
        ORDER BY f.trx_date DESC, f.id DESC
    ");
    $stmt->execute([$month]);
    $financeRows = $stmt->fetchAll();

    $stmt = $pdo->prepare("
        SELECT s.invoice_no, s.created_at, s.total, s.paid, s.change_amount,
               s.payment_method, s.payment_status, u.name cashier
        FROM sales s
        JOIN users u ON u.id=s.cashier_id
        WHERE substr(s.created_at,1,7)=? AND s.payment_status='paid'
        ORDER BY s.id DESC
    ");
    $stmt->execute([$month]);
    $salesRows = $stmt->fetchAll();

    return [
        'ok'=>true,
        'month'=>$month,
        'summary'=>[
            'sales'=>$sales,
            'manual_income'=>$manualIncome,
            'income'=>$income,
            'expenses'=>$expenses,
            'net_income'=>$income - $expenses,
            'transactions'=>(int)$summary['transactions'],
            'average_transaction'=>(float)$summary['average_transaction'],
            'cash_sales'=>(float)$summary['cash_sales'],
            'qr_sales'=>(float)$summary['qr_sales'],
        ],
        'top_products'=>$topProducts,
        'finance_transactions'=>$financeRows,
        'sales_rows'=>$salesRows
    ];
}

function idr_plain(float|int|string|null $value): string {
    return 'Rp ' . number_format((float)$value, 0, ',', '.');
}

function pdf_clean(string $text): string {
    $converted = @iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text);
    if ($converted === false) $converted = $text;
    $converted = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $converted) ?? '';
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $converted);
}

function pdf_wrap(string $text, int $width = 92): array {
    $parts = preg_split('/\R/u', $text) ?: [$text];
    $out = [];
    foreach ($parts as $part) {
        $wrapped = wordwrap(trim($part), $width, "\n", true);
        foreach (explode("\n", $wrapped) as $line) $out[] = $line;
    }
    return $out ?: [''];
}

function build_simple_pdf(array $report): string {
    $branding = app_branding(db());
    $brandName = $branding['website_name'];
    $pageWidth = 595.0;
    $pageHeight = 842.0;
    $margin = 35.0;
    $contentWidth = $pageWidth - ($margin * 2);
    $topY = 795.0;
    $bottomY = 42.0;

    $months = [
        '01'=>'Januari','02'=>'Februari','03'=>'Maret','04'=>'April',
        '05'=>'Mei','06'=>'Juni','07'=>'Juli','08'=>'Agustus',
        '09'=>'September','10'=>'Oktober','11'=>'November','12'=>'Desember'
    ];
    [$year, $monthNo] = array_pad(explode('-', (string)$report['month'], 2), 2, '');
    $periodLabel = ($months[$monthNo] ?? $monthNo) . ' ' . $year;

    $pages = [];
    $pageIndex = -1;
    $y = $topY;

    $textWidth = static function(string $text, float $size): float {
        $clean = @iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text);
        if ($clean === false) $clean = $text;
        return strlen($clean) * $size * 0.50;
    };

    $wrapText = static function(string $text, float $width, float $size): array {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
        if ($text === '') return [''];
        $maxChars = max(4, (int)floor(($width - 8) / max(1, $size * 0.50)));
        $wrapped = wordwrap($text, $maxChars, "\n", true);
        return explode("\n", $wrapped);
    };

    $addPage = function(bool $first = false) use (&$pages, &$pageIndex, &$y, $margin, $topY, $contentWidth, $periodLabel, $brandName): void {
        $pageIndex++;
        $pages[$pageIndex] = '';
        $y = $topY;
        if (!$first) {
            $pages[$pageIndex] .= "0.2 G 0.5 w {$margin} 808 m " . ($margin + $contentWidth) . " 808 l S\n";
            $pages[$pageIndex] .= 'BT /F2 10 Tf ' . $margin . ' 816 Td (' . pdf_clean(strtoupper($brandName) . ' - LAPORAN BULANAN') . ") Tj ET\n";
            $pages[$pageIndex] .= 'BT /F1 8 Tf ' . ($margin + 350) . ' 816 Td (' . pdf_clean('Periode: ' . $periodLabel) . ") Tj ET\n";
            $y = 790.0;
        }
    };

    $addText = function(float $x, float $baselineY, string $text, float $size = 9, string $font = 'F1', string $align = 'left') use (&$pages, &$pageIndex, $textWidth): void {
        $tx = $x;
        if ($align === 'right') $tx = $x - $textWidth($text, $size);
        elseif ($align === 'center') $tx = $x - ($textWidth($text, $size) / 2);
        $pages[$pageIndex] .= 'BT /' . $font . ' ' . $size . ' Tf ' . round($tx, 2) . ' ' . round($baselineY, 2) . ' Td (' . pdf_clean($text) . ") Tj ET\n";
    };

    $ensureSpace = function(float $needed) use (&$y, $bottomY, $addPage): void {
        if (($y - $needed) < $bottomY) $addPage(false);
    };

    $sectionTitle = function(string $title) use (&$pages, &$pageIndex, &$y, $margin, $contentWidth, $ensureSpace, $addText): void {
        $ensureSpace(32);
        $pages[$pageIndex] .= '0.94 g ' . $margin . ' ' . ($y - 20) . ' ' . $contentWidth . " 20 re f 0 g\n";
        $pages[$pageIndex] .= '0.75 G 0.5 w ' . $margin . ' ' . ($y - 20) . ' ' . $contentWidth . " 20 re S 0 G\n";
        $addText($margin + 8, $y - 14, $title, 10, 'F2');
        $y -= 27;
    };

    $drawTable = function(array $columns, array $rows, float $fontSize = 8.0) use (&$pages, &$pageIndex, &$y, $margin, $bottomY, $wrapText, $addText, $addPage): void {
        $headerHeight = 22.0;
        $lineHeight = $fontSize + 3.0;
        $drawHeader = function() use (&$pages, &$pageIndex, &$y, $margin, $columns, $headerHeight, $addText): void {
            $x = $margin;
            $pages[$pageIndex] .= '0.88 g ' . $margin . ' ' . ($y - $headerHeight) . ' 525 ' . $headerHeight . " re f 0 g\n";
            foreach ($columns as $col) {
                $w = (float)$col['width'];
                $pages[$pageIndex] .= '0.45 G 0.45 w ' . $x . ' ' . ($y - $headerHeight) . ' ' . $w . ' ' . $headerHeight . " re S 0 G\n";
                $align = $col['align'] ?? 'left';
                if ($align === 'right') $addText($x + $w - 5, $y - 15, (string)$col['label'], 8, 'F2', 'right');
                elseif ($align === 'center') $addText($x + ($w / 2), $y - 15, (string)$col['label'], 8, 'F2', 'center');
                else $addText($x + 5, $y - 15, (string)$col['label'], 8, 'F2');
                $x += $w;
            }
            $y -= $headerHeight;
        };

        if (($y - $headerHeight) < $bottomY) $addPage(false);
        $drawHeader();

        $rowIndex = 0;
        foreach ($rows as $row) {
            $wrappedCells = [];
            $maxLines = 1;
            foreach ($columns as $i => $col) {
                $value = (string)($row[$i] ?? '');
                $wrapped = $wrapText($value, (float)$col['width'], $fontSize);
                $wrappedCells[$i] = $wrapped;
                $maxLines = max($maxLines, count($wrapped));
            }
            $rowHeight = max(20.0, 7.0 + ($maxLines * $lineHeight));

            if (($y - $rowHeight) < $bottomY) {
                $addPage(false);
                $drawHeader();
            }

            if (($rowIndex % 2) === 1) {
                $pages[$pageIndex] .= '0.985 g ' . $margin . ' ' . ($y - $rowHeight) . ' 525 ' . $rowHeight . " re f 0 g\n";
            }

            $x = $margin;
            foreach ($columns as $i => $col) {
                $w = (float)$col['width'];
                $pages[$pageIndex] .= '0.75 G 0.35 w ' . $x . ' ' . ($y - $rowHeight) . ' ' . $w . ' ' . $rowHeight . " re S 0 G\n";
                $align = $col['align'] ?? 'left';
                foreach ($wrappedCells[$i] as $lineNo => $line) {
                    $baseline = $y - 13 - ($lineNo * $lineHeight);
                    if ($align === 'right') $addText($x + $w - 5, $baseline, $line, $fontSize, 'F1', 'right');
                    elseif ($align === 'center') $addText($x + ($w / 2), $baseline, $line, $fontSize, 'F1', 'center');
                    else $addText($x + 5, $baseline, $line, $fontSize, 'F1');
                }
                $x += $w;
            }
            $y -= $rowHeight;
            $rowIndex++;
        }

        if (!$rows) {
            $rowHeight = 22.0;
            if (($y - $rowHeight) < $bottomY) {
                $addPage(false);
                $drawHeader();
            }
            $pages[$pageIndex] .= '0.75 G 0.35 w ' . $margin . ' ' . ($y - $rowHeight) . ' 525 ' . $rowHeight . " re S 0 G\n";
            $addText($margin + 7, $y - 15, 'Belum ada data.', 8, 'F1');
            $y -= $rowHeight;
        }
        $y -= 12;
    };

    $addPage(true);

    // Header utama
    $addText($margin, 806, strtoupper($brandName), 17, 'F2');
    $addText($margin, 788, 'LAPORAN SUMMARY BULANAN', 11, 'F2');
    $addText($margin, 771, 'Periode: ' . $periodLabel, 9, 'F1');
    $addText($margin + $contentWidth, 771, 'Dicetak: ' . date('d-m-Y H:i'), 8, 'F1', 'right');
    $pages[$pageIndex] .= '0.25 G 0.7 w ' . $margin . ' 758 m ' . ($margin + $contentWidth) . " 758 l S 0 G\n";
    $y = 744;

    // Summary
    $sectionTitle('RINGKASAN KEUANGAN');
    $s = $report['summary'];
    $summaryRows = [
        ['Penjualan', idr_plain($s['sales'])],
        ['Penjualan Tunai', idr_plain($s['cash_sales'])],
        ['Penjualan QR / QRIS', idr_plain($s['qr_sales'])],
        ['Pemasukan Lain', idr_plain($s['manual_income'])],
        ['Total Pemasukan', idr_plain($s['income'])],
        ['Total Pengeluaran', idr_plain($s['expenses'])],
        ['Pemasukan Bersih', idr_plain($s['net_income'])],
        ['Jumlah Transaksi', number_format((int)$s['transactions'], 0, ',', '.')],
        ['Rata-rata Transaksi', idr_plain($s['average_transaction'])],
    ];
    $drawTable([
        ['label'=>'Keterangan','width'=>335,'align'=>'left'],
        ['label'=>'Nilai','width'=>190,'align'=>'right'],
    ], $summaryRows, 8.5);

    // Top products
    $sectionTitle('PRODUK TERLARIS');
    $topRows = [];
    $no = 1;
    foreach ($report['top_products'] as $row) {
        $topRows[] = [
            (string)$no++,
            (string)$row['name'],
            number_format((int)$row['qty'], 0, ',', '.'),
            idr_plain($row['amount'])
        ];
    }
    $drawTable([
        ['label'=>'No','width'=>35,'align'=>'center'],
        ['label'=>'Produk','width'=>275,'align'=>'left'],
        ['label'=>'Qty','width'=>65,'align'=>'right'],
        ['label'=>'Total','width'=>150,'align'=>'right'],
    ], $topRows, 8.0);

    // Finance
    $sectionTitle('PEMASUKAN & PENGELUARAN');
    $financeRows = [];
    foreach ($report['finance_transactions'] as $row) {
        $financeRows[] = [
            date('d-m-Y', strtotime((string)$row['trx_date'])),
            $row['type'] === 'income' ? 'Masuk' : 'Keluar',
            (string)($row['category'] ?: '-'),
            (string)($row['description'] ?: '-'),
            idr_plain($row['amount'])
        ];
    }
    $drawTable([
        ['label'=>'Tanggal','width'=>70,'align'=>'center'],
        ['label'=>'Jenis','width'=>55,'align'=>'center'],
        ['label'=>'Kategori','width'=>90,'align'=>'left'],
        ['label'=>'Keterangan','width'=>200,'align'=>'left'],
        ['label'=>'Nominal','width'=>110,'align'=>'right'],
    ], $financeRows, 7.5);

    // Sales detail
    $sectionTitle('DETAIL PENJUALAN');
    $salesRows = [];
    foreach ($report['sales_rows'] as $row) {
        $salesRows[] = [
            date('d-m-Y H:i', strtotime((string)$row['created_at'])),
            (string)$row['invoice_no'],
            (string)$row['cashier'],
            $row['payment_method'] === 'qr' ? 'QR/QRIS' : 'Tunai',
            idr_plain($row['total'])
        ];
    }
    $drawTable([
        ['label'=>'Tanggal / Waktu','width'=>95,'align'=>'center'],
        ['label'=>'No. Invoice','width'=>145,'align'=>'left'],
        ['label'=>'Kasir','width'=>105,'align'=>'left'],
        ['label'=>'Metode','width'=>70,'align'=>'center'],
        ['label'=>'Total','width'=>110,'align'=>'right'],
    ], $salesRows, 7.5);

    // Footer per halaman
    $totalPages = count($pages);
    foreach ($pages as $i => &$stream) {
        $pageNo = $i + 1;
        $stream .= '0.75 G 0.4 w ' . $margin . ' 29 m ' . ($margin + $contentWidth) . " 29 l S 0 G\n";
        $stream .= 'BT /F1 7 Tf ' . $margin . ' 18 Td (' . pdf_clean($brandName . ' - Laporan Summary Bulanan') . ") Tj ET\n";
        $footer = 'Halaman ' . $pageNo . ' dari ' . $totalPages;
        $fx = ($margin + $contentWidth) - $textWidth($footer, 7);
        $stream .= 'BT /F1 7 Tf ' . round($fx, 2) . ' 18 Td (' . pdf_clean($footer) . ") Tj ET\n";
    }
    unset($stream);

    // Build PDF objects
    $objects = [];
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    $objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    $kids = [];
    $objNo = 5;
    foreach ($pages as $stream) {
        $pageObj = $objNo++;
        $contentObj = $objNo++;
        $kids[] = $pageObj . ' 0 R';
        $objects[$pageObj] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' . $contentObj . ' 0 R >>';
        $objects[$contentObj] = '<< /Length ' . strlen($stream) . ">>\nstream\n" . $stream . "endstream";
    }
    $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . count($kids) . ' >>';
    ksort($objects);

    $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    $offsets = [0 => 0];
    foreach ($objects as $num => $body) {
        $offsets[$num] = strlen($pdf);
        $pdf .= $num . " 0 obj\n" . $body . "\nendobj\n";
    }
    $xref = strlen($pdf);
    $maxObj = max(array_keys($objects));
    $pdf .= "xref\n0 " . ($maxObj + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i=1; $i<=$maxObj; $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i] ?? 0);
    }
    $pdf .= "trailer\n<< /Size " . ($maxObj + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";
    return $pdf;
}

function xml_cell(string $value, string $type = 'String'): string {
    $safe = htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    return '<Cell><Data ss:Type="' . $type . '">' . $safe . '</Data></Cell>';
}

function xml_row(array $cells): string {
    $out = '<Row>';
    foreach ($cells as $cell) {
        if (is_array($cell)) $out .= xml_cell((string)$cell[0], $cell[1] ?? 'String');
        else $out .= xml_cell((string)$cell);
    }
    return $out . '</Row>';
}

function build_excel_xml(array $report): string {
    $branding = app_branding(db());
    $brandName = $branding['website_name'];
    $s = $report['summary'];
    $sheets = [];
    $rows = [];
    $rows[] = xml_row([strtoupper($brandName) . ' - SUMMARY BULANAN']);
    $rows[] = xml_row(['Periode', $report['month']]);
    $rows[] = xml_row([]);
    $rows[] = xml_row(['Summary', 'Nilai']);
    $rows[] = xml_row(['Penjualan', [(string)$s['sales'], 'Number']]);
    $rows[] = xml_row(['Penjualan Tunai', [(string)$s['cash_sales'], 'Number']]);
    $rows[] = xml_row(['Penjualan QR / QRIS', [(string)$s['qr_sales'], 'Number']]);
    $rows[] = xml_row(['Pemasukan Lain', [(string)$s['manual_income'], 'Number']]);
    $rows[] = xml_row(['Total Pemasukan', [(string)$s['income'], 'Number']]);
    $rows[] = xml_row(['Pengeluaran', [(string)$s['expenses'], 'Number']]);
    $rows[] = xml_row(['Pemasukan Bersih', [(string)$s['net_income'], 'Number']]);
    $rows[] = xml_row(['Transaksi', [(string)$s['transactions'], 'Number']]);
    $rows[] = xml_row(['Rata-rata Transaksi', [(string)$s['average_transaction'], 'Number']]);
    $sheets['Summary'] = $rows;

    $rows = [xml_row(['Invoice','Tanggal','Kasir','Metode','Total','Bayar','Kembalian'])];
    foreach ($report['sales_rows'] as $r) {
        $rows[] = xml_row([$r['invoice_no'],$r['created_at'],$r['cashier'],$r['payment_method']==='qr'?'QR / QRIS':'Tunai',[(string)$r['total'],'Number'],[(string)$r['paid'],'Number'],[(string)$r['change_amount'],'Number']]);
    }
    $sheets['Penjualan'] = $rows;

    $rows = [xml_row(['Tanggal','Jenis','Kategori','Keterangan','Nominal','Input Oleh'])];
    foreach ($report['finance_transactions'] as $r) {
        $rows[] = xml_row([$r['trx_date'],$r['type']==='income'?'Pemasukan':'Pengeluaran',$r['category'] ?: '',$r['description'],[(string)$r['amount'],'Number'],$r['created_by_name']]);
    }
    $sheets['Kas Masuk-Keluar'] = $rows;

    $rows = [xml_row(['Produk','QTY','Nilai Penjualan'])];
    foreach ($report['top_products'] as $r) {
        $rows[] = xml_row([$r['name'],[(string)$r['qty'],'Number'],[(string)$r['amount'],'Number']]);
    }
    $sheets['Produk Terlaris'] = $rows;

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    $xml .= '<?mso-application progid="Excel.Sheet"?>' . "\n";
    $xml .= '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
    foreach ($sheets as $name => $rows) {
        $safeName = htmlspecialchars($name, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $xml .= '<Worksheet ss:Name="' . $safeName . '"><Table>' . implode('', $rows) . '</Table></Worksheet>';
    }
    $xml .= '</Workbook>';
    return $xml;
}

$action = $_GET['action'] ?? '';
$pdo = db();

try {
    if ($action === 'branding') {
        $branding = app_branding($pdo);
        json_response([
            'ok' => true,
            'website_name' => $branding['website_name'],
            'app_name' => $branding['app_name'],
            'icon' => $branding['icon'],
        ]);
    }

    if ($action === 'branding_save') {
        require_menu_permission($pdo, 'branding-settings');
        $data = input();
        $websiteName = trim((string)($data['website_name'] ?? ''));
        $appName = trim((string)($data['app_name'] ?? ''));

        if ($websiteName === '' || $appName === '') {
            json_response(['ok'=>false,'message'=>'Nama website dan nama aplikasi wajib diisi.'], 422);
        }
        if (strlen($websiteName) > 80 || strlen($appName) > 80) {
            json_response(['ok'=>false,'message'=>'Nama maksimal 80 karakter.'], 422);
        }

        save_app_setting($pdo, 'website_name', $websiteName);
        save_app_setting($pdo, 'app_name', $appName);

        // Jika nama merchant QR masih default lama, ikutkan ke nama website baru.
        $qrName = app_setting($pdo, 'qr_payment_name', '');
        if ($qrName === '' || in_array($qrName, ['Ada Apa Aja', 'Ada Apa Aja'], true)) {
            save_app_setting($pdo, 'qr_payment_name', $websiteName);
        }

        json_response(['ok'=>true] + app_branding($pdo));
    }

    if ($action === 'branding_icon_upload') {
        require_menu_permission($pdo, 'branding-settings');

        if (empty($_FILES['icon']) || !is_array($_FILES['icon'])) {
            json_response(['ok'=>false,'message'=>'Pilih file icon terlebih dahulu.'], 422);
        }

        $file = $_FILES['icon'];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            json_response(['ok'=>false,'message'=>'Upload icon gagal. Kode: ' . (int)($file['error'] ?? -1)], 422);
        }
        if ((int)($file['size'] ?? 0) > 3 * 1024 * 1024) {
            json_response(['ok'=>false,'message'=>'Ukuran icon maksimal 3 MB.'], 422);
        }

        $imageInfo = @getimagesize((string)$file['tmp_name']);
        $mime = is_array($imageInfo) ? (string)($imageInfo['mime'] ?? '') : '';
        $allowed = [
            'image/png' => 'png',
            'image/jpeg' => 'jpg',
            'image/webp' => 'webp',
        ];
        if (!isset($allowed[$mime])) {
            json_response(['ok'=>false,'message'=>'Format icon harus PNG, JPG/JPEG, atau WEBP.'], 422);
        }

        $uploadDir = __DIR__ . '/uploads/branding';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
            json_response(['ok'=>false,'message'=>'Folder upload branding tidak dapat dibuat.'], 500);
        }

        $oldIcon = app_setting($pdo, 'app_icon', 'files/default-logo.png');
        $name = 'app_icon_' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
        $dest = $uploadDir . '/' . $name;
        if (!move_uploaded_file((string)$file['tmp_name'], $dest)) {
            json_response(['ok'=>false,'message'=>'Gagal menyimpan icon pada server.'], 500);
        }

        $relative = 'uploads/branding/' . $name;
        save_app_setting($pdo, 'app_icon', $relative);

        if (str_starts_with($oldIcon, 'uploads/branding/')) {
            $oldPath = __DIR__ . '/' . $oldIcon;
            if (is_file($oldPath) && realpath(dirname($oldPath)) === realpath($uploadDir)) {
                @unlink($oldPath);
            }
        }

        json_response(['ok'=>true,'icon'=>$relative]);
    }

    if ($action === 'branding_icon_reset') {
        require_menu_permission($pdo, 'branding-settings');
        $oldIcon = app_setting($pdo, 'app_icon', 'files/default-logo.png');
        save_app_setting($pdo, 'app_icon', 'files/default-logo.png');
        if (str_starts_with($oldIcon, 'uploads/branding/')) {
            $oldPath = __DIR__ . '/' . $oldIcon;
            $uploadDir = __DIR__ . '/uploads/branding';
            if (is_file($oldPath) && realpath(dirname($oldPath)) === realpath($uploadDir)) {
                @unlink($oldPath);
            }
        }
        json_response(['ok'=>true,'icon'=>'files/default-logo.png']);
    }

    if ($action === 'login') {
        $data=input(); $username=trim((string)($data['username']??'')); $password=(string)($data['password']??'');
        $savePassword=filter_var($data['save_password']??false,FILTER_VALIDATE_BOOLEAN);
        $stmt=$pdo->prepare("SELECT * FROM users WHERE username=?"); $stmt->execute([$username]); $user=$stmt->fetch();
        if(!$user || !password_verify($password,$user['password_hash'])) json_response(['ok'=>false,'message'=>'Username atau password salah'],422);
        $sessionUser=start_user_session($user);
        $response=['ok'=>true,'user'=>$sessionUser,'permissions'=>get_user_permissions($pdo,$sessionUser)];
        if($savePassword){$response['saved_login_token']=create_saved_login_token($pdo,(int)$user['id']);$response['saved_username']=$user['username'];}
        json_response($response);
    }

    if ($action === 'saved_login') {
        $data=input(); $username=trim((string)($data['username']??'')); $token=trim((string)($data['token']??''));
        if($username===''||strlen($token)<32) json_response(['ok'=>false,'message'=>'Password tersimpan tidak valid.'],422);
        $stmt=$pdo->prepare("SELECT u.*,t.id AS saved_token_id FROM saved_login_tokens t INNER JOIN users u ON u.id=t.user_id WHERE u.username=? AND t.token_hash=? AND t.expires_at>CURRENT_TIMESTAMP LIMIT 1");
        $stmt->execute([$username,hash('sha256',$token)]); $user=$stmt->fetch();
        if(!$user) json_response(['ok'=>false,'message'=>'Password tersimpan sudah tidak berlaku. Silakan masukkan password kembali.'],401);
        $pdo->prepare("UPDATE saved_login_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE id=?")->execute([(int)$user['saved_token_id']]);
        $sessionUser=start_user_session($user);
        json_response(['ok'=>true,'user'=>$sessionUser,'permissions'=>get_user_permissions($pdo,$sessionUser)]);
    }

    if ($action === 'saved_login_revoke') {
        $data=input(); $token=trim((string)($data['token']??''));
        if($token!=='') $pdo->prepare("DELETE FROM saved_login_tokens WHERE token_hash=?")->execute([hash('sha256',$token)]);
        json_response(['ok'=>true]);
    }

    if ($action === 'register') {
        $data=input(); $name=trim((string)($data['name']??'')); $username=trim((string)($data['username']??''));
        $email=normalize_email((string)($data['email']??'')); $phone=trim((string)($data['phone']??''));
        $password=(string)($data['password']??''); $confirm=(string)($data['password_confirm']??'');
        if($name===''||$username===''||$email===''||$phone==='') json_response(['ok'=>false,'message'=>'Nama, username, email, dan nomor telepon wajib diisi.'],422);
        if(!filter_var($email,FILTER_VALIDATE_EMAIL)) json_response(['ok'=>false,'message'=>'Format email tidak valid.'],422);
        if(!preg_match('/^[A-Za-z0-9._-]{3,50}$/',$username)) json_response(['ok'=>false,'message'=>'Username minimal 3 karakter dan hanya boleh huruf, angka, titik, garis bawah, atau strip.'],422);
        if(!preg_match('/^[0-9+()\\- .]{6,25}$/',$phone)) json_response(['ok'=>false,'message'=>'Nomor telepon tidak valid.'],422);
        if(strlen($password)<6) json_response(['ok'=>false,'message'=>'Password minimal 6 karakter.'],422);
        if($password!==$confirm) json_response(['ok'=>false,'message'=>'Konfirmasi password tidak sama.'],422);
        try{
            $pdo->beginTransaction();
            $stmt=$pdo->prepare("INSERT INTO users(username,email,password_hash,name,phone,address,photo_path,role,created_at) VALUES(?,?,?,?,?,'',NULL,'cashier',CURRENT_TIMESTAMP)");
            $stmt->execute([$username,$email,password_hash($password,PASSWORD_DEFAULT),$name,$phone]);
            $id=(int)$pdo->lastInsertId(); save_user_permissions($pdo,$id,default_cashier_permissions()); $pdo->commit();
            json_response(['ok'=>true,'message'=>'Pendaftaran berhasil. Silakan login dengan akun baru.']);
        }catch(PDOException $e){if($pdo->inTransaction())$pdo->rollBack();if(str_contains(strtolower($e->getMessage()),'unique'))json_response(['ok'=>false,'message'=>'Username atau email sudah digunakan.'],422);throw $e;}
    }

    if ($action === 'password_reset') {
        $data=input(); $username=trim((string)($data['username']??'')); $email=normalize_email((string)($data['email']??''));
        $phone=trim((string)($data['phone']??'')); $password=(string)($data['password']??''); $confirm=(string)($data['password_confirm']??'');
        if($username===''||$email===''||$phone==='') json_response(['ok'=>false,'message'=>'Username, email, dan nomor telepon terdaftar wajib diisi.'],422);
        if(!filter_var($email,FILTER_VALIDATE_EMAIL)) json_response(['ok'=>false,'message'=>'Format email tidak valid.'],422);
        if(strlen($password)<6) json_response(['ok'=>false,'message'=>'Password baru minimal 6 karakter.'],422);
        if($password!==$confirm) json_response(['ok'=>false,'message'=>'Konfirmasi password baru tidak sama.'],422);
        $stmt=$pdo->prepare("SELECT id FROM users WHERE username=? AND LOWER(TRIM(COALESCE(email,'')))=? AND TRIM(COALESCE(phone,''))=? LIMIT 1");
        $stmt->execute([$username,$email,$phone]); $id=(int)($stmt->fetchColumn()?:0);
        if($id<=0) json_response(['ok'=>false,'message'=>'Data akun tidak cocok. Periksa username, email, dan nomor telepon yang terdaftar.'],422);
        $pdo->beginTransaction(); $pdo->prepare("UPDATE users SET password_hash=? WHERE id=?")->execute([password_hash($password,PASSWORD_DEFAULT),$id]); $pdo->prepare("DELETE FROM saved_login_tokens WHERE user_id=?")->execute([$id]); $pdo->commit();
        json_response(['ok'=>true,'message'=>'Password berhasil diubah. Silakan login menggunakan password baru.']);
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

        $barcodeValue = trim((string)($data['barcode'] ?? '')) ?: null;
        $skuValue = trim((string)($data['sku'] ?? '')) ?: null;

        if ($barcodeValue !== null) {
            $stmt = $pdo->prepare("SELECT id, name FROM products WHERE barcode=? AND id<>? LIMIT 1");
            $stmt->execute([$barcodeValue, $id]);
            $duplicate = $stmt->fetch();
            if ($duplicate) {
                json_response([
                    'ok'=>false,
                    'message'=>"Barcode {$barcodeValue} sudah digunakan oleh produk {$duplicate['name']}."
                ], 422);
            }
        }

        if ($skuValue !== null) {
            $stmt = $pdo->prepare("SELECT id, name FROM products WHERE sku=? AND id<>? LIMIT 1");
            $stmt->execute([$skuValue, $id]);
            $duplicate = $stmt->fetch();
            if ($duplicate) {
                json_response([
                    'ok'=>false,
                    'message'=>"SKU {$skuValue} sudah digunakan oleh produk {$duplicate['name']}."
                ], 422);
            }
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
            ':barcode' => $barcodeValue,
            ':sku' => $skuValue,
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

    if ($action === 'product_import') {
        require_admin();
        $data = input();
        $rows = $data['rows'] ?? [];

        if (!is_array($rows) || !$rows) {
            json_response(['ok'=>false,'message'=>'Data Excel kosong.'], 422);
        }
        if (count($rows) > 2000) {
            json_response(['ok'=>false,'message'=>'Maksimal 2.000 produk per sekali upload.'], 422);
        }

        $inserted = 0;
        $updated = 0;
        $errors = [];

        $findBarcode = $pdo->prepare("SELECT id, name FROM products WHERE barcode=? LIMIT 1");
        $findSku = $pdo->prepare("SELECT id, name FROM products WHERE sku=? LIMIT 1");
        $checkBarcode = $pdo->prepare("SELECT id, name FROM products WHERE barcode=? AND id<>? LIMIT 1");
        $checkSku = $pdo->prepare("SELECT id, name FROM products WHERE sku=? AND id<>? LIMIT 1");
        $updateProduct = $pdo->prepare("
            UPDATE products SET
                barcode=?, sku=?, name=?, category=?,
                purchase_price=?, sell_price=?, stock=?, min_stock=?,
                active=1, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        ");
        $insertProduct = $pdo->prepare("
            INSERT INTO products(
                barcode, sku, name, category,
                purchase_price, sell_price, stock, min_stock, active
            ) VALUES(?,?,?,?,?,?,?,?,1)
        ");

        $asNumber = static function ($value, string $field, int $rowNo) {
            if ($value === '' || $value === null) return 0.0;
            if (is_string($value)) {
                $value = trim($value);
                // Format template menggunakan angka biasa. Izinkan pemisah ribuan koma.
                $value = str_replace(',', '', $value);
            }
            if (!is_numeric($value)) {
                throw new RuntimeException("{$field} harus berupa angka.");
            }
            $number = (float)$value;
            if ($number < 0) {
                throw new RuntimeException("{$field} tidak boleh negatif.");
            }
            return $number;
        };

        $pdo->beginTransaction();
        try {
            foreach ($rows as $index => $row) {
                $excelRow = (int)($row['excel_row'] ?? ($index + 2));
                try {
                    if (!is_array($row)) {
                        throw new RuntimeException('Format baris tidak valid.');
                    }

                    $barcode = trim((string)($row['barcode'] ?? '')) ?: null;
                    $sku = trim((string)($row['sku'] ?? '')) ?: null;
                    $name = trim((string)($row['name'] ?? ''));
                    $category = trim((string)($row['category'] ?? ''));

                    if ($name === '') {
                        throw new RuntimeException('NAMA_PRODUK wajib diisi.');
                    }
                    if ($barcode === null && $sku === null) {
                        throw new RuntimeException('Minimal BARCODE atau SKU wajib diisi.');
                    }
                    if (trim((string)($row['sell_price'] ?? '')) === '') {
                        throw new RuntimeException('HARGA_JUAL wajib diisi.');
                    }

                    $purchasePrice = $asNumber($row['purchase_price'] ?? 0, 'HARGA_BELI', $excelRow);
                    $sellPrice = $asNumber($row['sell_price'] ?? 0, 'HARGA_JUAL', $excelRow);
                    $stock = $asNumber($row['stock'] ?? 0, 'STOK', $excelRow);
                    $minStock = $asNumber($row['min_stock'] ?? 0, 'MIN_STOK', $excelRow);

                    $byBarcode = null;
                    $bySku = null;
                    if ($barcode !== null) {
                        $findBarcode->execute([$barcode]);
                        $byBarcode = $findBarcode->fetch() ?: null;
                    }
                    if ($sku !== null) {
                        $findSku->execute([$sku]);
                        $bySku = $findSku->fetch() ?: null;
                    }

                    if ($byBarcode && $bySku && (int)$byBarcode['id'] !== (int)$bySku['id']) {
                        throw new RuntimeException('BARCODE dan SKU mengarah ke dua produk yang berbeda.');
                    }

                    $existing = $byBarcode ?: $bySku;
                    if ($existing) {
                        $id = (int)$existing['id'];

                        if ($barcode !== null) {
                            $checkBarcode->execute([$barcode, $id]);
                            if ($duplicate = $checkBarcode->fetch()) {
                                throw new RuntimeException("BARCODE sudah digunakan produk {$duplicate['name']}.");
                            }
                        }
                        if ($sku !== null) {
                            $checkSku->execute([$sku, $id]);
                            if ($duplicate = $checkSku->fetch()) {
                                throw new RuntimeException("SKU sudah digunakan produk {$duplicate['name']}.");
                            }
                        }

                        $updateProduct->execute([
                            $barcode, $sku, $name, $category,
                            $purchasePrice, $sellPrice, $stock, $minStock,
                            $id
                        ]);
                        $updated++;
                    } else {
                        $insertProduct->execute([
                            $barcode, $sku, $name, $category,
                            $purchasePrice, $sellPrice, $stock, $minStock
                        ]);
                        $inserted++;
                    }
                } catch (Throwable $rowError) {
                    $errors[] = [
                        'row' => $excelRow,
                        'message' => $rowError->getMessage()
                    ];
                }
            }

            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        json_response([
            'ok'=>true,
            'processed'=>count($rows),
            'inserted'=>$inserted,
            'updated'=>$updated,
            'failed'=>count($errors),
            'errors'=>$errors
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
        $paymentMethod = strtolower(trim((string)($data['payment_method'] ?? 'cash')));
        if (!in_array($paymentMethod, ['cash','qr'], true)) {
            json_response(['ok'=>false,'message'=>'Metode pembayaran tidak valid'], 422);
        }
        $paid = (float)($data['paid'] ?? 0);
        $qrisSettingId = (int)($data['qris_setting_id'] ?? 0);
        $qrisName = null;

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

        if ($paymentMethod === 'cash') {
            if ($paid < $total) {
                throw new RuntimeException('Uang bayar kurang');
            }
            $qrisSettingId = 0;
            $qrisName = null;
        } else {
            // QR dikonfirmasi kasir setelah pembayaran diterima.
            // Jika client lama belum mengirim ID QRIS, gunakan default aktif.
            if ($qrisSettingId <= 0) {
                $qrisStmt = $pdo->query("
                    SELECT id,name
                    FROM qris_settings
                    WHERE is_active=1
                    ORDER BY is_default DESC, id ASC
                    LIMIT 1
                ");
                $qrisRow = $qrisStmt->fetch();
            } else {
                $qrisStmt = $pdo->prepare("
                    SELECT id,name
                    FROM qris_settings
                    WHERE id=? AND is_active=1
                    LIMIT 1
                ");
                $qrisStmt->execute([$qrisSettingId]);
                $qrisRow = $qrisStmt->fetch();
            }

            if (!$qrisRow) {
                throw new RuntimeException('QRIS yang dipilih tidak tersedia atau sudah nonaktif.');
            }

            $qrisSettingId = (int)$qrisRow['id'];
            $qrisName = (string)$qrisRow['name'];
            $paid = $total;
        }

        $invoice = invoice_no($pdo);
        $change = $paymentMethod === 'cash' ? ($paid - $total) : 0;

        $stmt = $pdo->prepare("
            INSERT INTO sales(
                invoice_no,total,paid,change_amount,
                payment_method,payment_status,paid_at,
                qris_setting_id,qris_name,cashier_id
            )
            VALUES(?,?,?,?,?,'paid',CURRENT_TIMESTAMP,?,?,?)
        ");
        $stmt->execute([
            $invoice,$total,$paid,$change,$paymentMethod,
            $qrisSettingId > 0 ? $qrisSettingId : null,
            $qrisName,
            $user['id']
        ]);
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
            'change'=>$change,
            'payment_method'=>$paymentMethod,
            'payment_status'=>'paid',
            'qris_setting_id'=>$qrisSettingId > 0 ? $qrisSettingId : null,
            'qris_name'=>$qrisName,
            'sale_id'=>$saleId,
            'cashier'=>$user['name'] ?? $user['username'],
            'created_at'=>date('Y-m-d H:i:s')
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
        $month = (string)($_GET['month'] ?? date('Y-m'));
        json_response(monthly_report_data($pdo, $month));
    }

    if ($action === 'report_export') {
        require_menu_permission($pdo, 'report');
        $month = (string)($_GET['month'] ?? date('Y-m'));
        $format = strtolower(trim((string)($_GET['format'] ?? 'pdf')));
        $report = monthly_report_data($pdo, $month);

        if ($format === 'pdf') {
            $binary = build_simple_pdf($report);
            json_response([
                'ok'=>true,
                'file_name'=>branding_file_prefix(app_branding($pdo)['website_name']) . '_Summary_' . $report['month'] . '.pdf',
                'mime_type'=>'application/pdf',
                'base64'=>base64_encode($binary),
            ]);
        }

        if ($format === 'excel' || $format === 'xls') {
            $binary = build_excel_xml($report);
            json_response([
                'ok'=>true,
                'file_name'=>branding_file_prefix(app_branding($pdo)['website_name']) . '_Summary_' . $report['month'] . '.xls',
                'mime_type'=>'application/vnd.ms-excel',
                'base64'=>base64_encode($binary),
            ]);
        }

        json_response(['ok'=>false,'message'=>'Format export tidak didukung.'], 422);
    }

    if ($action === 'finance_list') {
        require_menu_permission($pdo, 'finance');
        $month = validate_month((string)($_GET['month'] ?? date('Y-m')));
        $stmt = $pdo->prepare("
            SELECT f.id, f.trx_date, f.type, f.category, f.description, f.amount,
                   f.created_at, u.name created_by_name
            FROM finance_transactions f
            JOIN users u ON u.id=f.created_by
            WHERE substr(f.trx_date,1,7)=?
            ORDER BY f.trx_date DESC, f.id DESC
        ");
        $stmt->execute([$month]);
        $rows = $stmt->fetchAll();

        $income = 0.0;
        $expense = 0.0;
        foreach ($rows as $row) {
            if ($row['type'] === 'income') $income += (float)$row['amount'];
            if ($row['type'] === 'expense') $expense += (float)$row['amount'];
        }
        json_response(['ok'=>true,'month'=>$month,'income'=>$income,'expense'=>$expense,'net'=>$income-$expense,'data'=>$rows]);
    }

    if ($action === 'finance_create') {
        $user = require_menu_permission($pdo, 'finance');
        $data = input();
        $type = strtolower(trim((string)($data['type'] ?? '')));
        $trxDate = trim((string)($data['trx_date'] ?? date('Y-m-d')));
        $category = trim((string)($data['category'] ?? ''));
        $description = trim((string)($data['description'] ?? ''));
        $amount = (float)($data['amount'] ?? 0);

        if (!in_array($type, ['income','expense'], true)) {
            json_response(['ok'=>false,'message'=>'Jenis transaksi keuangan tidak valid.'], 422);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $trxDate)) {
            json_response(['ok'=>false,'message'=>'Tanggal tidak valid.'], 422);
        }
        if ($description === '' || $amount <= 0) {
            json_response(['ok'=>false,'message'=>'Deskripsi dan nominal wajib diisi.'], 422);
        }

        $stmt = $pdo->prepare("
            INSERT INTO finance_transactions(trx_date,type,category,description,amount,created_by)
            VALUES(?,?,?,?,?,?)
        ");
        $stmt->execute([$trxDate,$type,$category,$description,$amount,$user['id']]);
        json_response(['ok'=>true,'id'=>(int)$pdo->lastInsertId()]);
    }

    if ($action === 'finance_delete') {
        require_admin();
        $data = input();
        $id = (int)($data['id'] ?? 0);
        $pdo->prepare("DELETE FROM finance_transactions WHERE id=?")->execute([$id]);
        json_response(['ok'=>true]);
    }

    if ($action === 'qr_settings') {
        $user = require_auth();
        $canEdit = has_menu_permission($pdo, $user, 'qr-settings');
        $canUseForPayment = has_menu_permission($pdo, $user, 'cart');

        if (!$canEdit && !$canUseForPayment) {
            json_response([
                'ok' => false,
                'message' => 'Anda tidak memiliki autorisasi untuk QRIS.'
            ], 403);
        }

        if ($canEdit) {
            $stmt = $pdo->query("
                SELECT id,name,payload,is_active,is_default,created_at,updated_at
                FROM qris_settings
                ORDER BY is_default DESC, is_active DESC, id ASC
            ");
        } else {
            $stmt = $pdo->query("
                SELECT id,name,payload,is_active,is_default,created_at,updated_at
                FROM qris_settings
                WHERE is_active=1
                ORDER BY is_default DESC, id ASC
            ");
        }

        json_response([
            'ok' => true,
            'data' => $stmt->fetchAll(),
            'can_edit' => $canEdit
        ]);
    }

    if ($action === 'qr_settings_save') {
        require_menu_permission($pdo, 'qr-settings');
        $data = input();

        $id = (int)($data['id'] ?? 0);
        $name = trim((string)($data['name'] ?? ''));
        $payload = trim((string)($data['payload'] ?? ''));
        $isActive = (int)!empty($data['is_active']);
        $isDefault = (int)!empty($data['is_default']);

        if ($name === '') {
            json_response(['ok'=>false,'message'=>'Nama QRIS / Merchant wajib diisi.'], 422);
        }
        if ($payload === '') {
            json_response(['ok'=>false,'message'=>'Payload QR/QRIS wajib diisi.'], 422);
        }

        // QRIS default harus aktif agar dapat dipakai saat pembayaran.
        if ($isDefault === 1) {
            $isActive = 1;
        }

        $pdo->beginTransaction();
        try {
            if ($id > 0) {
                $exists = $pdo->prepare("SELECT id FROM qris_settings WHERE id=?");
                $exists->execute([$id]);
                if (!$exists->fetchColumn()) {
                    throw new RuntimeException('Setting QRIS tidak ditemukan.');
                }

                $stmt = $pdo->prepare("
                    UPDATE qris_settings
                    SET name=?, payload=?, is_active=?, is_default=?, updated_at=CURRENT_TIMESTAMP
                    WHERE id=?
                ");
                $stmt->execute([$name, $payload, $isActive, $isDefault, $id]);
                $savedId = $id;
            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO qris_settings(name,payload,is_active,is_default,created_at,updated_at)
                    VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                ");
                $stmt->execute([$name, $payload, $isActive, $isDefault]);
                $savedId = (int)$pdo->lastInsertId();
            }

            if ($isDefault === 1) {
                $stmt = $pdo->prepare("
                    UPDATE qris_settings
                    SET is_default=CASE WHEN id=? THEN 1 ELSE 0 END,
                        updated_at=CURRENT_TIMESTAMP
                ");
                $stmt->execute([$savedId]);
            } else {
                // Jika tidak ada default aktif, pilih QRIS aktif pertama sebagai default.
                $activeDefaultCount = (int)$pdo->query("
                    SELECT COUNT(*) FROM qris_settings
                    WHERE is_active=1 AND is_default=1
                ")->fetchColumn();

                if ($activeDefaultCount === 0) {
                    $pdo->exec("
                        UPDATE qris_settings
                        SET is_default=1, updated_at=CURRENT_TIMESTAMP
                        WHERE id=(
                            SELECT id FROM qris_settings
                            WHERE is_active=1
                            ORDER BY id ASC
                            LIMIT 1
                        )
                    ");
                }
            }

            // Default tidak boleh menunjuk QRIS nonaktif.
            $pdo->exec("
                UPDATE qris_settings
                SET is_default=0, updated_at=CURRENT_TIMESTAMP
                WHERE is_active=0 AND is_default=1
            ");

            // Cek lagi setelah menonaktifkan QRIS default.
            $activeDefaultCount = (int)$pdo->query("
                SELECT COUNT(*) FROM qris_settings
                WHERE is_active=1 AND is_default=1
            ")->fetchColumn();

            if ($activeDefaultCount === 0) {
                $pdo->exec("
                    UPDATE qris_settings
                    SET is_default=1, updated_at=CURRENT_TIMESTAMP
                    WHERE id=(
                        SELECT id FROM qris_settings
                        WHERE is_active=1
                        ORDER BY id ASC
                        LIMIT 1
                    )
                ");
            }

            $pdo->commit();
            json_response(['ok'=>true,'id'=>$savedId]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    if ($action === 'qr_settings_delete') {
        require_menu_permission($pdo, 'qr-settings');
        $data = input();
        $id = (int)($data['id'] ?? 0);

        if ($id <= 0) {
            json_response(['ok'=>false,'message'=>'ID QRIS tidak valid.'], 422);
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("SELECT is_default FROM qris_settings WHERE id=?");
            $stmt->execute([$id]);
            $existing = $stmt->fetch();

            if (!$existing) {
                throw new RuntimeException('Setting QRIS tidak ditemukan.');
            }

            $pdo->prepare("DELETE FROM qris_settings WHERE id=?")->execute([$id]);

            $activeDefaultCount = (int)$pdo->query("
                SELECT COUNT(*) FROM qris_settings
                WHERE is_active=1 AND is_default=1
            ")->fetchColumn();

            if ($activeDefaultCount === 0) {
                $pdo->exec("
                    UPDATE qris_settings
                    SET is_default=1, updated_at=CURRENT_TIMESTAMP
                    WHERE id=(
                        SELECT id FROM qris_settings
                        WHERE is_active=1
                        ORDER BY id ASC
                        LIMIT 1
                    )
                ");
            }

            $pdo->commit();
            json_response(['ok'=>true]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }


    if ($action === 'users') {
        require_admin();

        $stmt = $pdo->query("
            SELECT id, username, email, name, phone, address, photo_path, role, created_at
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
        $email = normalize_email((string)($data['email'] ?? ''));
        $name = trim((string)($data['name'] ?? ''));
        $phone = trim((string)($data['phone'] ?? ''));
        $address = trim((string)($data['address'] ?? ''));
        $role = normalize_role((string)($data['role'] ?? 'cashier'));
        $password = (string)($data['password'] ?? '');
        $removePhoto = ((string)($data['remove_photo'] ?? '0')) === '1';
        $menusRaw = $data['permissions'] ?? [];
        if (is_string($menusRaw)) {
            $decodedMenus = json_decode($menusRaw, true);
            $menus = is_array($decodedMenus) ? $decodedMenus : [];
        } else {
            $menus = is_array($menusRaw) ? $menusRaw : [];
        }


        if ($username === '') {
            json_response(['ok'=>false,'message'=>'Username wajib diisi.'], 422);
        }

        if ($name === '') {
            json_response(['ok'=>false,'message'=>'Nama user wajib diisi.'], 422);
        }

        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_response(['ok'=>false,'message'=>'Format email tidak valid.'], 422);
        }

        if ($phone !== '' && !preg_match('/^[0-9+()\- .]{6,25}$/', $phone)) {
            json_response(['ok'=>false,'message'=>'Nomor telepon tidak valid.'], 422);
        }
        if (strlen($address) > 500) {
            json_response(['ok'=>false,'message'=>'Alamat maksimal 500 karakter.'], 422);
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

        $newPhoto = null;
        $oldPhoto = null;

        try {
            if (
                isset($_FILES['photo']) &&
                ($_FILES['photo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE
            ) {
                $newPhoto = save_user_photo($_FILES['photo']);
            }

            if ($id > 0) {
                $stmt = $pdo->prepare("SELECT id, role, photo_path FROM users WHERE id=?");
                $stmt->execute([$id]);
                $existing = $stmt->fetch();

                if (!$existing) {
                    if ($newPhoto) delete_user_photo($newPhoto);
                    json_response(['ok'=>false,'message'=>'User tidak ditemukan.'], 404);
                }

                $oldPhoto = $existing['photo_path'] ?? null;

                // Tidak boleh menurunkan role admin terakhir.
                if ($existing['role'] === 'admin' && $role !== 'admin') {
                    $adminCount = (int)$pdo->query(
                        "SELECT COUNT(*) FROM users WHERE role='admin'"
                    )->fetchColumn();

                    if ($adminCount <= 1) {
                        if ($newPhoto) delete_user_photo($newPhoto);
                        json_response([
                            'ok'=>false,
                            'message'=>'Minimal harus ada satu Administrator.'
                        ], 422);
                    }
                }

                $photoPath = $newPhoto ?: ($removePhoto ? null : $oldPhoto);

                if ($password !== '') {
                    $stmt = $pdo->prepare("
                        UPDATE users
                        SET username=?, email=?, name=?, phone=?, address=?, photo_path=?, role=?, password_hash=?
                        WHERE id=?
                    ");
                    $stmt->execute([
                        $username, $email, $name, $phone, $address, $photoPath, $role,
                        password_hash($password, PASSWORD_DEFAULT), $id
                    ]);
                } else {
                    $stmt = $pdo->prepare("
                        UPDATE users
                        SET username=?, email=?, name=?, phone=?, address=?, photo_path=?, role=?
                        WHERE id=?
                    ");
                    $stmt->execute([
                        $username, $email, $name, $phone, $address, $photoPath, $role, $id
                    ]);
                }

                if (($newPhoto || $removePhoto) && $oldPhoto && $oldPhoto !== $photoPath) {
                    delete_user_photo($oldPhoto);
                }

                // Jika admin mengedit dirinya sendiri, refresh session.
                if ($id === (int)$currentAdmin['id']) {
                    $_SESSION['user']['username'] = $username;
                    $_SESSION['user']['email'] = $email;
                    $_SESSION['user']['name'] = $name;
                    $_SESSION['user']['phone'] = $phone;
                    $_SESSION['user']['address'] = $address;
                    $_SESSION['user']['photo_path'] = $photoPath;
                    $_SESSION['user']['role'] = $role;
                }

            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO users(username, email, password_hash, name, phone, address, photo_path, role)
                    VALUES(?,?,?,?,?,?,?,?)
                ");
                $stmt->execute([
                    $username,
                    $email,
                    password_hash($password, PASSWORD_DEFAULT),
                    $name,
                    $phone,
                    $address,
                    $newPhoto,
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
            if ($newPhoto) {
                delete_user_photo($newPhoto);
            }
            if (str_contains(strtolower($e->getMessage()), 'unique')) {
                json_response([
                    'ok'=>false,
                    'message'=>'Username atau email sudah digunakan.'
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

        $stmt = $pdo->prepare("SELECT role, photo_path FROM users WHERE id=?");
        $stmt->execute([$id]);
        $userToDelete = $stmt->fetch();
        $role = $userToDelete['role'] ?? null;
        $photoToDelete = $userToDelete['photo_path'] ?? null;

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
        delete_user_photo($photoToDelete);

        json_response(['ok'=>true]);
    }

    json_response(['ok'=>false,'message'=>'Action tidak dikenal'], 404);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_response(['ok'=>false,'message'=>$e->getMessage()], 500);
}
