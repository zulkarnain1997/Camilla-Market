<?php
declare(strict_types=1);

ob_start();
require __DIR__ . '/index.php';
$html = ob_get_clean();

$enhancement = <<<'HTML'
<script src="assets/js/pos-enhancements.js?v=20260915-pos1"></script>
HTML;

$html = str_replace('</body>', $enhancement . "\n</body>", $html);
echo $html;
