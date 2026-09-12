<?php
declare(strict_types=1);

if (!function_exists('wikidiff2_do_diff')) {
    fwrite(STDERR, "wikidiff2 extension is not loaded\n");
    exit(2);
}

$raw = stream_get_contents(STDIN);
$payload = json_decode($raw === false ? '' : $raw, true);
if (!is_array($payload)) {
    fwrite(STDERR, "invalid json\n");
    exit(1);
}

$before = str_replace(["\r\n", "\r"], "\n", (string) ($payload['before'] ?? ''));
$after = str_replace(["\r\n", "\r"], "\n", (string) ($payload['after'] ?? ''));
$context = (int) ($payload['context'] ?? 3);
if ($context < 0 || $context > 20) {
    $context = 3;
}

$html = wikidiff2_do_diff($before, $after, $context);
$version = function_exists('wikidiff2_version')
    ? wikidiff2_version()
    : (string) phpversion('wikidiff2');

echo json_encode(
    [
        'engine' => 'wikidiff2',
        'version' => $version,
        'table_html' => $html,
    ],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
