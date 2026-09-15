<?php
declare(strict_types=1);

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// Jangan expose file database atau halaman setup ke internet.
if (
    $uri === '/setup.php' ||
    str_starts_with($uri, '/data/') ||
    preg_match('/\.(?:sqlite|db)$/i', $uri)
) {
    http_response_code(404);
    echo 'Not Found';
    return true;
}

$fullPath = __DIR__ . $uri;

// Biarkan PHP built-in server melayani file yang benar-benar ada
// (termasuk api.php, JS, CSS, gambar, manifest, service worker, dll).
if ($uri !== '/' && is_file($fullPath) && $uri !== '/index.php') {
    return false;
}

if ($uri === '/' || $uri === '/index.php') {
    require __DIR__ . '/enhanced-index.php';
    return true;
}

http_response_code(404);
echo 'Not Found';
return true;
