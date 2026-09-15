<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/db.php';

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (empty($_SESSION['user']['id'])) {
    respond(['ok'=>false,'message'=>'Belum login'], 401);
}

$pdo = db();
$stmt = $pdo->prepare('SELECT id, role FROM users WHERE id=?');
$stmt->execute([(int)$_SESSION['user']['id']]);
$user = $stmt->fetch();

if (!$user) {
    session_destroy();
    respond(['ok'=>false,'message'=>'User tidak ditemukan'], 401);
}
if (($user['role'] ?? '') !== 'admin') {
    respond(['ok'=>false,'message'=>'Upload produk hanya untuk Administrator'], 403);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['ok'=>false,'message'=>'Method tidak diizinkan'], 405);
}
if (!isset($_FILES['file'])) {
    respond(['ok'=>false,'message'=>'File template belum dipilih'], 422);
}

$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    respond(['ok'=>false,'message'=>'Upload file gagal'], 422);
}
if ((int)($file['size'] ?? 0) > 5 * 1024 * 1024) {
    respond(['ok'=>false,'message'=>'Ukuran file maksimal 5 MB'], 422);
}

$tmp = (string)($file['tmp_name'] ?? '');
$handle = fopen($tmp, 'rb');
if (!$handle) {
    respond(['ok'=>false,'message'=>'File tidak dapat dibaca'], 422);
}

$firstLine = fgets($handle);
if ($firstLine === false) {
    fclose($handle);
    respond(['ok'=>false,'message'=>'File kosong'], 422);
}

$firstLine = preg_replace('/^\xEF\xBB\xBF/', '', $firstLine) ?? $firstLine;
$delimiters = [',' => substr_count($firstLine, ','), ';' => substr_count($firstLine, ';'), "\t" => substr_count($firstLine, "\t")];
arsort($delimiters);
$delimiter = (string)array_key_first($delimiters);
if (($delimiters[$delimiter] ?? 0) < 1) $delimiter = ',';

rewind($handle);
$header = fgetcsv($handle, 0, $delimiter);
if (!$header) {
    fclose($handle);
    respond(['ok'=>false,'message'=>'Header template tidak ditemukan'], 422);
}

$normalizeHeader = static function(string $value): string {
    $value = preg_replace('/^\xEF\xBB\xBF/', '', $value) ?? $value;
    $value = strtolower(trim($value));
    $value = str_replace([' ', '-', '.'], '_', $value);
    return $value;
};
$header = array_map($normalizeHeader, $header);

$aliases = [
    'barcode' => ['barcode','bar_code','kode_barcode'],
    'sku' => ['sku','kode','kode_produk','product_code'],
    'name' => ['name','nama','nama_produk','product_name'],
    'category' => ['category','kategori'],
    'purchase_price' => ['purchase_price','harga_beli','buy_price'],
    'sell_price' => ['sell_price','harga_jual','price','harga'],
    'stock' => ['stock','stok','qty'],
    'min_stock' => ['min_stock','minimum_stok','stok_minimum','minimum_stock'],
];

$index = [];
foreach ($aliases as $field => $names) {
    foreach ($names as $name) {
        $pos = array_search($name, $header, true);
        if ($pos !== false) { $index[$field] = (int)$pos; break; }
    }
}
if (!isset($index['name'])) {
    fclose($handle);
    respond(['ok'=>false,'message'=>'Kolom name/nama_produk wajib ada pada template'], 422);
}

$toNumber = static function($value): float {
    $text = trim((string)$value);
    if ($text === '') return 0.0;
    $text = str_replace(['Rp','rp',' '], '', $text);
    if (str_contains($text, ',') && str_contains($text, '.')) {
        $text = str_replace('.', '', $text);
        $text = str_replace(',', '.', $text);
    } elseif (str_contains($text, ',')) {
        $text = str_replace(',', '.', $text);
    }
    return is_numeric($text) ? (float)$text : NAN;
};

$get = static function(array $row, array $index, string $field): string {
    return isset($index[$field]) ? trim((string)($row[$index[$field]] ?? '')) : '';
};

$findBarcode = $pdo->prepare('SELECT id FROM products WHERE barcode=? LIMIT 1');
$findSku = $pdo->prepare('SELECT id FROM products WHERE sku=? LIMIT 1');
$insert = $pdo->prepare('INSERT INTO products(barcode,sku,name,category,purchase_price,sell_price,stock,min_stock,active,updated_at) VALUES(?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP)');
$update = $pdo->prepare('UPDATE products SET barcode=?, sku=?, name=?, category=?, purchase_price=?, sell_price=?, stock=?, min_stock=?, active=1, updated_at=CURRENT_TIMESTAMP WHERE id=?');

$inserted = 0;
$updated = 0;
$skipped = 0;
$errors = [];
$rowNumber = 1;

$pdo->beginTransaction();
try {
    while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
        $rowNumber++;
        if (count(array_filter($row, static fn($v) => trim((string)$v) !== '')) === 0) continue;

        $barcode = $get($row, $index, 'barcode');
        $sku = $get($row, $index, 'sku');
        $name = $get($row, $index, 'name');
        $category = $get($row, $index, 'category');
        $purchase = $toNumber($get($row, $index, 'purchase_price'));
        $sell = $toNumber($get($row, $index, 'sell_price'));
        $stock = $toNumber($get($row, $index, 'stock'));
        $minStock = $toNumber($get($row, $index, 'min_stock'));

        if ($name === '') {
            $skipped++;
            if (count($errors) < 20) $errors[] = "Baris {$rowNumber}: nama produk kosong";
            continue;
        }
        foreach (['harga beli'=>$purchase,'harga jual'=>$sell,'stok'=>$stock,'minimum stok'=>$minStock] as $label=>$num) {
            if (is_nan($num) || $num < 0) {
                $skipped++;
                if (count($errors) < 20) $errors[] = "Baris {$rowNumber}: {$label} tidak valid";
                continue 2;
            }
        }
        if ($barcode === '' && $sku === '') {
            $skipped++;
            if (count($errors) < 20) $errors[] = "Baris {$rowNumber}: barcode atau SKU wajib diisi";
            continue;
        }

        $id = null;
        if ($barcode !== '') {
            $findBarcode->execute([$barcode]);
            $id = $findBarcode->fetchColumn() ?: null;
        }
        if ($id === null && $sku !== '') {
            $findSku->execute([$sku]);
            $id = $findSku->fetchColumn() ?: null;
        }

        try {
            if ($id !== null) {
                $update->execute([$barcode ?: null,$sku ?: null,$name,$category,$purchase,$sell,$stock,$minStock,(int)$id]);
                $updated++;
            } else {
                $insert->execute([$barcode ?: null,$sku ?: null,$name,$category,$purchase,$sell,$stock,$minStock]);
                $inserted++;
            }
        } catch (PDOException $e) {
            $skipped++;
            if (count($errors) < 20) $errors[] = "Baris {$rowNumber}: barcode/SKU sudah dipakai produk lain";
        }
    }
    fclose($handle);
    $pdo->commit();
} catch (Throwable $e) {
    fclose($handle);
    if ($pdo->inTransaction()) $pdo->rollBack();
    respond(['ok'=>false,'message'=>$e->getMessage()], 500);
}

respond([
    'ok'=>true,
    'inserted'=>$inserted,
    'updated'=>$updated,
    'skipped'=>$skipped,
    'errors'=>$errors,
    'message'=>"Import selesai: {$inserted} produk baru, {$updated} diperbarui, {$skipped} dilewati."
]);
