<?php
declare(strict_types=1);
require __DIR__ . '/db.php';
header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

$pdo = db();
$get = static function(string $key, string $default) use ($pdo): string {
    $stmt = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key=?");
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();
    return ($value === false || trim((string)$value) === '') ? $default : (string)$value;
};

$websiteName = $get('website_name', 'Ada Apa Aja');
$appName = $get('app_name', 'Ada Apa Aja POS');
$icon = $get('app_icon', 'files/default-logo.png');
if (in_array($icon, ['assets/default-app-icon.png', 'assets/icon.svg'], true)) {
    $icon = 'files/default-logo.png';
}
$iconPath = __DIR__ . '/' . ltrim($icon, '/');
$iconType = 'image/png';
$sizes = '512x512';

if (is_file($iconPath)) {
    $info = @getimagesize($iconPath);
    if (is_array($info)) {
        if (!empty($info[0]) && !empty($info[1])) {
            $sizes = ((int)$info[0]) . 'x' . ((int)$info[1]);
        }
        if (!empty($info['mime'])) {
            $iconType = (string)$info['mime'];
        }
    }
}

echo json_encode([
    'name' => $appName,
    'short_name' => substr($websiteName, 0, 24),
    'description' => $websiteName . ' Ada Apa Aja POS',
    'start_url' => './',
    'display' => 'standalone',
    'background_color' => '#f4f7f5',
    'theme_color' => '#166534',
    'icons' => [[
        'src' => $icon,
        'sizes' => $sizes,
        'type' => $iconType,
        'purpose' => 'any',
    ]],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
