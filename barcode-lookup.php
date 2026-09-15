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

$allowed = ($user['role'] ?? '') === 'admin';
if (!$allowed) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_menu_permissions WHERE user_id=? AND menu_code='cart' AND can_read=1");
    $stmt->execute([(int)$user['id']]);
    $allowed = (int)$stmt->fetchColumn() > 0;
}
if (!$allowed) {
    respond(['ok'=>false,'message'=>'Tidak memiliki autorisasi kasir'], 403);
}

$code = trim((string)($_GET['code'] ?? ''));
if ($code === '') {
    respond(['ok'=>false,'message'=>'Barcode kosong'], 422);
}

$stmt = $pdo->prepare('SELECT * FROM products WHERE active=1 AND (barcode=? OR sku=?) LIMIT 1');
$stmt->execute([$code, $code]);
$product = $stmt->fetch();

if (!$product) {
    respond(['ok'=>false,'message'=>'Barcode tidak ditemukan'], 404);
}

respond(['ok'=>true,'product'=>$product]);
