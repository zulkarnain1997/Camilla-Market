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
$userStmt = $pdo->prepare('SELECT id, username, name, role FROM users WHERE id=?');
$userStmt->execute([(int)$_SESSION['user']['id']]);
$user = $userStmt->fetch();
if (!$user) {
    session_destroy();
    respond(['ok'=>false,'message'=>'User tidak ditemukan'], 401);
}

$invoice = trim((string)($_GET['invoice'] ?? ''));
if ($invoice === '') {
    respond(['ok'=>false,'message'=>'Nomor transaksi wajib diisi'], 422);
}

$stmt = $pdo->prepare("SELECT s.*, u.name cashier FROM sales s JOIN users u ON u.id=s.cashier_id WHERE s.invoice_no=? LIMIT 1");
$stmt->execute([$invoice]);
$sale = $stmt->fetch();
if (!$sale) {
    respond(['ok'=>false,'message'=>'Transaksi tidak ditemukan'], 404);
}

$canView = ($user['role'] ?? '') === 'admin' || (int)$sale['cashier_id'] === (int)$user['id'];
if (!$canView) {
    $perm = $pdo->prepare("SELECT COUNT(*) FROM user_menu_permissions WHERE user_id=? AND menu_code='history' AND can_read=1");
    $perm->execute([(int)$user['id']]);
    $canView = (int)$perm->fetchColumn() > 0;
}
if (!$canView) {
    respond(['ok'=>false,'message'=>'Tidak memiliki akses ke struk transaksi ini'], 403);
}

$stmt = $pdo->prepare("
    SELECT si.qty, si.price, si.subtotal, p.name, p.barcode, p.sku
    FROM sale_items si
    JOIN products p ON p.id=si.product_id
    WHERE si.sale_id=?
    ORDER BY si.id
");
$stmt->execute([(int)$sale['id']]);
$items = $stmt->fetchAll();

respond([
    'ok'=>true,
    'sale'=>[
        'id'=>(int)$sale['id'],
        'invoice_no'=>$sale['invoice_no'],
        'total'=>(float)$sale['total'],
        'paid'=>(float)$sale['paid'],
        'change'=>(float)$sale['change_amount'],
        'cashier'=>$sale['cashier'],
        'created_at'=>$sale['created_at'],
    ],
    'items'=>$items,
]);
